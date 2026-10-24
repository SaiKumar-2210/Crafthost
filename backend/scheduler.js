/**
 * scheduler.js — CraftHost Scheduler Worker
 * 
 * Separate Node.js process that consumes BullMQ jobs for:
 *   - deploy-server: Placement algorithm → provision/start VM → deploy to daemon
 *   - stop-server:   Stop server → auto-deallocate idle VM
 *   - delete-server: Kill process → delete files → cleanup DB
 *   - check-idle-vms: Recurring job to deallocate idle VMs
 * 
 * Run with: node scheduler.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Worker } = require('bullmq');
const { redisConnection, reaperQueue } = require('./queues');
const { connectDB, VMNode, GameServer, DeployJob, ServerPermission } = require('./db');
const {
  isAwsConfigured,
  startAwsVM,
  deallocateAwsVM,
  getAwsVMPublicIP,
} = require('./aws-provisioner');

const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const DAEMON_SECRET = process.env.DAEMON_SECRET;
if (!DAEMON_SECRET) throw new Error('DAEMON_SECRET must be set before starting the scheduler.');
const AUTO_STOP_IDLE_SERVERS = process.env.AUTO_STOP_IDLE_SERVERS !== 'false';
const AUTO_STOP_IDLE_EC2 = process.env.AUTO_STOP_IDLE_EC2 === 'true';
const EMPTY_SERVER_STOP_MS = 10 * 60 * 1000;
const EMPTY_INSTANCE_STOP_MS = 5 * 60 * 1000;

// --- Helpers ---

async function updateJob(jobId, fields) {
  try {
    await DeployJob.findOneAndUpdate({ jobId: String(jobId) }, fields);
  } catch (err) {
    console.error(`[Scheduler] Failed to update job ${jobId}:`, err.message);
  }
}

async function daemonRequest(ip, method, path, body, timeoutMs = 5000) {
  const url = `http://${ip}:4000${path}`;
  const opts = {
    method,
    headers: { 'x-daemon-secret': DAEMON_SECRET },
    signal: AbortSignal.timeout(timeoutMs),
  };
  if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  try {
    return await fetch(url, opts);
  } catch (err) {
    if (err.name === 'AbortError' || err.name === 'TimeoutError') {
      throw new Error(`Timed out waiting for the VM daemon at ${ip} after ${Math.ceil(timeoutMs / 1000)} seconds.`);
    }
    throw err;
  }
}

async function waitForIP(vmName, region, instanceId, maxAttempts = 15, intervalMs = 4000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await new Promise(r => setTimeout(r, intervalMs));
    const ip = await getAwsVMPublicIP(vmName, region, instanceId);
    if (ip) return ip;
    console.log(`[Scheduler] Waiting for IP (attempt ${attempt}/${maxAttempts})...`);
  }
  return null;
}

async function waitForDaemon(ip, maxAttempts = 24, intervalMs = 5000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await daemonRequest(ip, 'GET', '/api/daemon/status');
      if (response.ok) return true;
    } catch {
      // The EC2 may still be booting; retry until the readiness window expires.
    }
    if (attempt < maxAttempts) await new Promise(r => setTimeout(r, intervalMs));
  }
  return false;
}

// --- Placement Algorithm (Static VMs Only) ---

async function findVM(region, jobId) {
  // 1. Find a running VM with available capacity (bin-pack: fill existing first)
  let vm = await VMNode.findOne({
    region,
    status: 'running',
    $expr: { $lt: ['$activeServersCount', '$maxServers'] }
  }).sort({ activeServersCount: 1 });

  if (vm) {
    console.log(`[Scheduler] Found running VM with capacity: ${vm.vmName} (${vm.activeServersCount}/${vm.maxServers})`);
    await updateJob(jobId, { message: `Using VM ${vm.vmName}`, progress: 65 });
    return vm;
  }

  // 2. Find an unhealthy VM with capacity — attempt recovery
  //    VMs get marked 'unhealthy' when heartbeats are missed, but they may still be running.
  vm = await VMNode.findOne({
    region,
    status: 'unhealthy',
    $expr: { $lt: ['$activeServersCount', '$maxServers'] }
  }).sort({ activeServersCount: 1 });

  if (vm) {
    console.log(`[Scheduler] Found unhealthy VM with capacity: ${vm.vmName} — attempting recovery...`);
    await updateJob(jobId, { status: 'starting_vm', progress: 25, message: `Recovering VM ${vm.vmName}...` });

    // Try to resolve its IP and reach the daemon
    const resolvedIp = await waitForIP(vm.vmName, region, vm.instanceId, 5, 3000);
    if (resolvedIp) {
      vm.ip = resolvedIp;
      vm.status = 'running';
      vm.lastHeartbeat = new Date();
      await vm.save();
      console.log(`[Scheduler] ✅ VM ${vm.vmName} recovered at ${resolvedIp}`);
      await updateJob(jobId, { message: `Using recovered VM ${vm.vmName}`, progress: 65 });
      return vm;
    }

    // IP not available — try restarting the VM
    console.log(`[Scheduler] Could not reach ${vm.vmName}, attempting restart...`);
    if (isAwsConfigured) {
      try {
        await startAwsVM(vm.vmName, region, vm.instanceId);
        vm.status = 'starting';
        await vm.save();

        const ip = await waitForIP(vm.vmName, region, vm.instanceId, 30);
        if (ip) {
          vm.ip = ip;
          vm.status = 'running';
          vm.lastHeartbeat = new Date();
          await vm.save();
          await updateJob(jobId, { progress: 55, message: 'VM restarted, waiting for daemon...' });
          await new Promise(r => setTimeout(r, 10000));
          return vm;
        }
      } catch (err) {
        console.error(`[Scheduler] Failed to restart unhealthy VM ${vm.vmName}:`, err.message);
      }
    }
  }

  // 3. Find a deallocated VM to restart
  vm = await VMNode.findOne({ region, status: 'deallocated' });
  if (vm) {
    console.log(`[Scheduler] Found deallocated VM to restart: ${vm.vmName}`);
    await updateJob(jobId, { status: 'starting_vm', progress: 30, message: `Starting VM ${vm.vmName}...` });

    if (!isAwsConfigured) {
      throw new Error(`VM ${vm.vmName} is stopped. Configure AWS instance management on the control plane before requesting it.`);
    }
    try {
      if (!vm.instanceId) throw new Error(`VM ${vm.vmName} has no registered EC2 instance ID.`);
      await startAwsVM(vm.vmName, region, vm.instanceId);
    } catch (err) {
      const isNotFound = err.name === 'InvalidInstanceID.NotFound' ||
                         (err.message || '').toLowerCase().includes('not found');
      if (isNotFound) {
        console.warn(`[Scheduler] Ghost VM: ${vm.vmName} not found in AWS. Removing stale record.`);
        await VMNode.deleteOne({ _id: vm._id });
        vm = null;
      } else {
        throw err;
      }
    }

    if (vm) {
      vm.status = 'starting';
      await vm.save();

      const resolvedIp = await waitForIP(vm.vmName, region, vm.instanceId, 30);
      if (!resolvedIp) {
        throw new Error(`Failed to resolve IP for VM ${vm.vmName} after restarting.`);
      }
      vm.ip = resolvedIp;
      vm.status = 'starting';
      vm.lastHeartbeat = new Date();
      await vm.save();

      const daemonReady = await waitForDaemon(resolvedIp);
      if (!daemonReady) {
        vm.status = 'unhealthy';
        await vm.save();
        throw new Error(`EC2 ${vm.vmName} started, but its daemon did not become reachable in time.`);
      }
      vm.status = 'running';
      vm.lastHeartbeat = new Date();
      await vm.save();

      await updateJob(jobId, { progress: 55, message: 'VM started, waiting for daemon...' });
      return vm;
    }
  }

  // 4. No VM available — wait for daemon heartbeat to auto-register
  console.log(`[Scheduler] No VM record found for ${region}. Waiting for daemon heartbeat to register...`);
  await updateJob(jobId, { status: 'starting_vm', progress: 15, message: `Waiting for Node VM to come online in ${region}...` });

  // Poll for up to 30 seconds (6 attempts × 5s) for the daemon's self-healing heartbeat to create the record
  for (let attempt = 1; attempt <= 6; attempt++) {
    await new Promise(r => setTimeout(r, 5000));
    const freshVM = await VMNode.findOne({
      region,
      status: 'running',
      $expr: { $lt: ['$activeServersCount', '$maxServers'] }
    });
    if (freshVM) {
      console.log(`[Scheduler] ✅ VM ${freshVM.vmName} appeared after ${attempt * 5}s wait.`);
      await updateJob(jobId, { message: `Using VM ${freshVM.vmName}`, progress: 65 });
      return freshVM;
    }
    console.log(`[Scheduler] Still waiting for VM in ${region} (attempt ${attempt}/6)...`);
    await updateJob(jobId, { message: `Waiting for Node VM in ${region}... (${attempt * 5}s)` });
  }

  // After 30s, check what we have and give a useful error
  const allInRegion = await VMNode.find({ region });
  if (allInRegion.length > 0) {
    const statuses = allInRegion.map(v => `${v.vmName}(${v.status}, ${v.activeServersCount}/${v.maxServers})`);
    const atCapacity = allInRegion.filter(v => v.activeServersCount >= v.maxServers);

    if (atCapacity.length === allInRegion.length) {
      throw new Error(
        `All VMs in ${region} are at full capacity. ` +
        `Wait for existing servers to be removed or contact admin.`
      );
    }
    throw new Error(
      `VMs in ${region} are not ready: ${statuses.join(', ')}. ` +
      `The Node VM may still be booting. Please try again in a minute.`
    );
  }
  throw new Error(
    `No Node VM is online for region "${region}". ` +
    `Please ensure the daemon is running on the worker node. ` +
    `Available regions: ${(await VMNode.distinct('region')).join(', ') || 'none'}`
  );
}

// --- Job Processors ---

async function processDeployServer(job) {
  const { userId, name, region, versionType, versionNumber } = job.data;
  // Use a deterministic serverId based on jobId so retries don't create duplicate servers
  const serverId = 'srv-' + String(job.id).padStart(5, '0');
  const jobId = String(job.id);

  console.log(`[Scheduler] Processing deploy-server job ${jobId}: "${name}" in ${region}`);

  // --- Auto-cleanup: Remove servers stuck in provisioning for >2 minutes ---
  const staleProvisioningCutoff = new Date(Date.now() - 2 * 60 * 1000);
  const staleServers = await GameServer.find({
    ownerId: userId,
    status: { $in: ['queued', 'provisioning', 'deploying'] },
    updatedAt: { $lt: staleProvisioningCutoff }
  });
  if (staleServers.length > 0) {
    const staleIds = staleServers.map(s => s.serverId);
    console.log(`[Scheduler] 🧹 Cleaning up ${staleServers.length} stuck server(s): ${staleIds.join(', ')}`);
    await GameServer.deleteMany({ serverId: { $in: staleIds } });
    // Also clean up their deploy job records
    const staleJobIds = staleServers.map(s => s.deployJobId).filter(Boolean);
    if (staleJobIds.length > 0) {
      await DeployJob.deleteMany({ jobId: { $in: staleJobIds } });
    }
  }

  // Create or update tracking records (safe against retries)
  await DeployJob.findOneAndUpdate(
    { jobId },
    {
      type: 'deploy',
      userId,
      serverId,
      region,
      status: 'queued',
      progress: 5,
      message: 'Server queued for deployment',
    },
    { upsert: true, returnDocument: 'after' }
  );

  await GameServer.findOneAndUpdate(
    { serverId },
    {
      name,
      ownerId: userId,
      region,
      versionType: versionType || 'Paper',
      versionNumber: versionNumber || '1.21.11',
      status: 'queued',
      deployJobId: jobId,
      noPlayersSince: null,
    },
    { upsert: true, returnDocument: 'after' }
  );

  try {
    // Run placement algorithm
    await updateJob(jobId, { progress: 10, message: 'Finding available VM...' });
    const vm = await findVM(region, jobId);

    // Deploy to daemon
    await updateJob(jobId, { status: 'deploying_server', progress: 75, message: 'Deploying Minecraft server...' });

    const daemonRes = await daemonRequest(vm.ip, 'POST', '/api/daemon/deploy', {
      id: serverId,
      name: name || 'New Server',
      ownerId: userId,
      versionType: versionType || 'Paper',
      versionNumber: versionNumber || '1.21.11',
      publicIp: vm.ip,
      node: region,
    }, 30000);

    if (!daemonRes.ok) {
      const errText = await daemonRes.text();
      throw new Error(`Daemon deploy failed: ${errText}`);
    }

    const daemonData = await daemonRes.json();

    // Update GameServer with final data
    await GameServer.findOneAndUpdate(
      { serverId },
      {
        vmNodeId: vm._id,
        vmName: vm.vmName,
        ip: vm.ip,
        port: daemonData.server?.port || null,
        status: 'offline',
        node: region,
      }
    );

    // Increment active servers count on VM
    await VMNode.findByIdAndUpdate(vm._id, { $inc: { activeServersCount: 1 } });

    // Mark job as completed
    await updateJob(jobId, {
      status: 'completed',
      progress: 100,
      message: 'Server deployed successfully!',
      result: {
        serverId,
        name,
        ip: vm.ip,
        port: daemonData.server?.port,
        region,
        vmName: vm.vmName,
      },
    });

    console.log(`[Scheduler] ✅ Deploy job ${jobId} completed: ${serverId} on ${vm.vmName}`);
    return { serverId, vmName: vm.vmName };

  } catch (err) {
    console.error(`[Scheduler] ❌ Deploy job ${jobId} failed:`, err.message);
    await updateJob(jobId, {
      status: 'failed',
      message: 'Deployment failed',
      error: err.message,
    });
    await GameServer.findOneAndUpdate({ serverId }, { status: 'error' });
    throw err;
  }
}

async function processStopServer(job) {
  const { serverId, userId } = job.data;
  console.log(`[Scheduler] Processing stop-server job for ${serverId}`);

  const gs = await GameServer.findOne({ serverId });
  if (!gs) {
    console.warn(`[Scheduler] Server ${serverId} not found for stop.`);
    return;
  }

  const vmNode = gs.vmName ? await VMNode.findOne({ vmName: gs.vmName }) : null;
  if (!vmNode || !vmNode.ip) {
    console.warn(`[Scheduler] No VM found for server ${serverId}. Updating status only.`);
    await GameServer.updateOne({ serverId }, { status: 'offline' });
    return;
  }

  try {
    await daemonRequest(vmNode.ip, 'POST', `/api/daemon/power/${serverId}`, { action: 'stop' });
    await GameServer.updateOne({ serverId }, { status: 'offline', noPlayersSince: null });
  } catch (err) {
    console.error(`[Scheduler] Stop command failed for ${serverId}:`, err.message);
  }
}

async function processDeleteServer(job) {
  const { serverId, userId } = job.data;
  console.log(`[Scheduler] Processing delete-server job for ${serverId}`);

  const gs = await GameServer.findOne({ serverId });
  if (!gs) {
    console.warn(`[Scheduler] Server ${serverId} not found for deletion.`);
    return;
  }

  const vmNode = gs.vmName ? await VMNode.findOne({ vmName: gs.vmName }) : null;

  // 1. Force kill the server process (attempt even for unhealthy VMs — they may still be reachable)
  if (vmNode && vmNode.ip) {
    try {
      await daemonRequest(vmNode.ip, 'POST', `/api/daemon/power/${serverId}`, { action: 'kill' });
      await new Promise(r => setTimeout(r, 2000));
    } catch (e) {
      console.warn(`[Scheduler] Could not kill ${serverId} on ${vmNode.vmName}: ${e.message}`);
    }

    // 2. Delete server files on the VM
    try {
      await daemonRequest(vmNode.ip, 'DELETE', `/api/daemon/files/${serverId}?path=/`);
    } catch (e) {
      console.warn(`[Scheduler] Could not delete files for ${serverId}: ${e.message}`);
    }
  }

  // 3. Clear sharing permissions
  await ServerPermission.deleteMany({ serverId });

  // 4. Delete GameServer record
  await GameServer.deleteOne({ serverId });

  // 5. Decrement VM server count. Instance shutdown is handled by the timed idle reaper.
  if (vmNode && vmNode.activeServersCount > 0) {
    vmNode.activeServersCount = Math.max(0, vmNode.activeServersCount - 1);
    await vmNode.save();
  }

  console.log(`[Scheduler] ✅ Server ${serverId} deleted successfully.`);
}

// --- Idle VM Reaper ---

async function processIdleReaper() {
  console.log('[Reaper] Checking player-idle servers and idle EC2 nodes...');
  const now = Date.now();

  if (AUTO_STOP_IDLE_SERVERS) {
    const onlineServers = await GameServer.find({ status: 'online', vmName: { $exists: true, $ne: '' } });
    for (const gameServer of onlineServers) {
      try {
        const vm = await VMNode.findOne({ vmName: gameServer.vmName });
        if (!vm || vm.status !== 'running' || !vm.ip || !vm.runningServerIds.includes(gameServer.serverId)) {
          if (gameServer.noPlayersSince) {
            gameServer.noPlayersSince = null;
            await gameServer.save();
          }
          continue;
        }

        const response = await fetch(
          `http://${vm.ip}:4000/api/daemon/players/${encodeURIComponent(gameServer.serverId)}`,
          { headers: { 'x-daemon-secret': DAEMON_SECRET }, signal: AbortSignal.timeout(5000) }
        );
        if (!response.ok) throw new Error(`Player query returned HTTP ${response.status}`);
        const data = await response.json();
        if (!Array.isArray(data.players)) throw new Error('Player query returned an invalid response');

        if (data.players.length > 0) {
          if (gameServer.noPlayersSince) {
            gameServer.noPlayersSince = null;
            await gameServer.save();
          }
          continue;
        }

        if (!gameServer.noPlayersSince) {
          gameServer.noPlayersSince = new Date(now);
          await gameServer.save();
          continue;
        }

        if (now - gameServer.noPlayersSince.getTime() >= EMPTY_SERVER_STOP_MS) {
          console.log(`[Reaper] ${gameServer.serverId} has had no online players for 10 minutes; stopping it.`);
          await processStopServer({ data: { serverId: gameServer.serverId } });
        }
      } catch (err) {
        // Do not stop a server based on stale/failed player data. Require a fresh,
        // continuous period of successful empty-player checks before stopping it.
        if (gameServer.noPlayersSince) {
          gameServer.noPlayersSince = null;
          await gameServer.save().catch(() => {});
        }
        console.warn(`[Reaper] Player-idle check failed for ${gameServer.serverId}:`, err.message);
      }
    }
  }

  const staleThreshold = new Date(now - 40_000); // daemon heartbeat cadence is 10 seconds
  const unhealthyResult = await VMNode.updateMany(
    {
      status: 'running',
      lastHeartbeat: { $lt: staleThreshold, $ne: null },
      updatedAt: { $lt: new Date(now - 120_000) },
    },
    { status: 'unhealthy' }
  );
  if (unhealthyResult.modifiedCount > 0) {
    console.log(`[Reaper] Marked ${unhealthyResult.modifiedCount} VM(s) unhealthy after missed heartbeats.`);
  }

  if (!AUTO_STOP_IDLE_EC2) return;
  if (!isAwsConfigured) {
    console.warn('[Reaper] EC2 idle stop is enabled but AWS credentials/instance profile are not configured.');
    return;
  }

  const busyVmNames = await GameServer.distinct('vmName', {
    status: { $in: ['queued', 'provisioning', 'deploying', 'online'] },
    vmName: { $exists: true, $ne: '' },
  });
  const idleVMs = await VMNode.find({
    status: 'running',
    runningServerIds: { $size: 0 },
    noServersSince: { $lte: new Date(now - EMPTY_INSTANCE_STOP_MS) },
    lastHeartbeat: { $gte: staleThreshold },
  });

  for (const vm of idleVMs) {
    if (busyVmNames.includes(vm.vmName)) continue;
    try {
      console.log(`[Reaper] ${vm.vmName} has had no running servers for 5 minutes; stopping its EC2 instance.`);
      await deallocateAwsVM(vm.vmName, vm.region, vm.instanceId);
      vm.status = 'deallocated';
      vm.activeServersCount = 0;
      vm.noServersSince = null;
      await vm.save();
      console.log(`[Reaper] ✅ EC2 for ${vm.vmName} stopped.`);
    } catch (err) {
      console.error(`[Reaper] Failed to stop EC2 for ${vm.vmName}:`, err.message);
    }
  }
}

// --- Main ---

async function main() {
  await connectDB();
  console.log('⚡ CraftHost Scheduler Worker starting...');

  // --- Orchestration Worker ---
  const orchestrationWorker = new Worker(
    'crafthost-orchestration',
    async (job) => {
      switch (job.name) {
        case 'deploy-server':
          return await processDeployServer(job);
        case 'stop-server':
          return await processStopServer(job);
        case 'delete-server':
          return await processDeleteServer(job);
        default:
          console.warn(`[Scheduler] Unknown job type: ${job.name}`);
      }
    },
    {
      connection: redisConnection,
      concurrency: 3,  // Process up to 3 jobs concurrently
    }
  );

  orchestrationWorker.on('completed', (job) => {
    console.log(`[Scheduler] Job ${job.id} (${job.name}) completed.`);
  });

  orchestrationWorker.on('failed', (job, err) => {
    console.error(`[Scheduler] Job ${job?.id} (${job?.name}) failed:`, err.message);
  });

  orchestrationWorker.on('error', (err) => {
    console.error('[Scheduler] Worker error:', err.message);
  });

  // --- Idle Reaper Worker ---
  const reaperWorker = new Worker(
    'crafthost-reaper',
    async () => {
      await processIdleReaper();
    },
    {
      connection: redisConnection,
      concurrency: 1,
    }
  );

  // Replace older idle-check schedules so the timers are checked at one-minute
  // resolution without leaving a duplicate five-minute repeat job.
  const repeatJobs = await reaperQueue.getRepeatableJobs();
  for (const repeatJob of repeatJobs) {
    if (repeatJob.name === 'check-idle-vms') {
      await reaperQueue.removeRepeatableByKey(repeatJob.key);
    }
  }
  await reaperQueue.add('check-idle-vms', {}, {
    repeat: { every: 60 * 1000 },
    jobId: 'idle-reaper-every-minute',
  });

  reaperWorker.on('completed', () => {
    console.log('[Reaper] Idle check completed.');
  });

  reaperWorker.on('failed', (job, err) => {
    console.error('[Reaper] Idle check failed:', err.message);
  });

  console.log('⚡ CraftHost Scheduler Worker started. Listening for jobs...');
  console.log('   Orchestration queue: crafthost-orchestration (concurrency: 3)');
  console.log('   Reaper queue: crafthost-reaper (every minute)');

  // --- Graceful Shutdown ---
  const shutdown = async (signal) => {
    console.log(`\n[Scheduler] ${signal} received. Shutting down gracefully...`);
    await orchestrationWorker.close();
    await reaperWorker.close();
    console.log('[Scheduler] Workers closed. Exiting.');
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[Scheduler] Fatal startup error:', err);
  process.exit(1);
});
