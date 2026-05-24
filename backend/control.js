const express = require('express');
const cors = require('cors');
const http = require('http');
const path = require('path');
const fs = require('fs');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const { connectDB, User, Server, ServerPermission, VMNode } = require('./db');
const { router: authRouter, protect } = require('./routes/auth');
const {
  isAzureConfigured,
  startAzureVM,
  deallocateAzureVM,
  getVMPublicIP,
  getVMStatus
} = require('./azure-provisioner');

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());
connectDB();

// Initialize the VM Nodes in Database on startup
async function initVMNodes() {
  const defaultNodes = [
    { vmName: 'crafthost-vm-mumbai', ip: '127.0.0.1', region: 'ap-south-1', status: 'running' },
    { vmName: 'crafthost-vm-virginia', ip: '127.0.0.1', region: 'us-east-1', status: 'deallocated' },
    { vmName: 'crafthost-vm-oregon', ip: '127.0.0.1', region: 'us-west-2', status: 'deallocated' },
    { vmName: 'crafthost-vm-frankfurt', ip: '127.0.0.1', region: 'eu-central-1', status: 'deallocated' },
    { vmName: 'crafthost-vm-ireland', ip: '127.0.0.1', region: 'eu-west-1', status: 'deallocated' },
    { vmName: 'crafthost-vm-singapore', ip: '127.0.0.1', region: 'ap-southeast-1', status: 'deallocated' },
    { vmName: 'crafthost-vm-tokyo', ip: '127.0.0.1', region: 'ap-northeast-1', status: 'deallocated' },
    { vmName: 'crafthost-vm-sydney', ip: '127.0.0.1', region: 'au-southeast-2', status: 'deallocated' },
    { vmName: 'crafthost-vm-saopaulo', ip: '127.0.0.1', region: 'sa-east-1', status: 'deallocated' }
  ];

  for (const node of defaultNodes) {
    try {
      await VMNode.findOneAndUpdate(
        { vmName: node.vmName },
        { region: node.region },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    } catch (e) {
      console.error(`Error initializing VMNode ${node.vmName}:`, e.message);
    }
  }
}
initVMNodes();

// --- NODE REGISTRY ---
const NODES = {
  'ap-south-1': { vmName: 'crafthost-vm-mumbai', region: 'Asia Pacific (Mumbai)' },
  'us-east-1': { vmName: 'crafthost-vm-virginia', region: 'US East (N. Virginia)' },
  'us-west-2': { vmName: 'crafthost-vm-oregon', region: 'US West (Oregon)' },
  'eu-central-1': { vmName: 'crafthost-vm-frankfurt', region: 'Europe (Frankfurt)' },
  'eu-west-1': { vmName: 'crafthost-vm-ireland', region: 'Europe (Ireland)' },
  'ap-southeast-1': { vmName: 'crafthost-vm-singapore', region: 'Asia Pacific (Singapore)' },
  'ap-northeast-1': { vmName: 'crafthost-vm-tokyo', region: 'Asia Pacific (Tokyo)' },
  'au-southeast-2': { vmName: 'crafthost-vm-sydney', region: 'Australia (Sydney)' },
  'sa-east-1': { vmName: 'crafthost-vm-saopaulo', region: 'South America (São Paulo)' }
};

const DAEMON_SECRET = process.env.DAEMON_SECRET || 'crafthost-internal-node-secret';

// Helper to resolve daemon URL based on VMNode dynamic IP
const getNodeUrlByRegion = async (region) => {
  if (!isAzureConfigured) {
    return 'http://localhost:4000';
  }
  const registryNode = NODES[region];
  if (!registryNode) return 'http://localhost:4000';

  try {
    const vmNode = await VMNode.findOne({ vmName: registryNode.vmName });
    if (vmNode && vmNode.ip && vmNode.status === 'running') {
      return `http://${vmNode.ip}:4000`;
    }
  } catch (err) {
    console.error(`Error getting dynamic node URL for region ${region}:`, err.message);
  }
  return 'http://localhost:4000';
};

const getNodeUrlByServerId = async (serverId) => {
  const SERVERS_DIR = path.join(__dirname, 'servers');
  const metaPath = path.join(SERVERS_DIR, serverId, 'crafthost-meta.json');
  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      // Find region from meta or map friendly node name back to region
      let region = 'ap-south-1';
      for (const regCode of Object.keys(NODES)) {
        if (NODES[regCode].region === meta.node || regCode === meta.region) {
          region = regCode;
          break;
        }
      }
      return await getNodeUrlByRegion(region);
    } catch (e) {
      // ignore
    }
  }
  return 'http://localhost:4000';
};

// Dormant Billing Limits
const checkLimits = (req, res, next) => {
  req.limits = { maxServers: 5, concurrent: 1 };
  next();
};

// --- ACCESS CONTROL MIDDLEWARES (RBAC) ---
const checkServerAccess = async (req, res, next) => {
  const { id } = req.params;
  const SERVERS_DIR = path.join(__dirname, 'servers');
  const metaPath = path.join(SERVERS_DIR, id, 'crafthost-meta.json');

  if (!fs.existsSync(metaPath)) {
    return res.status(404).json({ error: 'Server not found' });
  }

  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    req.serverMeta = meta;

    // 1. Is Owner?
    if (meta.ownerId === req.user._id.toString()) {
      req.serverRole = 'owner';
      return next();
    }

    // 2. Has Shared Permission?
    const perm = await ServerPermission.findOne({ serverId: id, userId: req.user._id });
    if (perm) {
      req.serverRole = perm.role; // 'on_off' or 'full'
      return next();
    }

    return res.status(403).json({ error: 'Access denied: You do not have permission for this server.' });
  } catch (err) {
    return res.status(500).json({ error: 'Authorization check failed: ' + err.message });
  }
};

const requireFullAccess = (req, res, next) => {
  if (req.serverRole !== 'owner' && req.serverRole !== 'full') {
    return res.status(403).json({ error: 'Access denied: Full Control required.' });
  }
  next();
};

// --- ORCHESTRATION APIs ---

// 1. Get All Servers (Queries owned + shared servers)
app.get('/api/servers', protect, async (req, res) => {
  try {
    // Read local files (Control Plane handles file-based metadata registry)
    const SERVERS_DIR = path.join(__dirname, 'servers');
    if (!fs.existsSync(SERVERS_DIR)) fs.mkdirSync(SERVERS_DIR);
    const dirs = fs.readdirSync(SERVERS_DIR);
    
    // Find all guest permissions for this user
    const sharedPerms = await ServerPermission.find({ userId: req.user._id });
    const sharedServerIds = sharedPerms.map(p => p.serverId);

    const servers = [];
    const nodeStatusCache = {};

    for (const id of dirs) {
      const metaPath = path.join(SERVERS_DIR, id, 'crafthost-meta.json');
      if (!fs.existsSync(metaPath)) continue;
      
      // Manual read to prevent require caching
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      
      const isOwner = meta.ownerId === req.user._id.toString();
      const isShared = sharedServerIds.includes(id);
      
      if (!isOwner && !isShared) continue;

      // Identify region
      let region = 'ap-south-1';
      for (const regCode of Object.keys(NODES)) {
        if (NODES[regCode].region === meta.node) {
          region = regCode;
          break;
        }
      }

      // Fetch running servers list from region daemon
      let runningServers = [];
      let serverUptimes = {};
      const nodeUrl = await getNodeUrlByRegion(region);

      if (nodeStatusCache[nodeUrl] === undefined) {
        try {
          const dRes = await fetch(`${nodeUrl}/api/daemon/status`, { headers: { 'x-daemon-secret': DAEMON_SECRET } });
          const statusData = await dRes.json();
          nodeStatusCache[nodeUrl] = {
            running: statusData.running || [],
            serverUptimes: statusData.serverUptimes || {}
          };
        } catch (err) {
          nodeStatusCache[nodeUrl] = { running: [], serverUptimes: {} };
        }
      }

      runningServers = nodeStatusCache[nodeUrl].running;
      serverUptimes = nodeStatusCache[nodeUrl].serverUptimes;

      meta.status = runningServers.includes(id) ? 'online' : 'offline';
      meta.version = `${meta.versionType} ${meta.versionNumber}`;
      
      // Calculate live uptime
      if (meta.status === 'online' && serverUptimes[id] !== undefined) {
        const totalSeconds = serverUptimes[id];
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = totalSeconds % 60;
        meta.uptime = h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
      } else {
        meta.uptime = '0m';
      }

      // Append permission role info if shared
      if (isShared) {
        const pRecord = sharedPerms.find(p => p.serverId === id);
        meta.sharedRole = pRecord.role;
      }

      servers.push(meta);
    }
    res.json({ servers });
  } catch(e) {
    res.status(500).json({ error: 'Control Plane failed: ' + e.message });
  }
});

// 2. Deploy Server (Orchestration with Azure scaling VM boot)
app.post('/api/servers/deploy', protect, checkLimits, async (req, res) => {
  const { name, region = 'ap-south-1', versionType = 'Paper', versionNumber = '1.21.11' } = req.body;
  
  // Enforce Max Servers Limit
  const fs = require('fs');
  const SERVERS_DIR = path.join(__dirname, 'servers');
  let userServersCount = 0;
  if(fs.existsSync(SERVERS_DIR)) {
     fs.readdirSync(SERVERS_DIR).forEach(d => {
        const m = path.join(SERVERS_DIR, d, 'crafthost-meta.json');
        if(fs.existsSync(m)) {
          const meta = JSON.parse(fs.readFileSync(m, 'utf8'));
          if (meta.ownerId === req.user._id.toString()) userServersCount++;
        }
     });
  }
  
  if (userServersCount >= req.limits.maxServers) {
     return res.status(403).json({ error: `Billing Plan Limit: Max ${req.limits.maxServers} servers allowed.` });
  }

  const registryNode = NODES[region];
  if (!registryNode) return res.status(400).json({ error: 'Invalid Region Selected' });

  try {
    // 1. Resolve VMNode in Database
    let vmNode = await VMNode.findOne({ vmName: registryNode.vmName });
    if (!vmNode) {
      vmNode = new VMNode({ vmName: registryNode.vmName, ip: '127.0.0.1', region, status: 'deallocated' });
      await vmNode.save();
    }

    // 2. If VM is deallocated, boot it first
    if (isAzureConfigured && vmNode.status === 'deallocated') {
      console.log(`[Azure Orchestrator] Deploy requested in deallocated node. Booting ${vmNode.vmName}...`);
      await startAzureVM(vmNode.vmName);
      vmNode.status = 'starting';
      await vmNode.save();
      
      // Resolve Dynamic IP
      let resolvedIp = null;
      for (let attempt = 1; attempt <= 10; attempt++) {
        await new Promise(r => setTimeout(r, 4000)); // wait 4 seconds per check
        resolvedIp = await getVMPublicIP(vmNode.vmName);
        if (resolvedIp) break;
      }
      if (!resolvedIp) {
        throw new Error(`Failed to resolve dynamic public IP for Azure VM ${vmNode.vmName}.`);
      }
      vmNode.ip = resolvedIp;
      vmNode.status = 'running';
      await vmNode.save();
    }

    const nodeUrl = await getNodeUrlByRegion(region);

    // 3. Send deploy command to Node Daemon
    const daemonRes = await fetch(`${nodeUrl}/api/daemon/deploy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-daemon-secret': DAEMON_SECRET },
      body: JSON.stringify({ 
        id: `srv-${Date.now()}`,
        name: name || 'New Server',
        ownerId: req.user._id.toString(),
        versionType, 
        versionNumber,
        publicIp: isAzureConfigured ? vmNode.ip : (process.env.PUBLIC_DOMAIN || 'crafthost.saikumar.co.in'),
        node: registryNode.region
      })
    });
    
    if (!daemonRes.ok) throw new Error(await daemonRes.text());
    const data = await daemonRes.json();

    // Increment server count on the VM
    if (vmNode) {
      vmNode.activeServersCount = (vmNode.activeServersCount || 0) + 1;
      await vmNode.save();
    }

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Orchestration / Azure scaling failed: ' + error.message });
  }
});

// 3. Power Action Proxy (Integrated with Azure dynamic boot & cost-saving deallocation)
app.post('/api/servers/:id/power', protect, checkServerAccess, async (req, res) => {
  const { id } = req.params;
  const { action } = req.body;
  const meta = req.serverMeta;

  // Resolve region from node
  let region = 'ap-south-1';
  for (const regCode of Object.keys(NODES)) {
    if (NODES[regCode].region === meta.node) {
      region = regCode;
      break;
    }
  }

  const registryNode = NODES[region];

  try {
    let vmNode = await VMNode.findOne({ vmName: registryNode.vmName });
    if (!vmNode) {
      vmNode = new VMNode({ vmName: registryNode.vmName, ip: '127.0.0.1', region, status: 'deallocated' });
      await vmNode.save();
    }

    // 1. If starting a server on a deallocated VM, boot the VM first!
    if (action === 'start' && isAzureConfigured && vmNode.status === 'deallocated') {
      console.log(`[Azure Orchestrator] Server start requested on deallocated node. Powering on Azure VM ${vmNode.vmName}...`);
      await startAzureVM(vmNode.vmName);
      
      vmNode.status = 'starting';
      await vmNode.save();

      // Resolve Dynamic IP
      let resolvedIp = null;
      for (let attempt = 1; attempt <= 10; attempt++) {
        await new Promise(r => setTimeout(r, 4000));
        resolvedIp = await getVMPublicIP(vmNode.vmName);
        if (resolvedIp) break;
      }
      if (!resolvedIp) {
        throw new Error(`Failed to resolve dynamic IP for Azure VM ${vmNode.vmName}`);
      }
      vmNode.ip = resolvedIp;
      vmNode.status = 'running';
      await vmNode.save();

      // Update metadata on disk with the new IP address
      const SERVERS_DIR = path.join(__dirname, 'servers');
      const metaPath = path.join(SERVERS_DIR, id, 'crafthost-meta.json');
      meta.ip = resolvedIp;
      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));

      // Wait a moment for Daemon script to start responding on port 4000
      await new Promise(r => setTimeout(r, 5000));
    }

    const nodeUrl = await getNodeUrlByRegion(region);

    // 2. Dispatch start/stop power command to the worker daemon
    const daemonRes = await fetch(`${nodeUrl}/api/daemon/power/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-daemon-secret': DAEMON_SECRET },
      body: JSON.stringify({ action })
    });
    const data = await daemonRes.json();

    // 3. Dynamic Cost Saving Deallocation:
    // If the action was "stop" and there are now ZERO active running servers on this VM, deallocate it!
    if (action === 'stop' && isAzureConfigured) {
      // Small pause to let server shut down fully
      setTimeout(async () => {
        try {
          const statusRes = await fetch(`${nodeUrl}/api/daemon/status`, { headers: { 'x-daemon-secret': DAEMON_SECRET } });
          const statusData = await statusRes.json();
          const activeRunningCount = statusData.running ? statusData.running.length : 0;
          
          if (activeRunningCount === 0) {
            console.log(`[Azure Orchestrator] VM ${vmNode.vmName} has 0 running servers. Triggering cost-saving deallocation...`);
            await deallocateAzureVM(vmNode.vmName);
            vmNode.status = 'deallocated';
            await vmNode.save();
          }
        } catch (e) {
          console.error("[Azure Orchestrator] Failed checking daemon for auto-deallocation:", e.message);
        }
      }, 10000); // 10s grace period for Java exit
    }

    res.status(daemonRes.status).json(data);
  } catch(e) {
    res.status(500).json({ error: 'Orchestrator failed: ' + e.message });
  }
});

// --- PERMISSION SHARING ENDPOINTS (OWNER ONLY) ---

// 1. Get shared users list
app.get('/api/servers/:id/permissions', protect, checkServerAccess, async (req, res) => {
  if (req.serverRole !== 'owner') {
    return res.status(403).json({ error: 'Only the server owner can manage permission sharing.' });
  }
  try {
    const perms = await ServerPermission.find({ serverId: req.params.id }).populate('userId', 'name email');
    res.json({
      permissions: perms.map(p => ({
        userId: p.userId._id,
        name: p.userId.name,
        email: p.userId.email,
        role: p.role
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Share access with a user
app.post('/api/servers/:id/permissions', protect, checkServerAccess, async (req, res) => {
  if (req.serverRole !== 'owner') {
    return res.status(403).json({ error: 'Only the server owner can manage permission sharing.' });
  }
  const { email, role } = req.body;
  if (!email || !role || !['on_off', 'full'].includes(role)) {
    return res.status(400).json({ error: 'Valid email and role are required.' });
  }

  try {
    const targetUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (!targetUser) {
      return res.status(404).json({ error: 'No user registered with this email address.' });
    }

    if (targetUser._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ error: 'You cannot share access with yourself.' });
    }

    await ServerPermission.findOneAndUpdate(
      { serverId: req.params.id, userId: targetUser._id },
      { role },
      { upsert: true, new: true }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Revoke access from a user
app.delete('/api/servers/:id/permissions/:userId', protect, checkServerAccess, async (req, res) => {
  if (req.serverRole !== 'owner') {
    return res.status(403).json({ error: 'Only the server owner can manage permission sharing.' });
  }
  try {
    await ServerPermission.findOneAndDelete({ serverId: req.params.id, userId: req.params.userId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// 4. Proxy Endpoints for Features (Authenticated & Secured via RBAC)
const proxyToDaemon = async (req, res, method, endpoint, body) => {
  const nodeUrl = await getNodeUrlByServerId(req.params.id);
  try {
    const opts = { method, headers: { 'x-daemon-secret': DAEMON_SECRET } };
    if (body) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const dRes = await fetch(`${nodeUrl}${endpoint}`, opts);
    const data = await dRes.json();
    res.status(dRes.status).json(data);
  } catch (e) {
    res.status(500).json({ error: 'Daemon failed: ' + e.message });
  }
};

app.get('/api/servers/:id/players', protect, checkServerAccess, (req, res) => {
  proxyToDaemon(req, res, 'GET', `/api/daemon/players/${req.params.id}`);
});

app.post('/api/servers/:id/players/action', protect, checkServerAccess, requireFullAccess, (req, res) => {
  const { action, playerName } = req.body;
  // Handle Promote Operator op/deop
  if (action === 'op' || action === 'deop') {
    proxyToDaemon(req, res, 'POST', `/api/daemon/command/${req.params.id}`, { command: `${action} ${playerName}` });
  } else {
    // Kick or Ban
    proxyToDaemon(req, res, 'POST', `/api/daemon/command/${req.params.id}`, { command: `${action} ${playerName}` });
  }
});

app.get('/api/servers/:id/stats', protect, checkServerAccess, (req, res) => {
  proxyToDaemon(req, res, 'GET', `/api/daemon/stats/${req.params.id}`);
});

app.get('/api/servers/:id/stats-history', protect, checkServerAccess, (req, res) => {
  proxyToDaemon(req, res, 'GET', `/api/daemon/stats-history/${req.params.id}`);
});

app.get('/api/servers/:id/settings', protect, checkServerAccess, requireFullAccess, (req, res) => {
  proxyToDaemon(req, res, 'GET', `/api/daemon/settings/${req.params.id}`);
});

app.post('/api/servers/:id/settings', protect, checkServerAccess, requireFullAccess, (req, res) => {
  proxyToDaemon(req, res, 'POST', `/api/daemon/settings/${req.params.id}`, req.body);
});

// Delete Server Instance
app.delete('/api/servers/:id', protect, checkServerAccess, async (req, res) => {
  if (req.serverRole !== 'owner') {
    return res.status(403).json({ error: 'Only the server owner can delete the server.' });
  }

  const { id } = req.params;
  const SERVERS_DIR = path.join(__dirname, 'servers');
  const serverPath = path.join(SERVERS_DIR, id);

  try {
    // 1. Force kill the server if running
    const nodeUrl = await getNodeUrlByServerId(id);
    try {
      await fetch(`${nodeUrl}/api/daemon/power/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-daemon-secret': DAEMON_SECRET },
        body: JSON.stringify({ action: 'kill' })
      });
      // Give the OS time to release file locks (Java process takes a moment to fully close on Windows)
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (e) {
      // ignore daemon errors
    }

    // 2. Delete server folder on VM via daemon
    try {
      await fetch(`${nodeUrl}/api/daemon/files/${id}?path=/`, {
        method: 'DELETE',
        headers: { 'x-daemon-secret': DAEMON_SECRET }
      });
    } catch(e) {}

    // 3. Clear sharing permissions
    await ServerPermission.deleteMany({ serverId: id });

    // 4. Delete local metadata directory
    try {
      if (fs.existsSync(serverPath)) {
        fs.rmSync(serverPath, { recursive: true, force: true });
      }
    } catch (fsErr) {
      console.warn(`[Control Plane] Could not fully delete directory ${serverPath}, might be locked:`, fsErr.message);
    }

    // Decrement server count in VMNode
    // Note: To be fully accurate, we should find the correct region from meta
    let region = 'ap-south-1';
    if (req.serverMeta && req.serverMeta.node) {
      for (const regCode of Object.keys(NODES)) {
        if (NODES[regCode].region === req.serverMeta.node) {
          region = regCode;
          break;
        }
      }
    }
    
    const vmNode = await VMNode.findOne({ region });
    if (vmNode && vmNode.activeServersCount > 0) {
      vmNode.activeServersCount -= 1;
      await vmNode.save();
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete server: ' + err.message });
  }
});

// File Proxy Routes (Full Access Required)
app.get('/api/servers/:id/files', protect, checkServerAccess, requireFullAccess, (req, res) => {
  const pathQuery = req.query.path ? `?path=${encodeURIComponent(req.query.path)}` : '';
  proxyToDaemon(req, res, 'GET', `/api/daemon/files/${req.params.id}${pathQuery}`);
});

app.delete('/api/servers/:id/files', protect, checkServerAccess, requireFullAccess, (req, res) => {
  const pathQuery = req.query.path ? `?path=${encodeURIComponent(req.query.path)}` : '';
  proxyToDaemon(req, res, 'DELETE', `/api/daemon/files/${req.params.id}${pathQuery}`);
});

app.get('/api/servers/:id/files/content', protect, checkServerAccess, requireFullAccess, (req, res) => {
  const pathQuery = req.query.path ? `?path=${encodeURIComponent(req.query.path)}` : '';
  proxyToDaemon(req, res, 'GET', `/api/daemon/files/content/${req.params.id}${pathQuery}`);
});

app.post('/api/servers/:id/files/content', protect, checkServerAccess, requireFullAccess, (req, res) => {
  proxyToDaemon(req, res, 'POST', `/api/daemon/files/content/${req.params.id}`, req.body);
});

// Streaming Proxies for large files (Full Access Required)
app.post('/api/servers/:id/files/upload', protect, checkServerAccess, requireFullAccess, async (req, res) => {
  const nodeUrl = await getNodeUrlByServerId(req.params.id);
  const pathQuery = req.query.path ? `?path=${encodeURIComponent(req.query.path)}` : '';
  try {
    const dRes = await fetch(`${nodeUrl}/api/daemon/files/upload/${req.params.id}${pathQuery}`, {
      method: 'POST',
      headers: { 'x-daemon-secret': DAEMON_SECRET, 'content-type': req.headers['content-type'] },
      body: req
    });
    const data = await dRes.json();
    res.status(dRes.status).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/servers/:id/files/download', protect, checkServerAccess, requireFullAccess, async (req, res) => {
  const nodeUrl = await getNodeUrlByServerId(req.params.id);
  const pathQuery = req.query.path ? `?path=${encodeURIComponent(req.query.path)}` : '';
  try {
    const dRes = await fetch(`${nodeUrl}/api/daemon/files/download/${req.params.id}${pathQuery}`, { headers: { 'x-daemon-secret': DAEMON_SECRET } });
    res.status(dRes.status);
    dRes.headers.forEach((v, n) => res.setHeader(n, v));
    dRes.body.pipe(res);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- FRONTEND DELIVERY ---
app.use(express.static(path.join(__dirname, '../dist')));
app.get(/^(.*)$/, (req, res) => {
  res.sendFile(path.join(__dirname, '../dist', 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`CraftHost Control Plane (API) running on port ${PORT}`);
});
