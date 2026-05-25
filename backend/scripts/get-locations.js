require('dotenv').config();
const { ClientSecretCredential } = require('@azure/identity');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const tenantId = process.env.AZURE_TENANT_ID;
const clientId = process.env.AZURE_CLIENT_ID;
const clientSecret = process.env.AZURE_CLIENT_SECRET;
const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID;

async function getLocations() {
  const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
  const token = await credential.getToken('https://management.azure.com/.default');

  const res = await fetch(
    `https://management.azure.com/subscriptions/${subscriptionId}/locations?api-version=2020-01-01`,
    { headers: { Authorization: `Bearer ${token.token}` } }
  );

  const data = await res.json();
  console.log('\n=== AZURE LOCATIONS AVAILABLE FOR YOUR SUBSCRIPTION ===\n');
  data.value.forEach(loc => {
    console.log(`${loc.name.padEnd(25)} | ${loc.displayName}`);
  });
  console.log('\nCopy the names from the LEFT column (e.g. westindia, eastus, etc.)');
}

getLocations().catch(err => {
  console.error('Error:', err.message);
});
