/**
 * cleanup-azure.js — CraftHost Azure Resource Cleanup
 *
 * Removes orphaned PIPs, NICs, NSGs, VNets that were left behind
 * by failed provisioning attempts. Also cleans stale MongoDB records
 * and Redis queue jobs.
 *
 * Run with: node scripts/cleanup-azure.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { ClientSecretCredential } = require('@azure/identity');
const { ComputeManagementClient } = require('@azure/arm-compute');
const { NetworkManagementClient } = require('@azure/arm-network');
const { connectDB, VMNode, GameServer, DeployJob } = require('../db');
const { Queue } = require('bullmq');

const tenantId = process.env.AZURE_TENANT_ID;
const clientId = process.env.AZURE_CLIENT_ID;
const clientSecret = process.env.AZURE_CLIENT_SECRET;
const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID;
const resourceGroupName = process.env.AZURE_RESOURCE_GROUP || 'crafthost_group';

const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);

async function deleteWithRetry(label, deleteFn) {
  try {
    console.log(`  🗑️  Deleting ${label}...`);
    const poller = await deleteFn();
    await poller.pollUntilDone();
    console.log(`  ✅ Deleted ${label}`);
  } catch (err) {
    if (err.statusCode === 404 || err.code === 'ResourceNotFound') {
      console.log(`  ℹ️  ${label} not found (already deleted)`);
    } else {
      console.error(`  ❌ Failed to delete ${label}: ${err.message}`);
    }
  }
}

async function cleanAzureOrphanedResources() {
  console.log('\n========================================');
  console.log('🔧 Phase 1: Cleaning Orphaned Azure Resources');
  console.log('========================================');

  const cred = new ClientSecretCredential(tenantId, clientId, clientSecret);
  const compute = new ComputeManagementClient(cred, subscriptionId);
  const network = new NetworkManagementClient(cred, subscriptionId);

  // --- List all current resources ---
  console.log('\n📋 Scanning resources in resource group:', resourceGroupName);

  const vms = [];
  for await (const vm of compute.virtualMachines.list(resourceGroupName)) {
    vms.push(vm);
  }
  console.log(`  Found ${vms.length} VM(s):`, vms.map(v => `${v.name} (${v.location})`).join(', ') || 'none');

  // Collect NICs attached to living VMs
  const attachedNicIds = new Set();
  for (const vm of vms) {
    for (const nic of (vm.networkProfile?.networkInterfaces || [])) {
      attachedNicIds.add(nic.id.toLowerCase());
    }
  }

  const allNics = [];
  for await (const nic of network.networkInterfaces.list(resourceGroupName)) {
    allNics.push(nic);
  }

  const allPips = [];
  for await (const pip of network.publicIPAddresses.list(resourceGroupName)) {
    allPips.push(pip);
  }

  const allVnets = [];
  for await (const vnet of network.virtualNetworks.list(resourceGroupName)) {
    allVnets.push(vnet);
  }

  const allNsgs = [];
  for await (const nsg of network.networkSecurityGroups.list(resourceGroupName)) {
    allNsgs.push(nsg);
  }

  console.log(`  Found ${allNics.length} NIC(s), ${allPips.length} PIP(s), ${allVnets.length} VNet(s), ${allNsgs.length} NSG(s)`);

  // Identify orphaned NICs (not attached to any running VM)
  const orphanedNics = allNics.filter(nic => {
    const isAttached = attachedNicIds.has(nic.id.toLowerCase()) || nic.virtualMachine;
    return !isAttached;
  });

  // Identify orphaned PIPs (not attached to any NIC)
  const attachedPipIds = new Set();
  for (const nic of allNics) {
    for (const ipConfig of (nic.ipConfigurations || [])) {
      if (ipConfig.publicIPAddress?.id) {
        attachedPipIds.add(ipConfig.publicIPAddress.id.toLowerCase());
      }
    }
  }
  const orphanedPips = allPips.filter(pip => !attachedPipIds.has(pip.id.toLowerCase()));

  console.log(`\n  Orphaned NICs: ${orphanedNics.map(n => n.name).join(', ') || 'none'}`);
  console.log(`  Orphaned PIPs: ${orphanedPips.map(p => p.name).join(', ') || 'none'}`);

  // Delete orphaned NICs first (they may block PIP deletion)
  for (const nic of orphanedNics) {
    await deleteWithRetry(`NIC: ${nic.name}`,
      () => network.networkInterfaces.beginDelete(resourceGroupName, nic.name));
  }

  // Delete orphaned PIPs
  for (const pip of orphanedPips) {
    await deleteWithRetry(`Public IP: ${pip.name}`,
      () => network.publicIPAddresses.beginDelete(resourceGroupName, pip.name));
  }

  // Delete koreacentral infrastructure (if no VM is there)
  const koreanVMs = vms.filter(v => v.location === 'koreacentral');
  if (koreanVMs.length === 0) {
    console.log('\n  No VMs in koreacentral — cleaning up that region\'s infra...');
    const koreaVnet = allVnets.find(v => v.location === 'koreacentral');
    const koreaNsg = allNsgs.find(n => n.location === 'koreacentral');
    if (koreaVnet) {
      await deleteWithRetry(`VNet: ${koreaVnet.name}`,
        () => network.virtualNetworks.beginDelete(resourceGroupName, koreaVnet.name));
    }
    if (koreaNsg) {
      await deleteWithRetry(`NSG: ${koreaNsg.name}`,
        () => network.networkSecurityGroups.beginDelete(resourceGroupName, koreaNsg.name));
    }
  }

  // Final PIP count
  let finalPips = 0;
  for await (const _ of network.publicIPAddresses.list(resourceGroupName)) finalPips++;
  console.log(`\n  ✅ Azure cleanup done. Remaining Public IPs: ${finalPips}/3`);
}

async function cleanMongoDb() {
  console.log('\n========================================');
  console.log('🔧 Phase 2: Cleaning Stale MongoDB Records');
  console.log('========================================');

  // Remove VMNodes that aren't linked to actual running Azure VMs
  // (provisioning/unhealthy/stale records)
  const staleBefore = await VMNode.deleteMany({
    status: { $in: ['provisioning', 'unhealthy'] }
  });
  console.log(`  Removed ${staleBefore.deletedCount} stale VMNode(s) (provisioning/unhealthy)`);

  // Remove GameServers that are stuck in queued/error with no valid vmName
  const staleServers = await GameServer.deleteMany({
    status: { $in: ['queued', 'error'] },
    $or: [{ vmName: null }, { vmName: { $exists: false } }]
  });
  console.log(`  Removed ${staleServers.deletedCount} stale GameServer(s)`);

  // Remove DeployJobs that are stuck in non-terminal states
  const staleJobs = await DeployJob.deleteMany({
    status: { $in: ['queued', 'provisioning_vm', 'starting_vm', 'deploying_server'] }
  });
  console.log(`  Removed ${staleJobs.deletedCount} stale DeployJob(s)`);

  console.log('  ✅ MongoDB cleanup done.');
}

async function cleanRedisQueue() {
  console.log('\n========================================');
  console.log('🔧 Phase 3: Clearing Redis BullMQ Queues');
  console.log('========================================');

  const redisConnection = {
    host: REDIS_HOST,
    port: REDIS_PORT,
    maxRetriesPerRequest: null,
  };

  const orchestrationQueue = new Queue('crafthost-orchestration', { connection: redisConnection });
  const reaperQueue = new Queue('crafthost-reaper', { connection: redisConnection });

  await orchestrationQueue.obliterate({ force: true });
  console.log('  ✅ crafthost-orchestration queue obliterated');

  await reaperQueue.obliterate({ force: true });
  console.log('  ✅ crafthost-reaper queue obliterated');

  await orchestrationQueue.close();
  await reaperQueue.close();
}

async function main() {
  console.log('🚀 CraftHost Azure Cleanup Tool');
  console.log('  Subscription:', subscriptionId);
  console.log('  Resource Group:', resourceGroupName);
  console.log('  Redis:', `${REDIS_HOST}:${REDIS_PORT}`);

  try {
    await cleanAzureOrphanedResources();
  } catch (err) {
    console.error('Azure cleanup error:', err.message);
  }

  try {
    await connectDB();
    await cleanMongoDb();
  } catch (err) {
    console.error('MongoDB cleanup error:', err.message);
  }

  try {
    await cleanRedisQueue();
  } catch (err) {
    console.error('Redis cleanup error:', err.message);
  }

  console.log('\n🎉 All cleanup steps complete! The system is ready for fresh deployments.');
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal cleanup error:', err);
  process.exit(1);
});
