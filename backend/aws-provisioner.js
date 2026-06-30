const { 
  EC2Client, 
  RunInstancesCommand, 
  StartInstancesCommand, 
  StopInstancesCommand, 
  DescribeInstancesCommand, 
  DescribeSecurityGroupsCommand, 
  CreateSecurityGroupCommand, 
  AuthorizeSecurityGroupIngressCommand, 
  DescribeImagesCommand, 
  TerminateInstancesCommand
} = require("@aws-sdk/client-ec2");
const crypto = require('crypto');

const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const defaultRegion = process.env.AWS_REGION || "ap-south-1";

const isAwsConfigured = !!(accessKeyId && secretAccessKey);

const DAEMON_SECRET = process.env.DAEMON_SECRET || 'crafthost-internal-node-secret';
const rawControlPlaneUrl = process.env.CONTROL_PLANE_URL || 'https://crafthost.saikumar.co.in';

function validateAndNormalizeControlPlaneUrl(url) {
  if (url.startsWith('http://')) {
    if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) {
      console.warn('[AWS Provisioner] ⚠️  WARNING: CONTROL_PLANE_URL is using HTTP. Acceptable for local dev only.');
      return url;
    }
    console.warn('[AWS Provisioner] ⚠️  CRITICAL: CONTROL_PLANE_URL is using HTTP — secrets will travel unencrypted!');
    return url.replace('http://', 'https://');
  }
  return url;
}

const CONTROL_PLANE_URL = validateAndNormalizeControlPlaneUrl(rawControlPlaneUrl);
const CONTROL_PLANE_IP = process.env.CONTROL_PLANE_IP || null;

const ALLOWED_REGIONS = [
  'ap-south-1',
  'ap-northeast-2',
];

const SAFE_REGION_METADATA = [
  { value: 'ap-south-1', label: 'Asia Pacific (Mumbai)', city: 'Mumbai', country: '🇮🇳', group: 'Asia Pacific' },
  { value: 'ap-northeast-2', label: 'Asia Pacific (Seoul)', city: 'Seoul', country: '🇰🇷', group: 'Asia Pacific' },
];

const getAwsClient = (region = defaultRegion) => {
  if (!isAwsConfigured) return null;
  return new EC2Client({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey
    }
  });
};

function getNextAwsVMName(region, index) {
  return `ch-${region}-${index}`;
}

function generateCloudInitScript(awsLocation, vmName) {
  return `#!/bin/bash
exec > /var/log/crafthost-cloud-init.log 2>&1
set -e
set -x

export DAEMON_SECRET="${DAEMON_SECRET}"
export CONTROL_PLANE_URL="${CONTROL_PLANE_URL}"
export VM_NAME="${vmName}"
export VM_REGION="${awsLocation}"

echo "[Cloud-Init] Starting CraftHost Daemon Setup on ${awsLocation} (VM: ${vmName})..."

apt-get update
apt-get install -y curl wget software-properties-common apt-transport-https ca-certificates gnupg openjdk-21-jre-headless

curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
usermod -aG docker root

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

npm ci --omit=dev || npm install --omit=dev
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
      VM_REGION: '${awsLocation}',
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

pm2 start ecosystem.config.js
pm2 save

PM2_STARTUP_CMD=$(pm2 startup systemd -u root --hp /root 2>&1 | grep "sudo env" | head -n1)
if [ -n "$PM2_STARTUP_CMD" ]; then
  eval "$PM2_STARTUP_CMD"
else
  pm2 startup systemd -u root --hp /root || true
fi
pm2 save --force

echo "[Cloud-Init] CraftHost Daemon Setup Complete!"
`;
}

async function doesAwsVMExist(vmName, region) {
  const client = getAwsClient(region);
  if (!client) return false;
  try {
    const cmd = new DescribeInstancesCommand({
      Filters: [{ Name: "tag:Name", Values: [vmName] }, { Name: "instance-state-name", Values: ["pending", "running", "stopping", "stopped"] }]
    });
    const res = await client.send(cmd);
    return res.Reservations && res.Reservations.length > 0 && res.Reservations[0].Instances.length > 0;
  } catch (err) {
    console.error(`[AWS Provisioner] Error checking VM existence for ${vmName}:`, err.message);
    throw err;
  }
}

async function getAwsInstanceId(vmName, region) {
  const client = getAwsClient(region);
  if (!client) return null;
  const cmd = new DescribeInstancesCommand({
    Filters: [{ Name: "tag:Name", Values: [vmName] }, { Name: "instance-state-name", Values: ["pending", "running", "stopping", "stopped"] }]
  });
  const res = await client.send(cmd);
  if (res.Reservations && res.Reservations.length > 0 && res.Reservations[0].Instances.length > 0) {
    return res.Reservations[0].Instances[0].InstanceId;
  }
  return null;
}

async function ensureAwsVM(vmName, awsLocation) {
  if (!ALLOWED_REGIONS.includes(awsLocation)) {
    throw new Error(`Region "${awsLocation}" is not allowed.`);
  }

  console.log(`[AWS Provisioner] Provisioning VM ${vmName} in ${awsLocation}...`);
  const client = getAwsClient(awsLocation);
  if (!client) throw new Error('AWS is not configured.');

  const exists = await doesAwsVMExist(vmName, awsLocation);
  if (exists) {
    console.log(`[AWS Provisioner] VM ${vmName} already exists.`);
    return { success: true, actualLocation: awsLocation };
  }

  const sgName = `CraftHost-SG`;
  let sgId;
  try {
    const describeSgCmd = new DescribeSecurityGroupsCommand({ GroupNames: [sgName] });
    const sgRes = await client.send(describeSgCmd);
    sgId = sgRes.SecurityGroups[0].GroupId;
  } catch (err) {
    if (err.name === 'InvalidGroup.NotFound' || err.name === 'InvalidParameterValue') {
      console.log(`[AWS Provisioner] Creating Security Group ${sgName}...`);
      const createSgCmd = new CreateSecurityGroupCommand({
        GroupName: sgName,
        Description: "CraftHost Security Group for Minecraft servers"
      });
      const createRes = await client.send(createSgCmd);
      sgId = createRes.GroupId;

      // Add ingress rules
      const authCmd = new AuthorizeSecurityGroupIngressCommand({
        GroupId: sgId,
        IpPermissions: [
          { IpProtocol: 'tcp', FromPort: 22, ToPort: 22, IpRanges: [{ CidrIp: CONTROL_PLANE_IP ? \`\${CONTROL_PLANE_IP}/32\` : '0.0.0.0/0' }] },
          { IpProtocol: 'tcp', FromPort: 4000, ToPort: 4000, IpRanges: [{ CidrIp: CONTROL_PLANE_IP ? \`\${CONTROL_PLANE_IP}/32\` : '0.0.0.0/0' }] },
          { IpProtocol: 'tcp', FromPort: 25565, ToPort: 25575, IpRanges: [{ CidrIp: '0.0.0.0/0' }] }
        ]
      });
      await client.send(authCmd);
    } else {
      throw err;
    }
  }

  const describeImagesCmd = new DescribeImagesCommand({
    Filters: [
      { Name: "name", Values: ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"] },
      { Name: "architecture", Values: ["x86_64"] }
    ],
    Owners: ["099720109477"] // Canonical
  });
  const imagesRes = await client.send(describeImagesCmd);
  const latestAmi = imagesRes.Images.sort((a, b) => new Date(b.CreationDate) - new Date(a.CreationDate))[0].ImageId;

  const userData = Buffer.from(generateCloudInitScript(awsLocation, vmName)).toString('base64');
  const vmSize = process.env.AWS_VM_SIZE || 't3.medium';
  console.log(`[AWS Provisioner] Creating VM ${vmName} (${vmSize})...`);

  const runCmd = new RunInstancesCommand({
    ImageId: latestAmi,
    InstanceType: vmSize,
    MinCount: 1,
    MaxCount: 1,
    SecurityGroupIds: [sgId],
    UserData: userData,
    KeyName: process.env.AWS_KEY_PAIR_NAME || undefined,
    TagSpecifications: [
      {
        ResourceType: "instance",
        Tags: [
          { Key: "Name", Value: vmName },
          { Key: "project", Value: "CraftHost" },
          { Key: "environment", Value: process.env.NODE_ENV || "production" },
          { Key: "managedBy", Value: "aws-provisioner" }
        ]
      }
    ]
  });

  await client.send(runCmd);
  console.log(`[AWS Provisioner] VM ${vmName} created successfully.`);
  
  return { success: true, actualLocation: awsLocation };
}

async function startAwsVM(vmName, awsLocation) {
  console.log(`[AWS Orchestrator] Request to start VM: ${vmName}`);
  const client = getAwsClient(awsLocation);
  if (!client) {
    console.log(`[AWS Orchestrator] [SIMULATOR] Starting VM: ${vmName} successfully (simulated).`);
    return true;
  }
  
  const instanceId = await getAwsInstanceId(vmName, awsLocation);
  if (!instanceId) throw new Error(`VM ${vmName} not found.`);

  const cmd = new StartInstancesCommand({ InstanceIds: [instanceId] });
  await client.send(cmd);
  console.log(`[AWS Orchestrator] VM ${vmName} successfully started!`);
  return true;
}

async function deallocateAwsVM(vmName, awsLocation) {
  console.log(`[AWS Orchestrator] Request to stop VM: ${vmName}`);
  const client = getAwsClient(awsLocation);
  if (!client) {
    console.log(`[AWS Orchestrator] [SIMULATOR] Deallocating VM: ${vmName} successfully (simulated).`);
    return true;
  }
  
  const instanceId = await getAwsInstanceId(vmName, awsLocation);
  if (!instanceId) throw new Error(`VM ${vmName} not found.`);

  const cmd = new StopInstancesCommand({ InstanceIds: [instanceId] });
  await client.send(cmd);
  console.log(`[AWS Orchestrator] VM ${vmName} successfully stopped!`);
  return true;
}

async function getAwsVMPublicIP(vmName, awsLocation) {
  const client = getAwsClient(awsLocation);
  if (!client) {
    return process.env.PUBLIC_DOMAIN || "crafthost.saikumar.co.in";
  }
  
  const cmd = new DescribeInstancesCommand({
    Filters: [{ Name: "tag:Name", Values: [vmName] }, { Name: "instance-state-name", Values: ["running"] }]
  });
  const res = await client.send(cmd);
  
  if (res.Reservations && res.Reservations.length > 0 && res.Reservations[0].Instances.length > 0) {
    const ip = res.Reservations[0].Instances[0].PublicIpAddress;
    console.log(`[AWS IP Resolver] Resolved IP for ${vmName} -> ${ip}`);
    return ip;
  }
  return null;
}

async function getAwsVMStatus(vmName, awsLocation) {
  const client = getAwsClient(awsLocation);
  if (!client) return "running";
  
  try {
    const cmd = new DescribeInstancesCommand({
      Filters: [{ Name: "tag:Name", Values: [vmName] }]
    });
    const res = await client.send(cmd);
    
    if (res.Reservations && res.Reservations.length > 0 && res.Reservations[0].Instances.length > 0) {
      const state = res.Reservations[0].Instances[0].State.Name;
      if (state === 'running') return 'running';
      if (state === 'stopped') return 'deallocated';
      if (state === 'stopping') return 'deallocating';
      if (state === 'pending') return 'starting';
    }
    return "unknown";
  } catch (err) {
    return "unknown";
  }
}

module.exports = {
  isAwsConfigured,
  ensureAwsVM,
  startAwsVM,
  deallocateAwsVM,
  getAwsVMPublicIP,
  getAwsVMStatus,
  doesAwsVMExist,
  getNextAwsVMName,
  SAFE_REGION_METADATA,
  ALLOWED_REGIONS
};
