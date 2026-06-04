// Check available VM sizes in allowed regions
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { ClientSecretCredential } = require('@azure/identity');
const { ComputeManagementClient } = require('@azure/arm-compute');

async function main() {
  const cred = new ClientSecretCredential(
    process.env.AZURE_TENANT_ID,
    process.env.AZURE_CLIENT_ID,
    process.env.AZURE_CLIENT_SECRET
  );
  const compute = new ComputeManagementClient(cred, process.env.AZURE_SUBSCRIPTION_ID);

  for (const region of ['centralindia', 'koreacentral']) {
    console.log(`\n=== Available small VM sizes in ${region} ===`);
    const skus = compute.resourceSkus.list({ filter: `location eq '${region}'` });
    let count = 0;
    for await (const sku of skus) {
      if (sku.resourceType === 'virtualMachines') {
        const restrictions = sku.restrictions || [];
        const isRestricted = restrictions.some(r =>
          r.type === 'Location' || r.reasonCode === 'NotAvailableForSubscription'
        );
        if (!isRestricted) {
          const cores = sku.capabilities?.find(c => c.name === 'vCPUs')?.value;
          const ram = sku.capabilities?.find(c => c.name === 'MemoryGB')?.value;
          if (parseInt(cores) <= 2 && parseFloat(ram) <= 8) {
            console.log(`  ${sku.name} | cores: ${cores} | RAM: ${ram}GB`);
            count++;
          }
        }
      }
    }
    console.log(`  Total: ${count} sizes available`);
  }
}
main().catch(e => console.error(e.message));
