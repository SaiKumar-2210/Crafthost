/**
 * control.js — CraftHost Control Plane (API Gateway)
 * 
 * Thin API layer that:
 *   - Handles user auth & RBAC
 *   - Enqueues jobs to BullMQ (deploy, delete)
 *   - Receives daemon heartbeats & registration
 *   - Proxies live commands to daemons (power, stats, files, etc.)
 *   - Serves the frontend build
 * 
 * Run with: node control.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const ioClient = require('socket.io-client');
const path = require('path');
const fs = require('fs');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const { connectDB, User, ServerPermission, VMNode, GameServer, DeployJob } = require('./db');
const { router: authRouter, protect } = require('./routes/auth');
const { orchestrationQueue } = require('./queues');
const {
  isAwsConfigured,
  startAwsVM,
  getAwsVMPublicIP,
  SAFE_REGION_METADATA,
  ALLOWED_REGIONS,
} = require('./aws-provisioner');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(cors());
app.use(express.json());
connectDB();
app.use('/api/auth', authRouter);

const DAEMON_SECRET = process.env.DAEMON_SECRET || 'crafthost-internal-node-secret';

// Region → public hostname mapping for player-facing connection addresses
const REGION_HOSTNAMES = {
  centralindia: process.env.HOSTNAME_INDIA || 'in.crafthost.saikumar.co.in',
  koreacentral: process.env.HOSTNAME_KOREA || 'kr.crafthost.saikumar.co.in',
};
const getPublicHostname = (region) => REGION_HOSTNAMES[region] || null;

// --- Middleware ---

const requireSystemSecret = (req, res, next) => {
  const secret = req.headers['x-daemon-secret'];
  if (secret !== DAEMON_SECRET) return res.status(403).json({ error: 'Unauthorized System Access' });
  next();
};

// RBAC: check server access via MongoDB (replaces filesystem-based check)
const checkServerAccess = async (req, res, next) => {
  const { id } = req.params;

  const gameServer = await GameServer.findOne({ serverId: id });
  if (!gameServer) {
    return res.status(404).json({ error: 'Server not found' });
  }

  req.gameServer = gameServer;

  // 1. Is Owner?
  if (gameServer.ownerId.toString() === req.user._id.toString()) {
    req.serverRole = 'owner';
    return next();
  }

  // 2. Has Shared Permission?
  const perm = await ServerPermission.findOne({ serverId: id, userId: req.user._id });
  if (perm) {
    req.serverRole = perm.role; // 'on_off' or 'full'
    return next();
  }

  return res.status(403).json({ error: 'Access denied: You do not have permission for this server.' });
};

const requireFullAccess = (req, res, next) => {
  if (req.serverRole !== 'owner' && req.serverRole !== 'full') {
    return res.status(403).json({ error: 'Full access required' });
  }
  next();
};

const checkAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied: Admin role required.' });
  }
  next();
};

// =============================================
//  ADMIN ROUTES
// =============================================

app.get('/api/admin/vms', protect, checkAdmin, async (req, res) => {
  try {
    const vms = await VMNode.find().sort({ region: 1, vmIndex: 1 });
    // Also fetch total game servers to show capacity
    const servers = await GameServer.find();
    
    res.json({
      vms: vms.map(vm => {
        // Calculate how many deployed servers are assigned to this VM
        const assignedServers = servers.filter(s => s.region === vm.region && s.vmName === vm.vmName);
        return {
          id: vm._id,
          vmName: vm.vmName,
          region: vm.region,
          ip: vm.ip,
          status: vm.status,
          cpuPercent: vm.cpuPercent,
          ramUsedMB: vm.ramUsedMB,
          runningServers: vm.runningServerIds.length,
          deployedServers: assignedServers.length,
          maxServers: vm.maxServers,
          lastHeartbeat: vm.lastHeartbeat,
        };
      })
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Helper: Get daemon URL from GameServer record ---
const getNodeUrl = async (gameServer) => {
  if (!gameServer || !gameServer.vmName) return 'http://localhost:4000';
  const vmNode = await VMNode.findOne({ vmName: gameServer.vmName });
  // Resolve IP for any VM that has one — even 'unhealthy' VMs are reachable,
  // they just missed heartbeats. Only deallocated VMs truly have no IP.
  if (vmNode && vmNode.ip && vmNode.status !== 'deallocated') {
    return `http://${vmNode.ip}:4000`;
  }
  return 'http://localhost:4000';
};

// --- Proxy helper ---
const proxyToDaemon = async (req, res, method, endpoint, body) => {
  const nodeUrl = await getNodeUrl(req.gameServer);
  try {
    const opts = { method, headers: { 'x-daemon-secret': DAEMON_SECRET } };
    if (body) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const dRes = await fetch(`${nodeUrl}${endpoint}`, opts);
    const data = await dRes.json();
    res.status(dRes.status).json(data);
  } catch (e) {
    res.status(500).json({ error: 'Daemon communication failed: ' + e.message });
  }
};

// =============================================
//  ORCHESTRATION APIs
// =============================================

// 1. Get All Servers (MongoDB-based)
app.get('/api/servers', protect, async (req, res) => {
  try {
    const sharedPerms = await ServerPermission.find({ userId: req.user._id });
    const sharedServerIds = sharedPerms.map(p => p.serverId);

    const gameServers = await GameServer.find({
      $or: [
        { ownerId: req.user._id },
        { serverId: { $in: sharedServerIds } }
      ]
    });

    // Cache VMNode lookups to avoid repeated DB queries
    const vmNodeCache = {};
    const servers = [];

    for (const gs of gameServers) {
      // Get VMNode for this server
      if (gs.vmName && !vmNodeCache[gs.vmName]) {
        vmNodeCache[gs.vmName] = await VMNode.findOne({ vmName: gs.vmName });
      }
      const vmNode = gs.vmName ? vmNodeCache[gs.vmName] : null;

      // Determine live status: prefer heartbeat ground truth, then trust DB status
      const isRunning = vmNode?.runningServerIds?.includes(gs.serverId) || false;
      let status;
      if (isRunning) {
        status = 'online';
      } else if (['queued', 'provisioning', 'deploying', 'online'].includes(gs.status)) {
        // Trust the DB status — 'online' is set by the power action and will be
        // corrected to 'offline' by the next heartbeat if the server isn't actually running.
        status = gs.status;
      } else {
        status = 'offline';
      }

      // Build uptime string (basic; the ServerPanel fetches detailed stats from daemon)
      let uptime = '0m';

      const isOwner = gs.ownerId.toString() === req.user._id.toString();
      const isShared = sharedServerIds.includes(gs.serverId);
      const pRecord = isShared ? sharedPerms.find(p => p.serverId === gs.serverId) : null;

      servers.push({
        id: gs.serverId,
        name: gs.name,
        status,
        ip: gs.ip || vmNode?.ip,
        hostname: getPublicHostname(gs.region),
        port: gs.port,
        version: `${gs.versionType} ${gs.versionNumber}`,
        versionType: gs.versionType,
        versionNumber: gs.versionNumber,
        node: gs.region,
        awsLocation: gs.region,
        ownerId: gs.ownerId.toString(),
        uptime,
        players: '0/20',
        sharedRole: pRecord?.role || undefined,
      });
    }

    res.json({ servers });
  } catch (e) {
    res.status(500).json({ error: 'Control Plane failed: ' + e.message });
  }
});

// 2. Deploy Server (Async — enqueue job, return 202)
app.post('/api/servers/deploy', protect, async (req, res) => {
  const { name, awsLocation, versionType = 'Paper', versionNumber = '1.21.11' } = req.body;

  // Validate region — reject immediately if not in allowed list
  if (!awsLocation || !ALLOWED_REGIONS.includes(awsLocation)) {
    const allowed = ALLOWED_REGIONS.join(', ');
    return res.status(400).json({
      error: `Invalid region "${awsLocation || 'none'}". Allowed regions: ${allowed}`
    });
  }

  try {
    // Enforce Max Servers Limit (5 per user)
    const userServersCount = await GameServer.countDocuments({ ownerId: req.user._id });
    if (userServersCount >= 5) {
      return res.status(403).json({ error: 'Billing Plan Limit: Max 5 servers allowed.' });
    }

    // Enqueue deploy job to BullMQ
    const job = await orchestrationQueue.add('deploy-server', {
      userId: req.user._id.toString(),
      name: name || 'New SMP Server',
      region: awsLocation,
      versionType,
      versionNumber,
    });

    console.log(`[Control] Deploy job ${job.id} queued for user ${req.user._id} in ${awsLocation}`);

    res.status(202).json({
      jobId: job.id,
      message: 'Server deployment queued. Track progress via /api/jobs/' + job.id,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to queue deployment: ' + error.message });
  }
});

// 3. Power Action (Direct proxy — VM start handled inline for responsiveness)
app.post('/api/servers/:id/power', protect, checkServerAccess, async (req, res) => {
  const { id } = req.params;
  const { action } = req.body;
  const gs = req.gameServer;

  try {
    const vmNode = gs.vmName ? await VMNode.findOne({ vmName: gs.vmName }) : null;

    // If starting and VM is deallocated, boot it first
    if (action === 'start' && vmNode && isAwsConfigured) {
      if (vmNode.status === 'deallocated' || vmNode.status === 'unhealthy') {
        console.log(`[Control] Starting deallocated VM ${vmNode.vmName} for server ${id}...`);
        io.to(`server-${id}`).emit('console-log', `\r\n[System] VM is offline. Booting AWS VM '${vmNode.vmName}'... This will take ~45 seconds.\r\n`);
        
        await startAwsVM(vmNode.vmName, vmNode.region);
        vmNode.status = 'starting';
        await vmNode.save();
        io.to(`server-${id}`).emit('console-log', `[System] VM successfully started in AWS. Waiting for public IP allocation...\r\n`);

        // Wait for IP
        let resolvedIp = null;
        for (let attempt = 1; attempt <= 10; attempt++) {
          await new Promise(r => setTimeout(r, 4000));
          resolvedIp = await getAwsVMPublicIP(vmNode.vmName, vmNode.region);
          if (resolvedIp) break;
        }
        if (!resolvedIp) {
          io.to(`server-${id}`).emit('console-log', `[System] FATAL: Failed to resolve VM IP after restarting.\r\n`);
          return res.status(500).json({ error: 'Failed to resolve VM IP after restarting.' });
        }
        vmNode.ip = resolvedIp;
        vmNode.status = 'running';
        await vmNode.save();
        
        io.to(`server-${id}`).emit('console-log', `[System] VM IP assigned (${resolvedIp}). Waiting for daemon to start...\r\n`);

        // Update GameServer IP
        gs.ip = resolvedIp;
        await gs.save();

        // Wait for daemon to boot
        await new Promise(r => setTimeout(r, 5000));
        io.to(`server-${id}`).emit('console-log', `[System] VM is ready! Sending start command to Minecraft daemon...\r\n`);
      }
    }

    const nodeUrl = await getNodeUrl(gs);

    // Dispatch power command to daemon
    const dRes = await fetch(`${nodeUrl}/api/daemon/power/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-daemon-secret': DAEMON_SECRET },
      body: JSON.stringify({ action }),
    });
    const data = await dRes.json();

    // Update GameServer status
    if (action === 'start' || action === 'restart') {
      await GameServer.updateOne({ serverId: id }, { status: 'online' });

      // Establish Socket.IO relay to daemon so console logs flow to browser.
      // This handles the race where the browser joined the room before the VM was ready.
      // Use setTimeout to let the daemon's Java process start emitting logs.
      setTimeout(() => {
        tryEstablishDaemonRelay(id, null).catch(err => {
          console.error(`[Control] Failed to establish relay after power start for ${id}:`, err.message);
        });
      }, 1000);
    } else if (action === 'stop') {
      await GameServer.updateOne({ serverId: id }, { status: 'stopping' });
      // Delay relay cleanup — the server takes several seconds to shut down
      // (saving worlds, kicking players, etc.) and we want those logs to flow through
      setTimeout(() => {
        if (daemonSockets[id]) {
          daemonSockets[id].socket.disconnect();
          delete daemonSockets[id];
        }
        // Set final offline status after shutdown logs have been captured
        GameServer.updateOne({ serverId: id }, { status: 'offline' }).catch(() => {});
      }, 30000);
    }

    // Auto-deallocation check for stop action
    if (action === 'stop' && vmNode && isAwsConfigured) {
      setTimeout(async () => {
        try {
          const statusRes = await fetch(`${nodeUrl}/api/daemon/status`, {
            headers: { 'x-daemon-secret': DAEMON_SECRET },
          });
          const statusData = await statusRes.json();
          const activeCount = statusData.running ? statusData.running.length : 0;

          if (activeCount === 0) {
            console.log(`[Control] VM ${vmNode.vmName} has 0 running servers. Triggering deallocation...`);
            const { deallocateAwsVM } = require('./aws-provisioner');
            await deallocateAwsVM(vmNode.vmName, vmNode.region);
            vmNode.status = 'deallocated';
            await vmNode.save();
          }
        } catch (e) {
          console.error('[Control] Auto-deallocation check failed:', e.message);
        }
      }, 45000); // Wait longer than relay cleanup (30s) to ensure logs are captured
    }

    res.status(dRes.status).json(data);
  } catch (e) {
    res.status(500).json({ error: 'Power action failed: ' + e.message });
  }
});

// 4. Delete Server (Async — enqueue job)
app.delete('/api/servers/:id', protect, checkServerAccess, async (req, res) => {
  if (req.serverRole !== 'owner') {
    return res.status(403).json({ error: 'Only the server owner can delete the server.' });
  }

  try {
    const job = await orchestrationQueue.add('delete-server', {
      serverId: req.params.id,
      userId: req.user._id.toString(),
    });

    // Mark as deleting
    await GameServer.updateOne({ serverId: req.params.id }, { status: 'error' });

    console.log(`[Control] Delete job ${job.id} queued for server ${req.params.id}`);
    res.json({ success: true, jobId: job.id });
  } catch (e) {
    res.status(500).json({ error: 'Failed to queue deletion: ' + e.message });
  }
});

// =============================================
//  JOB STATUS API
// =============================================

app.get('/api/jobs/:jobId', protect, async (req, res) => {
  try {
    const deployJob = await DeployJob.findOne({
      jobId: req.params.jobId,
      userId: req.user._id,
    });

    if (!deployJob) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json({
      jobId: deployJob.jobId,
      type: deployJob.type,
      status: deployJob.status,
      progress: deployJob.progress,
      message: deployJob.message,
      serverId: deployJob.serverId,
      region: deployJob.region,
      result: deployJob.result,
      error: deployJob.error,
      createdAt: deployJob.createdAt,
      updatedAt: deployJob.updatedAt,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// =============================================
//  DAEMON REGISTRATION & HEARTBEAT (Internal)
// =============================================

app.post('/api/internal/register', requireSystemSecret, async (req, res) => {
  const { vmName, region, ip, maxSlots } = req.body;

  try {
    await VMNode.findOneAndUpdate(
      { vmName },
      {
        ip,
        region,
        status: 'running',
        maxServers: maxSlots || 5,
        lastHeartbeat: new Date(),
      },
      { upsert: true }
    );
    console.log(`[Registry] ✅ Daemon registered: ${vmName} (${region}) @ ${ip}`);
    res.json({ success: true });
  } catch (err) {
    console.error(`[Registry] Registration failed:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/internal/heartbeat', requireSystemSecret, async (req, res) => {
  const { vmName, region, ip, maxSlots, runningServers, cpuPercent, ramUsedMB } = req.body;

  try {
    // Upsert: auto-recreate VM record if it was deleted (e.g. by clear-queue.js)
    const updateFields = {
      lastHeartbeat: new Date(),
      status: 'running',
      runningServerIds: runningServers || [],
      cpuPercent: cpuPercent || 0,
      ramUsedMB: ramUsedMB || 0,
    };
    // Include registration data if provided (self-healing heartbeat)
    if (region) updateFields.region = region;
    if (ip) updateFields.ip = ip;
    if (maxSlots) updateFields.maxServers = maxSlots;

    await VMNode.findOneAndUpdate(
      { vmName },
      updateFields,
      { upsert: true }
    );

    // Sync GameServer statuses from heartbeat ground truth
    if (runningServers && runningServers.length > 0) {
      await GameServer.updateMany(
        { serverId: { $in: runningServers }, status: { $in: ['offline', 'deploying'] } },
        { status: 'online' }
      );
    }
    // Mark servers on this VM that AREN'T running as offline
    if (vmName) {
      await GameServer.updateMany(
        { vmName, status: 'online', serverId: { $nin: runningServers || [] } },
        { status: 'offline' }
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error(`[Heartbeat] Error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// =============================================
//  PERMISSION SHARING ENDPOINTS (OWNER ONLY)
// =============================================

app.get('/api/servers/:id/permissions', protect, checkServerAccess, async (req, res) => {
  if (req.serverRole !== 'owner') {
    return res.status(403).json({ error: 'Only the server owner can manage permission sharing.' });
  }
  try {
    const perms = await ServerPermission.find({ serverId: req.params.id }).populate('userId', 'name email');
    res.json({
      permissions: perms.map(p => ({
        userId: p.userId._id,
        name: p.userId.name,
        email: p.userId.email,
        role: p.role,
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/servers/:id/permissions', protect, checkServerAccess, async (req, res) => {
  if (req.serverRole !== 'owner') {
    return res.status(403).json({ error: 'Only the server owner can manage permission sharing.' });
  }
  const { email, role } = req.body;
  if (!email || !role || !['on_off', 'full'].includes(role)) {
    return res.status(400).json({ error: 'Valid email and role are required.' });
  }

  try {
    const targetUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (!targetUser) {
      return res.status(404).json({ error: 'No user registered with this email address.' });
    }
    if (targetUser._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ error: 'You cannot share access with yourself.' });
    }

    await ServerPermission.findOneAndUpdate(
      { serverId: req.params.id, userId: targetUser._id },
      { role },
      { upsert: true, new: true }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/servers/:id/permissions/:userId', protect, checkServerAccess, async (req, res) => {
  if (req.serverRole !== 'owner') {
    return res.status(403).json({ error: 'Only the server owner can manage permission sharing.' });
  }
  try {
    await ServerPermission.findOneAndDelete({ serverId: req.params.id, userId: req.params.userId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =============================================
//  PROXY ENDPOINTS (Features → Daemon)
// =============================================

app.get('/api/servers/:id/players', protect, checkServerAccess, (req, res) => {
  proxyToDaemon(req, res, 'GET', `/api/daemon/players/${req.params.id}`);
});

app.post('/api/servers/:id/players/action', protect, checkServerAccess, requireFullAccess, (req, res) => {
  const { action, playerName } = req.body;
  proxyToDaemon(req, res, 'POST', `/api/daemon/command/${req.params.id}`, { command: `${action} ${playerName}` });
});

app.get('/api/servers/:id/stats', protect, checkServerAccess, (req, res) => {
  proxyToDaemon(req, res, 'GET', `/api/daemon/stats/${req.params.id}`);
});

app.get('/api/servers/:id/stats-history', protect, checkServerAccess, (req, res) => {
  proxyToDaemon(req, res, 'GET', `/api/daemon/stats-history/${req.params.id}`);
});

app.get('/api/servers/:id/settings', protect, checkServerAccess, requireFullAccess, (req, res) => {
  proxyToDaemon(req, res, 'GET', `/api/daemon/settings/${req.params.id}`);
});

app.post('/api/servers/:id/settings', protect, checkServerAccess, requireFullAccess, (req, res) => {
  proxyToDaemon(req, res, 'POST', `/api/daemon/settings/${req.params.id}`, req.body);
});

// File Proxy Routes
app.get('/api/servers/:id/files', protect, checkServerAccess, requireFullAccess, (req, res) => {
  const pathQuery = req.query.path ? `?path=${encodeURIComponent(req.query.path)}` : '';
  proxyToDaemon(req, res, 'GET', `/api/daemon/files/${req.params.id}${pathQuery}`);
});

app.delete('/api/servers/:id/files', protect, checkServerAccess, requireFullAccess, (req, res) => {
  const pathQuery = req.query.path ? `?path=${encodeURIComponent(req.query.path)}` : '';
  proxyToDaemon(req, res, 'DELETE', `/api/daemon/files/${req.params.id}${pathQuery}`);
});

app.get('/api/servers/:id/files/content', protect, checkServerAccess, requireFullAccess, (req, res) => {
  const pathQuery = req.query.path ? `?path=${encodeURIComponent(req.query.path)}` : '';
  proxyToDaemon(req, res, 'GET', `/api/daemon/files/content/${req.params.id}${pathQuery}`);
});

app.post('/api/servers/:id/files/content', protect, checkServerAccess, requireFullAccess, (req, res) => {
  proxyToDaemon(req, res, 'POST', `/api/daemon/files/content/${req.params.id}`, req.body);
});

// Streaming Proxies for large files
app.post('/api/servers/:id/files/upload', protect, checkServerAccess, requireFullAccess, async (req, res) => {
  const nodeUrl = await getNodeUrl(req.gameServer);
  const pathQuery = req.query.path ? `?path=${encodeURIComponent(req.query.path)}` : '';
  try {
    const dRes = await fetch(`${nodeUrl}/api/daemon/files/upload/${req.params.id}${pathQuery}`, {
      method: 'POST',
      headers: { 'x-daemon-secret': DAEMON_SECRET, 'content-type': req.headers['content-type'] },
      body: req,
    });
    const data = await dRes.json();
    res.status(dRes.status).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/servers/:id/files/download', protect, checkServerAccess, requireFullAccess, async (req, res) => {
  const nodeUrl = await getNodeUrl(req.gameServer);
  const pathQuery = req.query.path ? `?path=${encodeURIComponent(req.query.path)}` : '';
  try {
    const dRes = await fetch(`${nodeUrl}/api/daemon/files/download/${req.params.id}${pathQuery}`, {
      headers: { 'x-daemon-secret': DAEMON_SECRET },
    });
    res.status(dRes.status);
    dRes.headers.forEach((v, n) => res.setHeader(n, v));
    dRes.body.pipe(res);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// =============================================
//  SYSTEM ENDPOINTS (Daemon Bootstrapping)
// =============================================

app.get('/api/system/daemon-script', requireSystemSecret, (req, res) => {
  const daemonPath = path.join(__dirname, 'daemon.js');
  if (!fs.existsSync(daemonPath)) {
    return res.status(404).json({ error: 'daemon.js not found on Control Plane' });
  }
  res.setHeader('Content-Type', 'text/plain');
  res.send(fs.readFileSync(daemonPath, 'utf8'));
});

app.get('/api/system/daemon-package', requireSystemSecret, (req, res) => {
  const pkgPath = path.join(__dirname, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    return res.status(404).json({ error: 'package.json not found on Control Plane' });
  }
  res.setHeader('Content-Type', 'application/json');
  res.send(fs.readFileSync(pkgPath, 'utf8'));
});

// Temporary debug endpoint to fetch pm2 logs
app.get('/api/system/debug-logs', (req, res) => {
  const { exec } = require('child_process');
  exec('pm2 logs --lines 200 --nostream', (err, stdout, stderr) => {
    res.setHeader('Content-Type', 'text/plain');
    res.send(stdout + '\n' + stderr);
  });
});

// AWS Region Discovery
app.get('/api/system/aws-regions', protect, async (req, res) => {
  if (!isAwsConfigured) {
    return res.json({ regions: [] });
  }
  try {
    // Only return regions where we have provisioned VM nodes
    const activeRegions = await VMNode.distinct('region');
    const availableRegions = SAFE_REGION_METADATA.filter(r => activeRegions.includes(r.value));
    
    // Fallback if none found (e.g. before initial sync), show what we statically expect
    if (availableRegions.length === 0) {
      const fallbackRegions = SAFE_REGION_METADATA.filter(r => ['ap-south-1', 'ap-northeast-2'].includes(r.value));
      return res.json({ regions: fallbackRegions });
    }

    res.json({ regions: availableRegions });
  } catch (error) {
    console.error('Error fetching available regions:', error);
    res.status(500).json({ error: 'Failed to fetch regions' });
  }
});

// Console history fetch (HTTP fallback — doesn't require Socket.IO relay)
app.get('/api/servers/:id/console', protect, checkServerAccess, async (req, res) => {
  const gs = req.gameServer;
  try {
    const nodeUrl = await getNodeUrl(gs);
    const dRes = await fetch(`${nodeUrl}/api/daemon/console/${req.params.id}`, {
      headers: { 'x-daemon-secret': DAEMON_SECRET },
    });
    const data = await dRes.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch console: ' + e.message, logs: '' });
  }
});

// =============================================
//  ADMIN CLEANUP ENDPOINTS
// =============================================

// Kill all running server processes across all VMs and reset statuses
app.post('/api/admin/kill-all', protect, async (req, res) => {
  try {
    const vmNodes = await VMNode.find({ status: { $in: ['running', 'unhealthy'] } });
    const results = [];

    for (const vm of vmNodes) {
      try {
        const dRes = await fetch(`http://${vm.ip}:4000/api/daemon/kill-all`, {
          method: 'POST',
          headers: { 'x-daemon-secret': DAEMON_SECRET },
        });
        const data = await dRes.json();
        results.push({ vm: vm.vmName, killed: data.killed || [] });
      } catch (e) {
        results.push({ vm: vm.vmName, error: e.message });
      }
    }

    // Reset all server statuses to offline
    await GameServer.updateMany(
      { status: { $in: ['online', 'starting', 'stopping'] } },
      { status: 'offline' }
    );

    // Reset VM running server lists
    await VMNode.updateMany({}, { runningServerIds: [], activeServersCount: 0 });

    console.log(`[Admin] Kill-all completed:`, results);
    res.json({ success: true, results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Remove orphaned GameServer records (deleted from UI but process was never killed)
app.post('/api/admin/cleanup', protect, async (req, res) => {
  try {
    // Delete all GameServer records that have status 'error' or no vmName
    const orphans = await GameServer.find({
      $or: [
        { status: 'error' },
        { status: 'queued', deployJobId: { $exists: true } },
      ]
    });

    const deletedIds = orphans.map(gs => gs.serverId);
    if (deletedIds.length > 0) {
      await GameServer.deleteMany({ serverId: { $in: deletedIds } });
      await ServerPermission.deleteMany({ serverId: { $in: deletedIds } });
    }

    console.log(`[Admin] Cleanup: removed ${deletedIds.length} orphaned servers`);
    res.json({ success: true, cleaned: deletedIds });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// =============================================
//  FRONTEND DELIVERY
// =============================================

app.use(express.static(path.join(__dirname, '../dist')));
app.get(/^(.*)$/, (req, res) => {
  res.sendFile(path.join(__dirname, '../dist', 'index.html'));
});

// =============================================
//  SOCKET.IO RELAY (Control Plane → Daemon)
// =============================================

// Track active daemon connections per server so we don't duplicate
const daemonSockets = {}; // { serverId: { socket, refCount } }

/**
 * Tries to establish a Socket.IO relay connection to the daemon for a given server.
 * Called when a browser client joins a server room, or after a power action starts a server.
 * Accepts VM status 'running' or 'starting' so the relay connects during boot.
 */
async function tryEstablishDaemonRelay(serverId, notifySocket) {
  try {
    const gs = await GameServer.findOne({ serverId });
    if (!gs || !gs.vmName) {
      if (notifySocket) notifySocket.emit('console-log', '[System] Server not found or not deployed yet.\r\n');
      return;
    }

    const vmNode = await VMNode.findOne({ vmName: gs.vmName });
    // Accept 'running', 'starting', and 'unhealthy' — daemon may already be up or just missed heartbeats
    if (!vmNode || !vmNode.ip || !['running', 'starting', 'unhealthy'].includes(vmNode.status)) {
      if (notifySocket) notifySocket.emit('console-log', '[System] VM is not running. Start the server first.\r\n');
      return;
    }

    // Reuse existing daemon connection if already established
    if (daemonSockets[serverId]) {
      daemonSockets[serverId].refCount++;
      console.log(`[Socket.IO] Reusing daemon connection for ${serverId} (refs: ${daemonSockets[serverId].refCount})`);
      return;
    }

    const daemonUrl = `http://${vmNode.ip}:4000`;
    console.log(`[Socket.IO] Establishing relay to daemon at ${daemonUrl} for server ${serverId}...`);

    // Connect to the remote daemon's Socket.IO
    const daemonSocket = ioClient(daemonUrl, {
      extraHeaders: { 'x-daemon-secret': DAEMON_SECRET },
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
      timeout: 10000,
    });

    daemonSockets[serverId] = { socket: daemonSocket, refCount: 1 };

    daemonSocket.on('connect', () => {
      console.log(`[Socket.IO] Connected to daemon at ${daemonUrl} for server ${serverId}`);
      daemonSocket.emit('join-server', serverId);
    });

    // Relay daemon events to all browser clients in this server room
    daemonSocket.on('console-history', (data) => {
      io.to(`server-${serverId}`).emit('console-history', data);
    });

    daemonSocket.on('console-log', (data) => {
      io.to(`server-${serverId}`).emit('console-log', data);
    });

    daemonSocket.on('console-error', (data) => {
      io.to(`server-${serverId}`).emit('console-error', data);
    });

    daemonSocket.on('status-update', (data) => {
      io.to(`server-${serverId}`).emit('status-update', data);
      // Sync daemon status back to DB (e.g. 'offline' when process exits)
      if (data === 'offline' || data === 'online') {
        GameServer.updateOne({ serverId }, { status: data }).catch(() => {});
      }
    });

    daemonSocket.on('connect_error', (err) => {
      console.error(`[Socket.IO] Daemon connection error for ${serverId}:`, err.message);
    });

    daemonSocket.on('disconnect', (reason) => {
      console.log(`[Socket.IO] Daemon disconnected for ${serverId}: ${reason}`);
    });

  } catch (err) {
    console.error(`[Socket.IO] Error setting up relay for ${serverId}:`, err.message);
    if (notifySocket) notifySocket.emit('console-error', `[System] Failed to connect to server: ${err.message}\r\n`);
  }
}

io.on('connection', (socket) => {
  console.log('[Socket.IO] Client connected:', socket.id);

  socket.on('join-server', async (serverId) => {
    socket.join(`server-${serverId}`);
    console.log(`[Socket.IO] Client ${socket.id} joined server-${serverId}`);

    // Try to establish daemon relay (may fail if VM not ready yet)
    await tryEstablishDaemonRelay(serverId, socket);
  });


  // Relay commands from browser to daemon
  socket.on('send-command', async ({ serverId, command }) => {
    if (daemonSockets[serverId]?.socket?.connected) {
      daemonSockets[serverId].socket.emit('send-command', { serverId, command });
    } else {
      // Fallback: use HTTP API
      try {
        const gs = await GameServer.findOne({ serverId });
        if (gs) {
          const nodeUrl = await getNodeUrl(gs);
          await fetch(`${nodeUrl}/api/daemon/command/${serverId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-daemon-secret': DAEMON_SECRET },
            body: JSON.stringify({ command }),
          });
        }
      } catch (err) {
        socket.emit('console-error', `[System] Failed to send command: ${err.message}\r\n`);
      }
    }
  });

  socket.on('disconnect', () => {
    console.log('[Socket.IO] Client disconnected:', socket.id);
    // Clean up daemon connections with no more clients
    // Check which server rooms this socket was in
    for (const [serverId, entry] of Object.entries(daemonSockets)) {
      const room = io.sockets.adapter.rooms.get(`server-${serverId}`);
      const clientsLeft = room ? room.size : 0;
      if (clientsLeft === 0) {
        console.log(`[Socket.IO] No clients left for ${serverId}. Disconnecting daemon relay.`);
        entry.socket.disconnect();
        delete daemonSockets[serverId];
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, () => {
    console.log(`🚀 CraftHost Control Plane running on port ${PORT}`);
    console.log(`   Mode: ${isAwsConfigured ? 'AWS Cloud' : 'Local Development'}`);
  });
}

module.exports = { app, server };
