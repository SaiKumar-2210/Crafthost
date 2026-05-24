const { ComputeManagementClient } = require("@azure/arm-compute");
const { NetworkManagementClient } = require("@azure/arm-network");
const { ClientSecretCredential } = require("@azure/identity");

const tenantId = process.env.AZURE_TENANT_ID;
const clientId = process.env.AZURE_CLIENT_ID;
const clientSecret = process.env.AZURE_CLIENT_SECRET;
const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID;
const resourceGroupName = process.env.AZURE_RESOURCE_GROUP || "CraftHost-RG";

const isAzureConfigured = !!(tenantId && clientId && clientSecret && subscriptionId);

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
    console.error(`[Azure Status] Error getting state for ${vmName}:`, err.message);
    return "unknown";
  }
}

module.exports = {
  isAzureConfigured,
  startAzureVM,
  deallocateAzureVM,
  getVMPublicIP,
  getVMStatus
};
