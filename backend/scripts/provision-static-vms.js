/**
 * provision-static-vms.js — Pre-provision 2 static VMs for CraftHost on AWS
 * 
 * Creates one VM in ap-south-1 and one in ap-northeast-2,
 * waits for IPs, and registers them in MongoDB as running VMNodes.
 * 
 * Run with: node scripts/provision-static-vms.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { connectDB, VMNode } = require('../db');
const {
  isAwsConfigured,
  ensureAwsVM,
  getAwsVMPublicIP,
} = require('../aws-provisioner');

// The static VMs we want — one per region
const STATIC_VMS = [
  { vmName: 'crafthost-node-india', region: 'ap-south-1', vmIndex: 1 },
  { vmName: 'crafthost-node-hyderabad', region: 'ap-south-2', vmIndex: 1 },
  { vmName: 'crafthost-node-korea', region: 'ap-northeast-2', vmIndex: 1 },
  { vmName: 'crafthost-node-us', region: 'us-east-1', vmIndex: 1 },
  { vmName: 'crafthost-node-uk', region: 'eu-west-2', vmIndex: 1 },
  { vmName: 'crafthost-node-australia', region: 'ap-southeast-2', vmIndex: 1 },
];

async function main() {
  if (!isAwsConfigured) {
    console.error('❌ AWS is not configured. Set AWS_* env vars in .env');
    process.exit(1);
  }

  console.log('🏗️  CraftHost Static VM Provisioner (AWS)');
  console.log(`   VMs to create: ${STATIC_VMS.map(v => `${v.vmName} (${v.region})`).join(', ')}`);

  // Provision each VM
  for (const vmDef of STATIC_VMS) {
    try {
      await ensureAwsVM(vmDef.vmName, vmDef.region);
    } catch (err) {
      console.error(`\n❌ Failed to provision ${vmDef.vmName}: ${err.message}`);
      console.error('   Continuing with next VM...\n');
    }
  }

  // Wait for IPs and register in MongoDB
  console.log('\n⏳ Waiting 15s for IPs to propagate...');
  await new Promise(r => setTimeout(r, 15000));

  await connectDB();

  for (const vmDef of STATIC_VMS) {
    const { vmName, region, vmIndex } = vmDef;
    try {
      const ip = await getAwsVMPublicIP(vmName, region);
      if (!ip) {
        console.error(`❌ Could not resolve IP for ${vmName}. It may need more time to boot.`);
        continue;
      }

      // Upsert VMNode in MongoDB
      await VMNode.findOneAndUpdate(
        { vmName },
        {
          vmName,
          region,
          vmIndex,
          ip,
          status: 'running',
          activeServersCount: 0,
          maxServers: 5,
          lastHeartbeat: new Date(),
        },
        { upsert: true, returnDocument: 'after' }
      );

      console.log(`✅ Registered ${vmName} → ${ip} (${region}) in MongoDB`);
    } catch (err) {
      console.error(`❌ Failed to register ${vmName}: ${err.message}`);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📋 SUMMARY');
  console.log('='.repeat(60));
  const registeredVMs = await VMNode.find({});
  for (const vm of registeredVMs) {
    console.log(`  ${vm.vmName} | ${vm.region} | ${vm.ip} | status: ${vm.status} | servers: ${vm.activeServersCount}/${vm.maxServers}`);
  }
  console.log('\n🎉 Static VMs are ready! Cloud-init will install Java + Node + daemon (takes ~2 min).');
  console.log('   After cloud-init finishes, servers can be deployed to these VMs.\n');

  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
