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

// --- Fix #5: Enforce HTTPS for CONTROL_PLANE_URL ---
const rawControlPlaneUrl = process.env.CONTROL_PLANE_URL || 'https://crafthost.saikumar.co.in';

function validateAndNormalizeControlPlaneUrl(url) {
  if (url.startsWith('http://')) {
    // Allow http://localhost for local dev only
    if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) {
      console.warn('[Azure Provisioner] ⚠️  WARNING: CONTROL_PLANE_URL is using HTTP. Acceptable for local dev only.');
      return url;
    }
    console.warn('[Azure Provisioner] ⚠️  CRITICAL: CONTROL_PLANE_URL is using HTTP — secrets will travel unencrypted!');
    console.warn('[Azure Provisioner]    Auto-upgrading to HTTPS. Set CONTROL_PLANE_URL=https://... in .env to silence this warning.');
    return url.replace('http://', 'https://');
  }
  return url;
}

const CONTROL_PLANE_URL = validateAndNormalizeControlPlaneUrl(rawControlPlaneUrl);

// --- Fix #1: NSG port 4000 restriction ---
// If set, only this IP can reach the daemon port. Otherwise warns and allows all.
const CONTROL_PLANE_IP = process.env.CONTROL_PLANE_IP || null;
if (!CONTROL_PLANE_IP) {
  console.warn('[Azure Provisioner] ⚠️  WARNING: CONTROL_PLANE_IP is not set. Daemon port 4000 will be open to the internet.');
  console.warn('[Azure Provisioner]    Set CONTROL_PLANE_IP=<your-control-plane-ip> in .env to restrict access.');
}

// Regions allowed by this subscription's Azure policy.
// IMPORTANT: Only regions that are permitted by the subscription policy should be listed here.
// Your subscription allows: centralindia, koreacentral
const ALLOWED_REGIONS = [
  'centralindia',
  'koreacentral',
];

// Only show the regions that are actually available to this subscription
const SAFE_REGION_METADATA = [
  { value: 'centralindia', label: 'Central India', city: 'Pune', country: '🇮🇳', group: 'Asia Pacific' },
  { value: 'koreacentral', label: 'Korea Central', city: 'Seoul', country: '🇰🇷', group: 'Asia Pacific' },
];

// --- Fix #11: Consistent resource tags ---
function getResourceTags(azureLocation) {
  return {
    project: 'CraftHost',
    environment: process.env.NODE_ENV || 'production',
    managedBy: 'azure-provisioner',
    region: azureLocation
  };
}

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

// --- Fix #3: VM name length safety (Azure max = 64 chars for Linux VMs) ---
function getNextVMName(region, index) {
  // Truncate region to 15 chars and use short prefix to stay well under 64
  const safeRegion = region.replace(/[^a-z0-9]/gi, '').substring(0, 15);
  const name = `ch-${safeRegion}-${index}`;
  if (name.length > 64) {
    throw new Error(`Generated VM name "${name}" exceeds Azure's 64-character limit.`);
  }
  return name;
}

function generateCloudInitScript(azureLocation, vmName) {
  // --- Fix #5: CONTROL_PLANE_URL is already validated/upgraded to HTTPS above ---
  const script = `#!/bin/bash
exec > /var/log/crafthost-cloud-init.log 2>&1
set -e
set -x

export DAEMON_SECRET="${DAEMON_SECRET}"
export CONTROL_PLANE_URL="${CONTROL_PLANE_URL}"
export VM_NAME="${vmName}"
export VM_REGION="${azureLocation}"

echo "[Cloud-Init] Starting CraftHost Daemon Setup on ${azureLocation} (VM: ${vmName})..."

# Update and install essentials
apt-get update
apt-get install -y curl wget software-properties-common apt-transport-https ca-certificates gnupg openjdk-21-jre-headless

# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
usermod -aG docker root

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

# --- Fix #8: Use npm ci for deterministic, faster installs ---
echo "[Cloud-Init] Running npm ci --omit=dev..."
npm ci --omit=dev || {
  echo "[Cloud-Init] npm ci failed (no lock file?), falling back to npm install --omit=dev..."
  npm install --omit=dev
}

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

# Start daemon with PM2
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
         (msg.includes('location') && msg.includes('not available')) ||
         msg.includes('requestdisallowedbypolicy') ||
         code === 'requestdisallowedbypolicy';
}

function isQuotaError(err) {
  if (!err) return false;
  const msg = (err.message || '').toLowerCase();
  return msg.includes('cannot create more than') ||
         msg.includes('quota') ||
         msg.includes('quotaexceeded') ||
         msg.includes('limit') && msg.includes('subscription');
}

// --- Fix #9: Retry helper for race conditions ---
async function retryOnConflict(fn, { maxRetries = 3, baseDelayMs = 2000 } = {}) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const msg = (err.message || '').toLowerCase();
      const code = (err.code || '').toLowerCase();
      const isConflict = code === 'anotheroperationinprogress' ||
                         msg.includes('anotheroperationinprogress') ||
                         msg.includes('conflict') ||
                         code === 'conflict';
      
      if (isConflict && attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        console.warn(`[Azure Provisioner] Conflict detected (attempt ${attempt}/${maxRetries}). Retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
}

// --- Core Functions ---

// --- Fix #10: doesVMExist() — only return false for 404, rethrow real errors ---
async function doesVMExist(vmName) {
  const clients = getAzureClients();
  if (!clients) return false;
  try {
    await clients.compute.virtualMachines.get(resourceGroupName, vmName);
    return true;
  } catch (err) {
    if (err.statusCode === 404 || err.code === 'ResourceNotFound') return false;
    // Don't swallow auth errors (401, 403) or server errors (500) — rethrow them
    console.error(`[Azure Provisioner] Error checking VM existence for ${vmName} (status: ${err.statusCode}):`, err.message);
    throw err;
  }
}

// --- Fix #4: Cleanup partial resources on provisioning failure ---
async function cleanupPartialResources(clients, resourceGroupName, resourceNames, azureLocation) {
  const { publicIpName, nicName, osDiskName, vmName } = resourceNames;
  console.warn(`[Azure Provisioner] 🧹 Cleaning up partial resources after failed provisioning...`);

  // Order matters: VM → NIC → Public IP → Disk (reverse creation order)
  const cleanupSteps = [
    {
      name: `VM ${vmName}`,
      fn: async () => {
        try {
          const poller = await clients.compute.virtualMachines.beginDelete(resourceGroupName, vmName);
          await poller.pollUntilDone();
        } catch (e) {
          if (e.statusCode !== 404 && e.code !== 'ResourceNotFound') throw e;
        }
      }
    },
    {
      name: `NIC ${nicName}`,
      fn: async () => {
        try {
          const poller = await clients.network.networkInterfaces.beginDelete(resourceGroupName, nicName);
          await poller.pollUntilDone();
        } catch (e) {
          if (e.statusCode !== 404 && e.code !== 'ResourceNotFound') throw e;
        }
      }
    },
    {
      name: `Public IP ${publicIpName}`,
      fn: async () => {
        try {
          const poller = await clients.network.publicIPAddresses.beginDelete(resourceGroupName, publicIpName);
          await poller.pollUntilDone();
        } catch (e) {
          if (e.statusCode !== 404 && e.code !== 'ResourceNotFound') throw e;
        }
      }
    },
    {
      name: `OS Disk ${osDiskName}`,
      fn: async () => {
        try {
          const poller = await clients.compute.disks.beginDelete(resourceGroupName, osDiskName);
          await poller.pollUntilDone();
        } catch (e) {
          if (e.statusCode !== 404 && e.code !== 'ResourceNotFound') throw e;
        }
      }
    }
  ];

  for (const step of cleanupSteps) {
    try {
      await step.fn();
      console.log(`[Azure Provisioner]    ✅ Cleaned up ${step.name}`);
    } catch (e) {
      console.error(`[Azure Provisioner]    ❌ Failed to clean up ${step.name}: ${e.message}`);
    }
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

  // Derive resource names using vmName (already includes region + index)
  const tags = getResourceTags(azureLocation);

  const vnetName = `CraftHost-VNet-${azureLocation}`;
  const subnetName = `CraftHost-Subnet-${azureLocation}`;
  const nsgName = `CraftHost-NSG-${azureLocation}`;
  // Make per-region resource names so fallback retries don't collide with partial resources
  const publicIpName = `${vmName}-${azureLocation}-pip`;
  const nicName = `${vmName}-${azureLocation}-nic`;
  const osDiskName = `${vmName}-${azureLocation}-osdisk`;

  // --- Fix #9: Wrap VNet/Subnet in retry for race conditions ---

  // 1. Ensure Virtual Network
  let vnet;
  try {
    vnet = await clients.network.virtualNetworks.get(resourceGroupName, vnetName);
    console.log(`[Azure Provisioner] VNet ${vnetName} already exists.`);
  } catch (e) {
    console.log(`[Azure Provisioner] Creating VNet ${vnetName}...`);
    vnet = await retryOnConflict(async () => {
      const poller = await clients.network.virtualNetworks.beginCreateOrUpdate(resourceGroupName, vnetName, {
        location: azureLocation,
        tags,
        addressSpace: { addressPrefixes: ['10.0.0.0/16'] }
      });
      return await poller.pollUntilDone();
    });
    console.log(`[Azure Provisioner] VNet ${vnetName} created.`);
  }

  // 2. Ensure Subnet
  let subnet;
  try {
    subnet = await clients.network.subnets.get(resourceGroupName, vnetName, subnetName);
    console.log(`[Azure Provisioner] Subnet ${subnetName} already exists.`);
  } catch (e) {
    console.log(`[Azure Provisioner] Creating Subnet ${subnetName}...`);
    subnet = await retryOnConflict(async () => {
      const poller = await clients.network.subnets.beginCreateOrUpdate(resourceGroupName, vnetName, subnetName, {
        addressPrefix: '10.0.1.0/24'
      });
      return await poller.pollUntilDone();
    });
    console.log(`[Azure Provisioner] Subnet ${subnetName} created.`);
  }

  // 3. Ensure Network Security Group
  // --- Fix #1: Restrict daemon port to CONTROL_PLANE_IP ---
  const daemonSourcePrefix = CONTROL_PLANE_IP || '*';
  let nsg;
  try {
    nsg = await clients.network.networkSecurityGroups.get(resourceGroupName, nsgName);
    console.log(`[Azure Provisioner] NSG ${nsgName} already exists.`);
  } catch (e) {
    console.log(`[Azure Provisioner] Creating NSG ${nsgName}...`);
    const poller = await clients.network.networkSecurityGroups.beginCreateOrUpdate(resourceGroupName, nsgName, {
      location: azureLocation,
      tags,
      securityRules: [
        {
          name: 'SSH',
          protocol: 'Tcp',
          sourcePortRange: '*',
          destinationPortRange: '22',
          sourceAddressPrefix: CONTROL_PLANE_IP || '*',
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
          sourceAddressPrefix: daemonSourcePrefix,
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

  // --- Fix #4: Wrap resource creation in try/catch with cleanup ---
  try {
    // 4. Create Public IP
    console.log(`[Azure Provisioner] Creating Public IP ${publicIpName}...`);
    const pipPoller = await clients.network.publicIPAddresses.beginCreateOrUpdate(resourceGroupName, publicIpName, {
      location: azureLocation,
      tags,
      publicIPAllocationMethod: 'Static',
      sku: { name: 'Standard' }
    });
    const publicIp = await pipPoller.pollUntilDone();
    console.log(`[Azure Provisioner] Public IP ${publicIpName} created.`);

    // 5. Create Network Interface
    console.log(`[Azure Provisioner] Creating NIC ${nicName}...`);
    const nicPoller = await clients.network.networkInterfaces.beginCreateOrUpdate(resourceGroupName, nicName, {
      location: azureLocation,
      tags,
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

    // 6. Prepare cloud-init custom data (pass vmName for daemon agent identity)
    const cloudInitScript = generateCloudInitScript(azureLocation, vmName);
    const customData = Buffer.from(cloudInitScript).toString('base64');

    // --- Fix #7: Default VM size upgraded from B1s to B2s ---
    const vmSize = process.env.AZURE_VM_SIZE || 'Standard_B2s';
    console.log(`[Azure Provisioner] Creating VM ${vmName} (${vmSize}, Ubuntu 22.04). This will take ~2-3 minutes...`);

    // --- Fix #2: SSH key auth with password fallback ---
    let osProfile;
    const sshPublicKey = process.env.AZURE_SSH_PUBLIC_KEY;
    const vmPassword = process.env.AZURE_VM_PASSWORD;

    if (sshPublicKey) {
      // Preferred: SSH key authentication
      console.log(`[Azure Provisioner] Using SSH key authentication.`);
      osProfile = {
        computerName: vmName,
        adminUsername: 'crafthostadmin',
        customData: customData,
        linuxConfiguration: {
          disablePasswordAuthentication: true,
          ssh: {
            publicKeys: [
              {
                path: '/home/crafthostadmin/.ssh/authorized_keys',
                keyData: sshPublicKey
              }
            ]
          }
        }
      };
    } else if (vmPassword) {
      // Fallback: Password from env (persisted, not lost)
      console.log(`[Azure Provisioner] Using password authentication from AZURE_VM_PASSWORD.`);
      osProfile = {
        computerName: vmName,
        adminUsername: 'crafthostadmin',
        adminPassword: vmPassword,
        customData: customData
      };
    } else {
      // Last resort: Generate password but warn loudly
      const generatedPassword = crypto.randomBytes(12).toString('base64').replace(/[^a-zA-Z0-9]/g, '').substring(0, 16) + 'A1!';
      console.warn(`[Azure Provisioner] ⚠️  WARNING: No AZURE_SSH_PUBLIC_KEY or AZURE_VM_PASSWORD set.`);
      console.warn(`[Azure Provisioner]    Generated password will be lost after this session.`);
      console.warn(`[Azure Provisioner]    Set AZURE_SSH_PUBLIC_KEY or AZURE_VM_PASSWORD in .env for persistent access.`);
      osProfile = {
        computerName: vmName,
        adminUsername: 'crafthostadmin',
        adminPassword: generatedPassword,
        customData: customData
      };
    }

    // 7. Create Virtual Machine
    const vmPoller = await clients.compute.virtualMachines.beginCreateOrUpdate(resourceGroupName, vmName, {
      location: azureLocation,
      tags,
      hardwareProfile: {
        vmSize: vmSize
      },
      osProfile,
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

  } catch (err) {
    // --- Fix #4: Cleanup orphaned resources on failure ---
    console.error(`[Azure Provisioner] ❌ Provisioning failed for ${vmName}: ${err.message}`);
    await cleanupPartialResources(clients, resourceGroupName, {
      publicIpName,
      nicName,
      osDiskName,
      vmName
    }, azureLocation);
    throw err;
  }
}

/**
 * Ensures an Azure VM exists in the EXACT specified region.
 * No fallback, no region hopping — deploys only where the user selected.
 * If the region is blocked by policy or hits a quota, it fails immediately
 * with a clear error message.
 */
async function ensureAzureVM(vmName, azureLocation) {
  // Validate region is in the allowed list
  if (!ALLOWED_REGIONS.includes(azureLocation)) {
    throw new Error(
      `Region "${azureLocation}" is not available on this subscription. ` +
      `Allowed regions: ${ALLOWED_REGIONS.join(', ')}`
    );
  }

  try {
    const result = await _ensureAzureVMInRegion(vmName, azureLocation);
    return { success: result, actualLocation: azureLocation };
  } catch (err) {
    if (isPolicyError(err)) {
      throw new Error(
        `Region "${azureLocation}" is blocked by your Azure subscription policy. ` +
        `Please select a different region.`
      );
    }
    if (isQuotaError(err)) {
      throw new Error(
        `Region "${azureLocation}" has reached its resource quota limit. ` +
        `Run "npm run cleanup-azure" to free orphaned resources, then retry.`
      );
    }
    throw err;
  }
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
  getNextVMName,
  SAFE_REGION_METADATA,
  ALLOWED_REGIONS
};
