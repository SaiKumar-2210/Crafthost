// Quick cleanup of orphaned PIPs and NICs after failed provisioning
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { ClientSecretCredential } = require('@azure/identity');
const { NetworkManagementClient } = require('@azure/arm-network');

async function main() {
  const cred = new ClientSecretCredential(
    process.env.AZURE_TENANT_ID,
    process.env.AZURE_CLIENT_ID,
    process.env.AZURE_CLIENT_SECRET
  );
  const network = new NetworkManagementClient(cred, process.env.AZURE_SUBSCRIPTION_ID);
  const rg = process.env.AZURE_RESOURCE_GROUP;

  // Delete orphaned NICs (not attached to a VM)
  console.log('=== Cleaning Orphaned NICs ===');
  for await (const nic of network.networkInterfaces.list(rg)) {
    if (!nic.virtualMachine) {
      console.log(`  Deleting NIC: ${nic.name}...`);
      try {
        const p = await network.networkInterfaces.beginDelete(rg, nic.name);
        await p.pollUntilDone();
        console.log(`  ✅ Deleted`);
      } catch (e) {
        console.log(`  ❌ ${e.message.substring(0, 60)}`);
      }
    }
  }

  // Delete orphaned PIPs (not attached to anything)
  console.log('\n=== Cleaning Orphaned PIPs ===');
  for await (const pip of network.publicIPAddresses.list(rg)) {
    if (!pip.ipConfiguration) {
      console.log(`  Deleting PIP: ${pip.name} (${pip.ipAddress})...`);
      try {
        const p = await network.publicIPAddresses.beginDelete(rg, pip.name);
        await p.pollUntilDone();
        console.log(`  ✅ Deleted`);
      } catch (e) {
        console.log(`  ❌ ${e.message.substring(0, 60)}`);
      }
    }
  }

  // Summary
  console.log('\n=== Remaining Resources ===');
  for await (const pip of network.publicIPAddresses.list(rg)) {
    console.log(`  PIP: ${pip.name} | ${pip.ipAddress} | ${pip.location}`);
  }
  for await (const nic of network.networkInterfaces.list(rg)) {
    console.log(`  NIC: ${nic.name} | ${nic.location} | VM: ${nic.virtualMachine ? 'attached' : 'orphan'}`);
  }
}
main().catch(e => console.error(e.message));
