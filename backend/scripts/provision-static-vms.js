/**
 * provision-static-vms.js — Pre-provision 2 static VMs for CraftHost
 * 
 * Creates one VM in centralindia and one in koreacentral,
 * waits for IPs, and registers them in MongoDB as running VMNodes.
 * 
 * Run with: node scripts/provision-static-vms.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { connectDB, VMNode } = require('../db');
const {
  isAzureConfigured,
  getVMPublicIP,
  getNextVMName,
} = require('../azure-provisioner');
const { ClientSecretCredential } = require('@azure/identity');
const { ComputeManagementClient } = require('@azure/arm-compute');
const { NetworkManagementClient } = require('@azure/arm-network');
const crypto = require('crypto');

const tenantId = process.env.AZURE_TENANT_ID;
const clientId = process.env.AZURE_CLIENT_ID;
const clientSecret = process.env.AZURE_CLIENT_SECRET;
const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID;
const resourceGroupName = process.env.AZURE_RESOURCE_GROUP || 'crafthost_group';
const DAEMON_SECRET = process.env.DAEMON_SECRET || 'crafthost-internal-node-secret';

// --- Fix #5: Enforce HTTPS for CONTROL_PLANE_URL ---
const rawControlPlaneUrl = process.env.CONTROL_PLANE_URL || 'https://crafthost.saikumar.co.in';
const CONTROL_PLANE_URL = (() => {
  const url = rawControlPlaneUrl;
  if (url.startsWith('http://') && !url.startsWith('http://localhost') && !url.startsWith('http://127.0.0.1')) {
    console.warn('[Provisioner] ⚠️  CONTROL_PLANE_URL is using HTTP — auto-upgrading to HTTPS.');
    return url.replace('http://', 'https://');
  }
  return url;
})();

// --- Fix #1: NSG port restriction ---
const CONTROL_PLANE_IP = process.env.CONTROL_PLANE_IP || null;

// --- Fix #11: Resource tags ---
function getResourceTags(region) {
  return {
    project: 'CraftHost',
    environment: process.env.NODE_ENV || 'production',
    managedBy: 'provision-static-vms',
    region
  };
}

// The 2 static VMs we want
const STATIC_VMS = [
  { vmName: 'crafthost-node-india', region: 'centralindia', vmIndex: 1 },
  { vmName: 'crafthost-node-korea', region: 'koreacentral', vmIndex: 1 },
];

function generateCloudInitScript(azureLocation, vmName) {
  return `#!/bin/bash
exec > /var/log/crafthost-cloud-init.log 2>&1
set -e
set -x

export DAEMON_SECRET="${DAEMON_SECRET}"
export CONTROL_PLANE_URL="${CONTROL_PLANE_URL}"
export VM_NAME="${vmName}"
export VM_REGION="${azureLocation}"

echo "[Cloud-Init] Starting CraftHost Daemon Setup on ${azureLocation} (VM: ${vmName})..."

apt-get update
apt-get install -y curl wget software-properties-common apt-transport-https ca-certificates gnupg openjdk-21-jre-headless

curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

node -v
npm -v
java -version

mkdir -p /opt/crafthost-daemon
cd /opt/crafthost-daemon

for i in {1..5}; do
  echo "[Cloud-Init] Downloading daemon.js (attempt $i)..."
  curl -fsSL -H "x-daemon-secret: $DAEMON_SECRET" "$CONTROL_PLANE_URL/api/system/daemon-script" -o daemon.js && break || { echo "Failed attempt $i, retrying..."; sleep 5; }
done

for i in {1..5}; do
  echo "[Cloud-Init] Downloading package.json (attempt $i)..."
  curl -fsSL -H "x-daemon-secret: $DAEMON_SECRET" "$CONTROL_PLANE_URL/api/system/daemon-package" -o package.json && break || { echo "Failed attempt $i, retrying..."; sleep 5; }
done

if [ ! -f daemon.js ] || [ ! -f package.json ]; then
  echo "[Cloud-Init] CRITICAL: Failed to download daemon files after 5 attempts."
  exit 1
fi

# --- Fix #8: Use npm ci for deterministic, faster installs ---
echo "[Cloud-Init] Running npm ci --omit=dev..."
npm ci --omit=dev || {
  echo "[Cloud-Init] npm ci failed (no lock file?), falling back to npm install --omit=dev..."
  npm install --omit=dev
}

echo "[Cloud-Init] Installing PM2..."
npm install -g pm2

cat > /opt/crafthost-daemon/ecosystem.config.js << 'PM2EOF'
module.exports = {
  apps: [{
    name: 'crafthost-daemon',
    script: './daemon.js',
    env: {
      PORT: 4000,
      DAEMON_SECRET: '${DAEMON_SECRET}',
      VM_NAME: '${vmName}',
      VM_REGION: '${azureLocation}',
      CONTROL_PLANE_URL: '${CONTROL_PLANE_URL}'
    },
    instances: 1,
    autorestart: true,
    max_memory_restart: '1G',
    min_uptime: '10s',
    kill_timeout: 5000
  }]
};
PM2EOF

cd /opt/crafthost-daemon
pm2 start ecosystem.config.js
pm2 save

# --- Fix #6: PM2 startup — capture and execute the generated command ---
echo "[Cloud-Init] Configuring PM2 systemd startup..."
PM2_STARTUP_CMD=$(pm2 startup systemd -u root --hp /root 2>&1 | grep "sudo env" | head -n1)
if [ -n "$PM2_STARTUP_CMD" ]; then
  echo "[Cloud-Init] Executing PM2 startup command: $PM2_STARTUP_CMD"
  eval "$PM2_STARTUP_CMD"
else
  echo "[Cloud-Init] PM2 startup command not found in output, running directly..."
  pm2 startup systemd -u root --hp /root || true
fi
pm2 save --force

echo "[Cloud-Init] CraftHost Daemon Setup Complete! Daemon running on port 4000 as ${vmName}."
`;
}

// --- Fix #4: Cleanup partial resources on failure ---
async function cleanupPartialResources(network, compute, resourceNames) {
  console.log(`  🧹 Cleaning up partial resources...`);
  const { vmName, nicName, publicIpName, osDiskName } = resourceNames;

  const steps = [
    { name: `VM ${vmName}`, fn: async () => { const p = await compute.virtualMachines.beginDelete(resourceGroupName, vmName); await p.pollUntilDone(); } },
    { name: `NIC ${nicName}`, fn: async () => { const p = await network.networkInterfaces.beginDelete(resourceGroupName, nicName); await p.pollUntilDone(); } },
    { name: `PIP ${publicIpName}`, fn: async () => { const p = await network.publicIPAddresses.beginDelete(resourceGroupName, publicIpName); await p.pollUntilDone(); } },
    { name: `Disk ${osDiskName}`, fn: async () => { const p = await compute.disks.beginDelete(resourceGroupName, osDiskName); await p.pollUntilDone(); } },
  ];

  for (const step of steps) {
    try {
      await step.fn();
      console.log(`    ✅ Cleaned ${step.name}`);
    } catch (e) {
      if (e.statusCode !== 404 && e.code !== 'ResourceNotFound') {
        console.error(`    ❌ Failed to clean ${step.name}: ${e.message}`);
      }
    }
  }
}

async function provisionVM(compute, network, vmDef) {
  const { vmName, region } = vmDef;
  const vmSize = process.env.AZURE_VM_SIZE || 'Standard_B2s';
  const tags = getResourceTags(region);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 Provisioning ${vmName} in ${region} (${vmSize})`);
  console.log(`${'='.repeat(60)}`);

  // Check if VM already exists
  try {
    const existing = await compute.virtualMachines.get(resourceGroupName, vmName);
    if (existing) {
      console.log(`  ℹ️  VM ${vmName} already exists in Azure. Skipping creation.`);
      // Just make sure it's running
      const detail = await compute.virtualMachines.get(resourceGroupName, vmName, { expand: 'instanceView' });
      const statuses = detail.instanceView?.statuses || [];
      const powerState = statuses.find(s => s.code?.startsWith('PowerState/'));
      if (powerState && powerState.code !== 'PowerState/running') {
        console.log(`  ▶️  Starting VM ${vmName}...`);
        const startPoller = await compute.virtualMachines.beginStart(resourceGroupName, vmName);
        await startPoller.pollUntilDone();
        console.log(`  ✅ VM started.`);
      }
      return true;
    }
  } catch (e) {
    if (e.statusCode !== 404 && e.code !== 'ResourceNotFound') throw e;
    // VM doesn't exist, proceed with creation
  }

  const vnetName = `CraftHost-VNet-${region}`;
  const subnetName = `CraftHost-Subnet-${region}`;
  const nsgName = `CraftHost-NSG-${region}`;
  const publicIpName = `${vmName}-pip`;
  const nicName = `${vmName}-nic`;
  const osDiskName = `${vmName}-osdisk`;

  // --- Fix #1: NSG source address prefix ---
  const daemonSourcePrefix = CONTROL_PLANE_IP || '*';

  // 1. VNet
  let vnet;
  try {
    vnet = await network.virtualNetworks.get(resourceGroupName, vnetName);
    console.log(`  ✓ VNet ${vnetName} exists`);
  } catch (e) {
    console.log(`  Creating VNet ${vnetName}...`);
    const poller = await network.virtualNetworks.beginCreateOrUpdate(resourceGroupName, vnetName, {
      location: region,
      tags,
      addressSpace: { addressPrefixes: ['10.0.0.0/16'] }
    });
    vnet = await poller.pollUntilDone();
    console.log(`  ✅ VNet created`);
  }

  // 2. Subnet
  let subnet;
  try {
    subnet = await network.subnets.get(resourceGroupName, vnetName, subnetName);
    console.log(`  ✓ Subnet ${subnetName} exists`);
  } catch (e) {
    console.log(`  Creating Subnet ${subnetName}...`);
    const poller = await network.subnets.beginCreateOrUpdate(resourceGroupName, vnetName, subnetName, {
      addressPrefix: '10.0.1.0/24'
    });
    subnet = await poller.pollUntilDone();
    console.log(`  ✅ Subnet created`);
  }

  // 3. NSG
  let nsg;
  try {
    nsg = await network.networkSecurityGroups.get(resourceGroupName, nsgName);
    console.log(`  ✓ NSG ${nsgName} exists`);
  } catch (e) {
    console.log(`  Creating NSG ${nsgName}...`);
    const poller = await network.networkSecurityGroups.beginCreateOrUpdate(resourceGroupName, nsgName, {
      location: region,
      tags,
      securityRules: [
        { name: 'SSH', protocol: 'Tcp', sourcePortRange: '*', destinationPortRange: '22', sourceAddressPrefix: CONTROL_PLANE_IP || '*', destinationAddressPrefix: '*', access: 'Allow', priority: 100, direction: 'Inbound' },
        { name: 'Daemon', protocol: 'Tcp', sourcePortRange: '*', destinationPortRange: '4000', sourceAddressPrefix: daemonSourcePrefix, destinationAddressPrefix: '*', access: 'Allow', priority: 110, direction: 'Inbound' },
        { name: 'Minecraft', protocol: 'Tcp', sourcePortRange: '*', destinationPortRange: '25565-25575', sourceAddressPrefix: '*', destinationAddressPrefix: '*', access: 'Allow', priority: 120, direction: 'Inbound' },
      ]
    });
    nsg = await poller.pollUntilDone();
    console.log(`  ✅ NSG created`);
  }

  // --- Fix #4: Wrap billable resource creation in try/catch with cleanup ---
  try {
    // 4. Public IP
    console.log(`  Creating Public IP ${publicIpName}...`);
    const pipPoller = await network.publicIPAddresses.beginCreateOrUpdate(resourceGroupName, publicIpName, {
      location: region,
      tags,
      publicIPAllocationMethod: 'Static',
      sku: { name: 'Standard' }
    });
    const publicIp = await pipPoller.pollUntilDone();
    console.log(`  ✅ Public IP created: ${publicIp.ipAddress}`);

    // 5. NIC
    console.log(`  Creating NIC ${nicName}...`);
    const nicPoller = await network.networkInterfaces.beginCreateOrUpdate(resourceGroupName, nicName, {
      location: region,
      tags,
      ipConfigurations: [{ name: 'ipconfig1', subnet: { id: subnet.id }, publicIPAddress: { id: publicIp.id } }],
      networkSecurityGroup: { id: nsg.id }
    });
    const nic = await nicPoller.pollUntilDone();
    console.log(`  ✅ NIC created`);

    // 6. Cloud-init
    const cloudInitScript = generateCloudInitScript(region, vmName);
    const customData = Buffer.from(cloudInitScript).toString('base64');

    // --- Fix #2: SSH key auth with password fallback ---
    let osProfile;
    const sshPublicKey = process.env.AZURE_SSH_PUBLIC_KEY;
    const vmPassword = process.env.AZURE_VM_PASSWORD;

    if (sshPublicKey) {
      console.log(`  🔑 Using SSH key authentication`);
      osProfile = {
        computerName: vmName.substring(0, 15),
        adminUsername: 'crafthostadmin',
        customData,
        linuxConfiguration: {
          disablePasswordAuthentication: true,
          ssh: {
            publicKeys: [{
              path: '/home/crafthostadmin/.ssh/authorized_keys',
              keyData: sshPublicKey
            }]
          }
        }
      };
    } else if (vmPassword) {
      console.log(`  🔐 Using password from AZURE_VM_PASSWORD`);
      osProfile = {
        computerName: vmName.substring(0, 15),
        adminUsername: 'crafthostadmin',
        adminPassword: vmPassword,
        customData,
      };
    } else {
      const adminPassword = crypto.randomBytes(12).toString('base64').replace(/[^a-zA-Z0-9]/g, '').substring(0, 16) + 'A1!';
      console.warn(`  ⚠️  No SSH key or password set. Generated password will be LOST.`);
      console.warn(`     Set AZURE_SSH_PUBLIC_KEY or AZURE_VM_PASSWORD in .env`);
      osProfile = {
        computerName: vmName.substring(0, 15),
        adminUsername: 'crafthostadmin',
        adminPassword,
        customData,
      };
    }

    // 7. Create VM
    console.log(`  Creating VM ${vmName} (${vmSize}, Ubuntu 22.04)...`);
    console.log(`  ⏳ This takes 2-3 minutes...`);
    const vmPoller = await compute.virtualMachines.beginCreateOrUpdate(resourceGroupName, vmName, {
      location: region,
      tags,
      hardwareProfile: { vmSize },
      osProfile,
      storageProfile: {
        imageReference: { publisher: 'Canonical', offer: '0001-com-ubuntu-server-jammy', sku: '22_04-lts-gen2', version: 'latest' },
        osDisk: { name: osDiskName, caching: 'ReadWrite', createOption: 'FromImage', managedDisk: { storageAccountType: 'StandardSSD_LRS' } }
      },
      networkProfile: {
        networkInterfaces: [{ id: nic.id, primary: true }]
      }
    });
    await vmPoller.pollUntilDone();
    console.log(`  ✅ VM ${vmName} created!`);

    // 8. Ensure running
    console.log(`  Starting VM ${vmName}...`);
    const startPoller = await compute.virtualMachines.beginStart(resourceGroupName, vmName);
    await startPoller.pollUntilDone();
    console.log(`  ✅ VM running!`);

    return true;

  } catch (err) {
    // --- Fix #4: Cleanup orphaned resources on failure ---
    console.error(`  ❌ Provisioning failed: ${err.message}`);
    await cleanupPartialResources(network, compute, { vmName, nicName, publicIpName, osDiskName });
    throw err;
  }
}

async function main() {
  if (!isAzureConfigured) {
    console.error('❌ Azure is not configured. Set AZURE_* env vars in .env');
    process.exit(1);
  }

  const cred = new ClientSecretCredential(tenantId, clientId, clientSecret);
  const compute = new ComputeManagementClient(cred, subscriptionId);
  const network = new NetworkManagementClient(cred, subscriptionId);

  console.log('🏗️  CraftHost Static VM Provisioner');
  console.log(`   Subscription: ${subscriptionId}`);
  console.log(`   Resource Group: ${resourceGroupName}`);
  console.log(`   VMs to create: ${STATIC_VMS.map(v => `${v.vmName} (${v.region})`).join(', ')}`);

  // Provision each VM
  for (const vmDef of STATIC_VMS) {
    try {
      await provisionVM(compute, network, vmDef);
    } catch (err) {
      console.error(`\n❌ Failed to provision ${vmDef.vmName}: ${err.message}`);
      console.error('   Continuing with next VM...\n');
    }
  }

  // Wait for IPs and register in MongoDB
  console.log('\n⏳ Waiting 10s for IPs to propagate...');
  await new Promise(r => setTimeout(r, 10000));

  await connectDB();

  for (const vmDef of STATIC_VMS) {
    const { vmName, region, vmIndex } = vmDef;
    try {
      const ip = await getVMPublicIP(vmName);
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
