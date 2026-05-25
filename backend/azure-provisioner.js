const { ComputeManagementClient } = require("@azure/arm-compute");
const { NetworkManagementClient } = require("@azure/arm-network");
const { ClientSecretCredential } = require("@azure/identity");
const crypto = require('crypto');

const tenantId = process.env.AZURE_TENANT_ID;
const clientId = process.env.AZURE_CLIENT_ID;
const clientSecret = process.env.AZURE_CLIENT_SECRET;
const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID;
const resourceGroupName = process.env.AZURE_RESOURCE_GROUP || "CraftHost-RG";

const isAzureConfigured = !!(tenantId && clientId && clientSecret && subscriptionId);

const DAEMON_SECRET = process.env.DAEMON_SECRET || 'crafthost-internal-node-secret';
const CONTROL_PLANE_URL = process.env.CONTROL_PLANE_URL || 'http://crafthost.saikumar.co.in';

// Fallback regions for restricted Azure subscriptions (e.g., Azure for Students, MSDN, EA with location policies)
// Ordered by likelihood of being allowed on restricted subscriptions.
const FALLBACK_REGIONS = [
  'eastus',
  'westus2',
  'westeurope',
  'centralus',
  'northeurope',
  'eastus2',
  'uksouth',
  'canadacentral',
  'francecentral',
  'japaneast',
  'brazilsouth',
  'australiaeast',
  'centralindia',
  'koreacentral',
  'germanywestcentral',
  'swedencentral',
  'norwayeast',
  'switzerlandnorth',
  'polandcentral',
  'italynorth',
  'spaincentral',
  'uaenorth',
  'southafricanorth',
  'mexicocentral',
  'israelcentral',
  'qatarcentral',
];

const SAFE_REGION_METADATA = [
  { value: 'eastus', label: 'East US', city: 'Virginia', country: '🇺🇸', group: 'Americas' },
  { value: 'westus2', label: 'West US 2', city: 'Washington', country: '🇺🇸', group: 'Americas' },
  { value: 'westeurope', label: 'West Europe', city: 'Amsterdam', country: '🇳🇱', group: 'Europe' },
  { value: 'centralus', label: 'Central US', city: 'Iowa', country: '🇺🇸', group: 'Americas' },
  { value: 'northeurope', label: 'North Europe', city: 'Dublin', country: '🇮🇪', group: 'Europe' },
  { value: 'eastus2', label: 'East US 2', city: 'Virginia', country: '🇺🇸', group: 'Americas' },
  { value: 'uksouth', label: 'UK South', city: 'London', country: '🇬🇧', group: 'Europe' },
  { value: 'canadacentral', label: 'Canada Central', city: 'Toronto', country: '🇨🇦', group: 'Americas' },
  { value: 'francecentral', label: 'France Central', city: 'Paris', country: '🇫🇷', group: 'Europe' },
  { value: 'japaneast', label: 'Japan East', city: 'Tokyo', country: '🇯🇵', group: 'Asia Pacific' },
  { value: 'brazilsouth', label: 'Brazil South', city: 'São Paulo', country: '🇧🇷', group: 'Americas' },
  { value: 'australiaeast', label: 'Australia East', city: 'Sydney', country: '🇦🇺', group: 'Asia Pacific' },
  { value: 'centralindia', label: 'Central India', city: 'Pune', country: '🇮🇳', group: 'Asia Pacific' },
  { value: 'koreacentral', label: 'Korea Central', city: 'Seoul', country: '🇰🇷', group: 'Asia Pacific' },
  { value: 'germanywestcentral', label: 'Germany West Central', city: 'Frankfurt', country: '🇩🇪', group: 'Europe' },
  { value: 'swedencentral', label: 'Sweden Central', city: 'Gävle', country: '🇸🇪', group: 'Europe' },
  { value: 'norwayeast', label: 'Norway East', city: 'Oslo', country: '🇳🇴', group: 'Europe' },
  { value: 'switzerlandnorth', label: 'Switzerland North', city: 'Zurich', country: '🇨🇭', group: 'Europe' },
  { value: 'polandcentral', label: 'Poland Central', city: 'Warsaw', country: '🇵🇱', group: 'Europe' },
  { value: 'italynorth', label: 'Italy North', city: 'Milan', country: '🇮🇹', group: 'Europe' },
  { value: 'spaincentral', label: 'Spain Central', city: 'Madrid', country: '🇪🇸', group: 'Europe' },
  { value: 'uaenorth', label: 'UAE North', city: 'Dubai', country: '🇦🇪', group: 'Middle East & Africa' },
  { value: 'southafricanorth', label: 'South Africa North', city: 'Johannesburg', country: '🇿🇦', group: 'Middle East & Africa' },
  { value: 'mexicocentral', label: 'Mexico Central', city: 'Mexico City', country: '🇲🇽', group: 'Americas' },
  { value: 'israelcentral', label: 'Israel Central', city: 'Tel Aviv', country: '🇮🇱', group: 'Middle East & Africa' },
  { value: 'qatarcentral', label: 'Qatar Central', city: 'Doha', country: '🇶🇦', group: 'Middle East & Africa' },
];

const getAzureClients = () => {
  if (!isAzureConfigured) {
    return null;
  }
  try {
    const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
    return {
      compute: new ComputeManagementClient(credential, subscriptionId),
      network: new NetworkManagementClient(credential, subscriptionId)
    };
  } catch (err) {
    console.error("[Azure Client] Failed to initialize Azure SDK credentials:", err.message);
    return null;
  }
};

// --- Helpers ---

function generateAdminPassword() {
  // Generate a 16-char secure password
  return crypto.randomBytes(12).toString('base64').replace(/[^a-zA-Z0-9]/g, '').substring(0, 16) + 'A1!';
}

function generateCloudInitScript(azureLocation) {
  const script = `#!/bin/bash
exec > /var/log/crafthost-cloud-init.log 2>&1
set -e
set -x

export DAEMON_SECRET="${DAEMON_SECRET}"
export CONTROL_PLANE_URL="${CONTROL_PLANE_URL}"
export NODE_REGION="${azureLocation}"

echo "[Cloud-Init] Starting CraftHost Daemon Setup on ${azureLocation}..."

# Update and install essentials
apt-get update
apt-get install -y curl wget software-properties-common apt-transport-https ca-certificates gnupg openjdk-21-jre-headless

# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Verify installations
node -v
npm -v
java -version

# Create app directory
mkdir -p /opt/crafthost-daemon
cd /opt/crafthost-daemon

# Download daemon files with retry logic
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

# Install dependencies
echo "[Cloud-Init] Running npm install..."
npm install

# Install PM2 globally
echo "[Cloud-Init] Installing PM2..."
npm install -g pm2

# Create PM2 ecosystem file
cat > /opt/crafthost-daemon/ecosystem.config.js << 'PM2EOF'
module.exports = {
  apps: [{
    name: 'crafthost-daemon',
    script: './daemon.js',
    env: {
      PORT: 4000,
      DAEMON_SECRET: '${DAEMON_SECRET}',
      NODE_REGION: '${azureLocation}'
    },
    instances: 1,
    autorestart: true,
    max_memory_restart: '1G',
    min_uptime: '10s',
    kill_timeout: 5000
  }]
};
PM2EOF

# Start daemon with PM2
cd /opt/crafthost-daemon
pm2 start ecosystem.config.js
pm2 save

# Setup PM2 systemd startup (best effort)
pm2 startup systemd -u root --hp /root || true

echo "[Cloud-Init] CraftHost Daemon Setup Complete! Daemon should be running on port 4000."
`;
  return script;
}

function isPolicyError(err) {
  if (!err) return false;
  const msg = (err.message || '').toLowerCase();
  const code = (err.code || '').toLowerCase();
  return msg.includes('disallowed') || 
         msg.includes('policy') || 
         msg.includes('not available for subscription') || 
         msg.includes('invalidresourcelocation') ||
         msg.includes('location') && msg.includes('not available') ||
         msg.includes('requestdisallowedbypolicy') ||
         code === 'requestdisallowedbypolicy';
}

// --- Core Functions ---

async function doesVMExist(vmName) {
  const clients = getAzureClients();
  if (!clients) return false;
  try {
    await clients.compute.virtualMachines.get(resourceGroupName, vmName);
    return true;
  } catch (err) {
    if (err.statusCode === 404 || err.code === 'ResourceNotFound') return false;
    console.error(`[Azure Provisioner] Error checking VM existence for ${vmName}:`, err.message);
    return false;
  }
}

/**
 * Provisions all resources for a VM in a specific region.
 * This is the inner function that gets retried with fallback regions.
 */
async function _ensureAzureVMInRegion(vmName, azureLocation) {
  console.log(`[Azure Provisioner] Provisioning VM ${vmName} in ${azureLocation}...`);

  const clients = getAzureClients();
  if (!clients) {
    throw new Error('Azure is not configured. Cannot provision VM.');
  }

  // 0. Check if VM already exists
  const exists = await doesVMExist(vmName);
  if (exists) {
    console.log(`[Azure Provisioner] VM ${vmName} already exists. Skipping creation.`);
    return true;
  }

  const vnetName = `CraftHost-VNet-${azureLocation}`;
  const subnetName = `CraftHost-Subnet-${azureLocation}`;
  const nsgName = `CraftHost-NSG-${azureLocation}`;
  // Make per-region resource names so fallback retries don't collide with partial resources
  const publicIpName = `${vmName}-${azureLocation}-pip`;
  const nicName = `${vmName}-${azureLocation}-nic`;
  const osDiskName = `${vmName}-${azureLocation}-osdisk`;
  const adminPassword = generateAdminPassword();

  // 1. Ensure Virtual Network
  let vnet;
  try {
    vnet = await clients.network.virtualNetworks.get(resourceGroupName, vnetName);
    console.log(`[Azure Provisioner] VNet ${vnetName} already exists.`);
  } catch (e) {
    console.log(`[Azure Provisioner] Creating VNet ${vnetName}...`);
    const poller = await clients.network.virtualNetworks.beginCreateOrUpdate(resourceGroupName, vnetName, {
      location: azureLocation,
      addressSpace: { addressPrefixes: ['10.0.0.0/16'] }
    });
    vnet = await poller.pollUntilDone();
    console.log(`[Azure Provisioner] VNet ${vnetName} created.`);
  }

  // 2. Ensure Subnet
  let subnet;
  try {
    subnet = await clients.network.subnets.get(resourceGroupName, vnetName, subnetName);
    console.log(`[Azure Provisioner] Subnet ${subnetName} already exists.`);
  } catch (e) {
    console.log(`[Azure Provisioner] Creating Subnet ${subnetName}...`);
    const poller = await clients.network.subnets.beginCreateOrUpdate(resourceGroupName, vnetName, subnetName, {
      addressPrefix: '10.0.1.0/24'
    });
    subnet = await poller.pollUntilDone();
    console.log(`[Azure Provisioner] Subnet ${subnetName} created.`);
  }

  // 3. Ensure Network Security Group
  let nsg;
  try {
    nsg = await clients.network.networkSecurityGroups.get(resourceGroupName, nsgName);
    console.log(`[Azure Provisioner] NSG ${nsgName} already exists.`);
  } catch (e) {
    console.log(`[Azure Provisioner] Creating NSG ${nsgName}...`);
    const poller = await clients.network.networkSecurityGroups.beginCreateOrUpdate(resourceGroupName, nsgName, {
      location: azureLocation,
      securityRules: [
        {
          name: 'SSH',
          protocol: 'Tcp',
          sourcePortRange: '*',
          destinationPortRange: '22',
          sourceAddressPrefix: '*',
          destinationAddressPrefix: '*',
          access: 'Allow',
          priority: 100,
          direction: 'Inbound'
        },
        {
          name: 'Daemon',
          protocol: 'Tcp',
          sourcePortRange: '*',
          destinationPortRange: '4000',
          sourceAddressPrefix: '*',
          destinationAddressPrefix: '*',
          access: 'Allow',
          priority: 110,
          direction: 'Inbound'
        },
        {
          name: 'Minecraft',
          protocol: 'Tcp',
          sourcePortRange: '*',
          destinationPortRange: '25565-25575',
          sourceAddressPrefix: '*',
          destinationAddressPrefix: '*',
          access: 'Allow',
          priority: 120,
          direction: 'Inbound'
        }
      ]
    });
    nsg = await poller.pollUntilDone();
    console.log(`[Azure Provisioner] NSG ${nsgName} created.`);
  }

  // 4. Create Public IP
  console.log(`[Azure Provisioner] Creating Public IP ${publicIpName}...`);
  const pipPoller = await clients.network.publicIPAddresses.beginCreateOrUpdate(resourceGroupName, publicIpName, {
    location: azureLocation,
    publicIPAllocationMethod: 'Dynamic',
    sku: { name: 'Basic' }
  });
  const publicIp = await pipPoller.pollUntilDone();
  console.log(`[Azure Provisioner] Public IP ${publicIpName} created.`);

  // 5. Create Network Interface
  console.log(`[Azure Provisioner] Creating NIC ${nicName}...`);
  const nicPoller = await clients.network.networkInterfaces.beginCreateOrUpdate(resourceGroupName, nicName, {
    location: azureLocation,
    ipConfigurations: [
      {
        name: 'ipconfig1',
        subnet: { id: subnet.id },
        publicIPAddress: { id: publicIp.id }
      }
    ],
    networkSecurityGroup: { id: nsg.id }
  });
  const nic = await nicPoller.pollUntilDone();
  console.log(`[Azure Provisioner] NIC ${nicName} created.`);

  // 6. Prepare cloud-init custom data
  const cloudInitScript = generateCloudInitScript(azureLocation);
  const customData = Buffer.from(cloudInitScript).toString('base64');

  // 7. Create Virtual Machine
  console.log(`[Azure Provisioner] Creating VM ${vmName} (Standard_B2s, Ubuntu 22.04). This will take ~2-3 minutes...`);
  const vmPoller = await clients.compute.virtualMachines.beginCreateOrUpdate(resourceGroupName, vmName, {
    location: azureLocation,
    hardwareProfile: {
      vmSize: 'Standard_B2s'
    },
    osProfile: {
      computerName: vmName,
      adminUsername: 'crafthostadmin',
      adminPassword: adminPassword,
      customData: customData
    },
    storageProfile: {
      imageReference: {
        publisher: 'Canonical',
        offer: '0001-com-ubuntu-server-jammy',
        sku: '22_04-lts-gen2',
        version: 'latest'
      },
      osDisk: {
        name: osDiskName,
        caching: 'ReadWrite',
        createOption: 'FromImage',
        managedDisk: {
          storageAccountType: 'StandardSSD_LRS'
        }
      }
    },
    networkProfile: {
      networkInterfaces: [
        {
          id: nic.id,
          primary: true
        }
      ]
    }
  });
  await vmPoller.pollUntilDone();
  console.log(`[Azure Provisioner] VM ${vmName} created successfully.`);

  // 8. Start the VM (creation may leave it in a stopped state depending on SKU)
  console.log(`[Azure Provisioner] Ensuring VM ${vmName} is running...`);
  const startPoller = await clients.compute.virtualMachines.beginStart(resourceGroupName, vmName);
  await startPoller.pollUntilDone();
  console.log(`[Azure Provisioner] VM ${vmName} is now running!`);

  return true;
}

/**
 * Ensures an Azure VM exists. If it doesn't, creates the full network infrastructure
 * and a Ubuntu 22.04 VM with cloud-init to auto-install the CraftHost daemon.
 * If the preferred region is blocked by subscription policy, automatically retries
 * with a curated list of fallback regions.
 */
async function ensureAzureVM(vmName, preferredLocation) {
  const regionsToTry = [preferredLocation, ...FALLBACK_REGIONS.filter(r => r !== preferredLocation)];
  let lastError = null;

  for (const azureLocation of regionsToTry) {
    try {
      const result = await _ensureAzureVMInRegion(vmName, azureLocation);
      if (azureLocation !== preferredLocation) {
        console.log(`[Azure Provisioner] ⚠️  Used fallback region ${azureLocation} instead of preferred ${preferredLocation}.`);
      }
      return { success: result, actualLocation: azureLocation };
    } catch (err) {
      lastError = err;
      if (isPolicyError(err)) {
        console.warn(`[Azure Provisioner] Region ${azureLocation} blocked by Azure policy. Trying next fallback...`);
        continue;
      }
      // Non-policy error — don't retry, just fail fast
      throw err;
    }
  }

  throw new Error(
    `All Azure regions blocked by subscription policy. Last error: ${lastError?.message || 'Unknown'}`
  );
}

/**
 * Starts an Azure VM.
 * @param {string} vmName
 */
async function startAzureVM(vmName) {
  console.log(`[Azure Orchestrator] Request to start VM: ${vmName}`);
  const clients = getAzureClients();
  if (!clients) {
    console.log(`[Azure Orchestrator] [SIMULATOR] Starting VM: ${vmName} successfully (simulated).`);
    return true;
  }

  try {
    const poller = await clients.compute.virtualMachines.beginStart(resourceGroupName, vmName);
    await poller.pollUntilDone();
    console.log(`[Azure Orchestrator] VM ${vmName} successfully started in Azure!`);
    return true;
  } catch (err) {
    console.error(`[Azure Orchestrator] Error starting VM ${vmName}:`, err.message);
    throw err;
  }
}

/**
 * Deallocates (Stops) an Azure VM to save compute hours.
 * @param {string} vmName
 */
async function deallocateAzureVM(vmName) {
  console.log(`[Azure Orchestrator] Request to deallocate VM: ${vmName}`);
  const clients = getAzureClients();
  if (!clients) {
    console.log(`[Azure Orchestrator] [SIMULATOR] Deallocating VM: ${vmName} successfully (simulated).`);
    return true;
  }

  try {
    const poller = await clients.compute.virtualMachines.beginDeallocate(resourceGroupName, vmName);
    await poller.pollUntilDone();
    console.log(`[Azure Orchestrator] VM ${vmName} successfully deallocated in Azure!`);
    return true;
  } catch (err) {
    console.error(`[Azure Orchestrator] Error deallocating VM ${vmName}:`, err.message);
    throw err;
  }
}

/**
 * Fetches the active public IP address of an Azure VM.
 * @param {string} vmName
 */
async function getVMPublicIP(vmName) {
  const clients = getAzureClients();
  if (!clients) {
    console.log(`[Azure Orchestrator] [SIMULATOR] Resolving IP for ${vmName} to localhost/dynamic.`);
    return process.env.PUBLIC_DOMAIN || "crafthost.saikumar.co.in";
  }

  try {
    // 1. Get VM to find Network Interface ID
    const vm = await clients.compute.virtualMachines.get(resourceGroupName, vmName);
    if (!vm.networkProfile || !vm.networkProfile.networkInterfaces || vm.networkProfile.networkInterfaces.length === 0) {
      throw new Error(`VM ${vmName} has no network interfaces configured.`);
    }

    const nicId = vm.networkProfile.networkInterfaces[0].id;
    const nicName = nicId.split("/").pop();

    // 2. Get NIC to find Public IP resource ID
    const nic = await clients.network.networkInterfaces.get(resourceGroupName, nicName);
    if (!nic.ipConfigurations || nic.ipConfigurations.length === 0) {
      throw new Error(`NIC ${nicName} has no IP configurations.`);
    }

    const ipConfig = nic.ipConfigurations[0];
    if (!ipConfig.publicIPAddress) {
      throw new Error(`NIC ${nicName} does not have an associated Public IP Address resource.`);
    }

    const publicIpId = ipConfig.publicIPAddress.id;
    const publicIpName = publicIpId.split("/").pop();

    // 3. Get Public IP Address resource to extract IPv4
    const pip = await clients.network.publicIPAddresses.get(resourceGroupName, publicIpName);
    if (!pip.ipAddress) {
      console.warn(`[Azure IP Resolver] VM ${vmName} is starting but dynamic public IP is not yet allocated.`);
      return null;
    }

    console.log(`[Azure IP Resolver] Resolved IP for ${vmName} -> ${pip.ipAddress}`);
    return pip.ipAddress;
  } catch (err) {
    console.error(`[Azure IP Resolver] Error resolving IP for VM ${vmName}:`, err.message);
    return null;
  }
}

/**
 * Check power state of Azure VM.
 * @param {string} vmName
 */
async function getVMStatus(vmName) {
  const clients = getAzureClients();
  if (!clients) {
    return "running"; // default to running under simulation
  }

  try {
    const vm = await clients.compute.virtualMachines.get(resourceGroupName, vmName, { expand: "instanceView" });
    const statuses = vm.instanceView.statuses || [];
    const powerState = statuses.find(s => s.code && s.code.startsWith("PowerState/"));
    if (powerState) {
      const state = powerState.code.split("/")[1]; // e.g. "running" or "deallocated"
      return state.toLowerCase();
    }
    return "unknown";
  } catch (err) {
    if (err.statusCode === 404 || err.code === 'ResourceNotFound') return "unknown";
    console.error(`[Azure Status] Error getting state for ${vmName}:`, err.message);
    return "unknown";
  }
}

module.exports = {
  isAzureConfigured,
  ensureAzureVM,
  startAzureVM,
  deallocateAzureVM,
  getVMPublicIP,
  getVMStatus,
  doesVMExist,
  SAFE_REGION_METADATA,
  FALLBACK_REGIONS
};
