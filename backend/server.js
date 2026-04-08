const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const multer = require('multer');
const util = require('minecraft-server-util');
const { connectDB } = require('./db');
const { router: authRouter, protect } = require('./routes/auth');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

connectDB();
app.use('/api/auth', authRouter);

const SERVERS_DIR = path.join(__dirname, 'servers');
const VERSIONS_DIR = path.join(__dirname, 'versions');

// Ensure directories exist
if (!fs.existsSync(SERVERS_DIR)) fs.mkdirSync(SERVERS_DIR);
if (!fs.existsSync(VERSIONS_DIR)) fs.mkdirSync(VERSIONS_DIR);

const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);
const upload = multer({ dest: UPLOADS_DIR });

// In-memory process storage
const runningProcesses = {};

// Helper to pull RCON credentials from a server's properties
function getRconCredentials(serverId) {
  const propsPath = path.join(SERVERS_DIR, serverId, 'server.properties');
  if (!fs.existsSync(propsPath)) return null;
  
  const props = fs.readFileSync(propsPath, 'utf8');
  let port = 25575;
  let password = '';
  let enabled = false;

  props.split('\n').forEach(line => {
    if (line.startsWith('enable-rcon=')) enabled = line.includes('true');
    if (line.startsWith('rcon.port=')) port = parseInt(line.split('=')[1]);
    if (line.startsWith('rcon.password=')) password = line.split('=')[1].trim();
  });

  if (!enabled || !password) return null;
  return { port, password };
}

// Download helper
async function downloadFile(url, dest) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download ${url}: ${response.statusText}`);
  const fileStream = fs.createWriteStream(dest);
  return new Promise((resolve, reject) => {
    response.body.pipe(fileStream);
    response.body.on('error', reject);
    fileStream.on('finish', resolve);
  });
}

async function ensureServerJar(versionType, versionNumber) {
  // FORCE upgrade to 1.21.11 for Java 21 compatibility!
  if (versionNumber === '1.16.5' || versionNumber === '1.20.4' || versionNumber === '1.21.4' || !versionNumber) {
    console.log('[System] Intercepted old request. Forcing 1.21.11 for Java 21 latest standard.');
    versionNumber = '1.21.11';
  }

  const jarName = `${versionType}-${versionNumber}.jar`;
  const jarPath = path.join(VERSIONS_DIR, jarName);
  
  if (fs.existsSync(jarPath)) return jarPath;

  console.log(`[System] Downloading ${jarName}...`);
  let downloadUrl = '';
  
  if (versionType === 'Paper' && versionNumber === '1.21.11') {
    downloadUrl = 'https://api.papermc.io/v2/projects/paper/versions/1.21.11/builds/69/downloads/paper-1.21.11-69.jar';
  } else if (versionType === 'Vanilla' && versionNumber === '1.21.11') {
    downloadUrl = 'https://piston-data.mojang.com/v1/objects/4707d00eb834b446575d89a61a11b5d548d8c001/server.jar'; // Note: vanilla fallback URL might not perfectly match 1.21.11 hash, preferring paper.
  } else {
    // Fallback to Paper 1.21.11 
    downloadUrl = 'https://api.papermc.io/v2/projects/paper/versions/1.21.11/builds/69/downloads/paper-1.21.11-69.jar';
    console.log(`[System] Unknown version. Defaulting to Paper 1.21.11`);
  }

  try {
    await downloadFile(downloadUrl, jarPath);
    console.log(`[System] Downloaded ${jarName} successfully.`);
    return jarPath;
  } catch (err) {
    console.error(`[System] Error downloading ${jarName}:`, err);
    throw new Error('Failed to download server JAR');
  }
}

// API: Get Servers
app.get('/api/servers', protect, (req, res) => {
  const servers = fs.readdirSync(SERVERS_DIR).map(id => {
    const metaPath = path.join(SERVERS_DIR, id, 'crafthost-meta.json');
    let meta = { name: id, version: 'Unknown', status: 'offline' };
    
    if (fs.existsSync(metaPath)) {
      meta = require(metaPath);
    }
    
    meta.id = id;
    meta.status = runningProcesses[id] ? 'online' : 'offline';
    meta.cpu = runningProcesses[id] ? 'Active' : '0%';
    meta.ram = runningProcesses[id] ? '1.2GB / 4GB' : '0GB / 4GB';
    
    return meta;
  });
  
  res.json({ servers });
});

// API: Deploy Server
app.post('/api/servers/deploy', protect, async (req, res) => {
  const { name, versionType = 'Paper', versionNumber = '1.16.5' } = req.body;
  const id = `srv-${Date.now()}`;
  const serverPath = path.join(SERVERS_DIR, id);
  
  try {
    fs.mkdirSync(serverPath);
    
    // Auto-accept EULA
    fs.writeFileSync(path.join(serverPath, 'eula.txt'), 'eula=true\n');
    
    // Auto-enable RCON for Player Polling
    const rconPassword = `rcn-${Math.random().toString(36).substring(7)}`;
    const serverProps = `enable-rcon=true\nrcon.port=25575\nrcon.password=${rconPassword}\nbroadcast-rcon-to-ops=false\n`;
    fs.writeFileSync(path.join(serverPath, 'server.properties'), serverProps);
    
    // Save metadata
    const meta = {
      id,
      name: name || 'New Server',
      versionType,
      versionNumber,
      ip: `node-${Math.floor(Math.random() * 100)}.crafthost.gg`,
      players: '0/20',
      uptime: '0m',
      node: 'Local Windows Node'
    };
    
    fs.writeFileSync(path.join(serverPath, 'crafthost-meta.json'), JSON.stringify(meta, null, 2));
    
    res.json({ success: true, server: meta });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Power Toggle
app.post('/api/servers/:id/power', protect, async (req, res) => {
  const { id } = req.params;
  const { action } = req.body; // 'start', 'stop', 'restart'
  const serverPath = path.join(SERVERS_DIR, id);

  if (!fs.existsSync(serverPath)) return res.status(404).json({ error: 'Server not found' });

  const metaPath = path.join(serverPath, 'crafthost-meta.json');
  const meta = fs.existsSync(metaPath) ? require(metaPath) : { versionType: 'Paper', versionNumber: '1.16.5' };

  if (action === 'start' || action === 'restart') {
    if (runningProcesses[id]) {
      runningProcesses[id].kill('SIGINT');
      delete runningProcesses[id];
    }

    try {
      const jarPath = await ensureServerJar(meta.versionType, meta.versionNumber);

      // Spawn Java Process with lowered RAM to prevent AWS EC2 OOM Killer
      const serverProcess = spawn('java', ['-Xmx1024M', '-Xms512M', '-jar', jarPath, 'nogui'], {
        cwd: serverPath
      });
      runningProcesses[id] = serverProcess;
      console.log(`[System] Java process spawned with pid ${serverProcess.pid}`);

      // Pipe stdout to WebSockets
      serverProcess.stdout.on('data', (data) => {
        io.to(`server-${id}`).emit('console-log', data.toString());
      });

      // Catch stderr
      serverProcess.stderr.on('data', (data) => {
        console.log(`[ERR] Java stderr: ${data}`);
        io.to(`server-${id}`).emit('console-error', data.toString());
      });

      serverProcess.on('error', (err) => {
        console.log(`[FATAL] Java spawn error: ${err.message}`);
        io.to(`server-${id}`).emit('console-error', err.message);
      });

      serverProcess.on('close', (code, signal) => {
        console.log(`[System] Java process closed with code ${code} signal ${signal}`);
        io.to(`server-${id}`).emit('console-log', `[System] Server process closed with code ${code} signal ${signal}\r\n`);
        delete runningProcesses[id];
        io.to(`server-${id}`).emit('status-update', 'offline');
      });

      res.json({ success: true, status: 'starting' });
      
    } catch (error) {
      res.status(500).json({ error: 'Failed starting server: ' + error.message });
    }
  } else if (action === 'stop') {
    if (runningProcesses[id]) {
      // Send Minecraft 'stop' command gracefully
      runningProcesses[id].stdin.write('stop\r\n');
      res.json({ success: true, status: 'offline' });
    } else {
      res.json({ success: true, status: 'offline' });
    }
  }
});

// --- FILE MANAGER APIs ---
// 1. Get Directory Structure
app.get('/api/servers/:id/files', protect, async (req, res) => {
  const { id } = req.params;
  const currentPath = req.query.path || '/';
  const targetPath = path.join(SERVERS_DIR, id, currentPath);

  if (!fs.existsSync(targetPath)) return res.status(404).json({ error: 'Path not found' });

  try {
    const items = fs.readdirSync(targetPath);
    const files = items.map(item => {
      const stats = fs.statSync(path.join(targetPath, item));
      return {
        name: item,
        type: stats.isDirectory() ? 'folder' : 'file',
        size: stats.isDirectory() ? '--' : `${(stats.size / 1024).toFixed(2)} KB`,
        modified: stats.mtime.toLocaleDateString()
      };
    });
    // Sort folders first
    files.sort((a, b) => a.type === b.type ? a.name.localeCompare(b.name) : (a.type === 'folder' ? -1 : 1));
    res.json({ files });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Read File Content
app.get('/api/servers/:id/files/content', protect, async (req, res) => {
  const { id } = req.params;
  const targetPath = path.join(SERVERS_DIR, id, req.query.path || '');
  if (!fs.existsSync(targetPath)) return res.status(404).json({ error: 'File not found' });
  try {
    const content = fs.readFileSync(targetPath, 'utf8');
    res.json({ content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Write File Content
app.post('/api/servers/:id/files/content', protect, async (req, res) => {
  const { id } = req.params;
  const { path: reqPath, content } = req.body;
  const targetPath = path.join(SERVERS_DIR, id, reqPath || '');
  try {
    fs.writeFileSync(targetPath, content, 'utf8');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Delete File/Folder
app.delete('/api/servers/:id/files', protect, async (req, res) => {
  const { id } = req.params;
  const targetPath = path.join(SERVERS_DIR, id, req.query.path || '');
  try {
    if (fs.existsSync(targetPath)) {
      fs.rmSync(targetPath, { recursive: true, force: true });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Upload Binary File
app.post('/api/servers/:id/files/upload', protect, upload.single('file'), async (req, res) => {
  const { id } = req.params;
  const targetDir = path.join(SERVERS_DIR, id, req.query.path || '/');
  
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
    
    // Move from multer temp to final destination
    const finalPath = path.join(targetDir, req.file.originalname);
    fs.renameSync(req.file.path, finalPath);
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- PLAYERS API ---
// 1. Get Live Players via RCON
app.get('/api/servers/:id/players', protect, async (req, res) => {
  const { id } = req.params;
  if (!runningProcesses[id]) return res.json({ players: [] });

  const creds = getRconCredentials(id);
  if (!creds) return res.json({ players: [] });

  try {
    const client = new util.RCON();
    // Use a short timeout so we don't hang the API if server is booting
    await client.connect('127.0.0.1', creds.port, { timeout: 1000 });
    await client.login(creds.password);
    
    const listRes = await client.run('list');
    client.close();

    let players = [];
    if (listRes.includes('players online:')) {
      const parts = listRes.split('players online:');
      if (parts[1] && parts[1].trim() !== '') {
        players = parts[1].split(',').map(p => ({
          name: p.trim(),
          ping: Math.floor(Math.random() * 50) + 10
        }));
      }
    }
    
    res.json({ players });
  } catch (err) {
    console.error(`[RCON] Server ${id} player fetch failed:`, err.message);
    res.json({ players: [] });
  }
});

// 2. Player Action (Kick/Ban)
app.post('/api/servers/:id/players/action', protect, async (req, res) => {
  const { id } = req.params;
  const { playerName, action } = req.body;
  
  if (!runningProcesses[id]) return res.status(400).json({ error: 'Server offline' });

  const creds = getRconCredentials(id);
  if (!creds) return res.status(400).json({ error: 'RCON missing' });

  try {
    const client = new util.RCON();
    await client.connect('127.0.0.1', creds.port, { timeout: 1000 });
    await client.login(creds.password);
    
    if (action === 'kick') await client.run(`kick ${playerName}`);
    if (action === 'ban') await client.run(`ban ${playerName}`);
    
    client.close();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'RCON Error: ' + err.message });
  }
});

// WebSocket Connection
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('join-server', (serverId) => {
    socket.join(`server-${serverId}`);
    console.log(`Client joined server-${serverId} logs`);
  });

  socket.on('send-command', ({ serverId, command }) => {
    if (runningProcesses[serverId]) {
      runningProcesses[serverId].stdin.write(command + '\r\n');
      io.to(`server-${serverId}`).emit('console-log', `> ${command}\r\n`);
    } else {
      socket.emit('console-error', '[System] Cannot send command, server is offline.\r\n');
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// === Monolithic Frontend Delivery ===
// Serve the static React files from the vite dist build
app.use(express.static(path.join(__dirname, '../dist')));

// Catch-all route to allow React Router to handle client-side routing
app.get(/^(.*)$/, (req, res) => {
  res.sendFile(path.join(__dirname, '../dist', 'index.html'));
});

// ===================================

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`CraftHost Backend API running on port ${PORT}`);
});
