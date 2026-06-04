/**
 * open-web-ports.js — Add HTTP (80) and HTTPS (443) to the India VM's NSG
 * 
 * Run with: node scripts/open-web-ports.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { ClientSecretCredential } = require('@azure/identity');
const { NetworkManagementClient } = require('@azure/arm-network');

const tenantId = process.env.AZURE_TENANT_ID;
const clientId = process.env.AZURE_CLIENT_ID;
const clientSecret = process.env.AZURE_CLIENT_SECRET;
const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID;
const resourceGroupName = process.env.AZURE_RESOURCE_GROUP || 'crafthost_group';

const NSG_NAME = 'CraftHost-NSG-centralindia';

async function main() {
  const cred = new ClientSecretCredential(tenantId, clientId, clientSecret);
  const network = new NetworkManagementClient(cred, subscriptionId);

  console.log(`Opening ports 80/443 on ${NSG_NAME}...`);

  // Get existing NSG
  const nsg = await network.networkSecurityGroups.get(resourceGroupName, NSG_NAME);
  const existingRules = nsg.securityRules || [];

  // Check if rules already exist
  const hasHttp = existingRules.some(r => r.name === 'HTTP');
  const hasHttps = existingRules.some(r => r.name === 'HTTPS');

  if (hasHttp && hasHttps) {
    console.log('✅ Ports 80 and 443 are already open.');
    process.exit(0);
  }

  // Add HTTP rule
  if (!hasHttp) {
    console.log('  Adding HTTP (80) rule...');
    const poller = await network.securityRules.beginCreateOrUpdate(
      resourceGroupName, NSG_NAME, 'HTTP',
      {
        protocol: 'Tcp',
        sourcePortRange: '*',
        destinationPortRange: '80',
        sourceAddressPrefix: '*',
        destinationAddressPrefix: '*',
        access: 'Allow',
        priority: 130,
        direction: 'Inbound',
      }
    );
    await poller.pollUntilDone();
    console.log('  ✅ HTTP rule added');
  }

  // Add HTTPS rule
  if (!hasHttps) {
    console.log('  Adding HTTPS (443) rule...');
    const poller = await network.securityRules.beginCreateOrUpdate(
      resourceGroupName, NSG_NAME, 'HTTPS',
      {
        protocol: 'Tcp',
        sourcePortRange: '*',
        destinationPortRange: '443',
        sourceAddressPrefix: '*',
        destinationAddressPrefix: '*',
        access: 'Allow',
        priority: 131,
        direction: 'Inbound',
      }
    );
    await poller.pollUntilDone();
    console.log('  ✅ HTTPS rule added');
  }

  console.log('\n✅ Done! Ports 80 and 443 are now open on the India VM.');
}

main().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
