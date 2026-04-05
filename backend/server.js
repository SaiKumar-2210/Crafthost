const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

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

// In-memory process storage
const runningProcesses = {};

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

// Ensure server jar exists
async function ensureServerJar(versionType, versionNumber) {
  const jarName = `${versionType}-${versionNumber}.jar`;
  const jarPath = path.join(VERSIONS_DIR, jarName);
  
  if (fs.existsSync(jarPath)) return jarPath;

  console.log(`[System] Downloading ${jarName}...`);
  // Simplified logic for a few popular ones to simulate fetching
  // In a production app, you'd integrate the Paper API or Mojang Metadata API
  let downloadUrl = '';
  
  if (versionType === 'Paper' && versionNumber === '1.20.4') {
    downloadUrl = 'https://api.papermc.io/v2/projects/paper/versions/1.20.4/builds/496/downloads/paper-1.20.4-496.jar';
  } else if (versionType === 'Vanilla' && versionNumber === '1.20.4') {
    downloadUrl = 'https://piston-data.mojang.com/v1/objects/8dd1a28015f51b1803213892b50b7b4fc76e594d/server.jar'; // 1.20.4 vanilla
  } else if (versionType === 'Vanilla' && versionNumber === '1.16.5') {
    downloadUrl = 'https://launcher.mojang.com/v1/objects/1b557e7b033b583cd9f66746b7a9ab1ec1673ce3/server.jar'; // 1.16.5 vanilla
  } else if (versionType === 'Paper' && versionNumber === '1.16.5') {
    downloadUrl = 'https://api.papermc.io/v2/projects/paper/versions/1.16.5/builds/794/downloads/paper-1.16.5-794.jar';
  } else {
    // Fallback to Paper 1.16.5 if unknown (since user has Java 8)
    downloadUrl = 'https://api.papermc.io/v2/projects/paper/versions/1.16.5/builds/794/downloads/paper-1.16.5-794.jar';
    console.log(`[System] Unknown version. Defaulting to Paper 1.16.5 for Java 8 compatibility.`);
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
      
      // Spawn Java Process
      const serverProcess = spawn('java', ['-Xmx2G', '-Xms1G', '-jar', jarPath, 'nogui'], {
        cwd: serverPath
      });

      runningProcesses[id] = serverProcess;

      // Pipe stdout to WebSockets
      serverProcess.stdout.on('data', (data) => {
        io.to(`server-${id}`).emit('console-log', data.toString());
      });

      // Catch stderr (like UnsupportedClassVersionError for Java mismatch)
      serverProcess.stderr.on('data', (data) => {
        io.to(`server-${id}`).emit('console-error', data.toString());
      });

      serverProcess.on('close', (code) => {
        io.to(`server-${id}`).emit('console-log', `[System] Server process closed with code ${code}\r\n`);
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`CraftHost Backend API running on port ${PORT}`);
});
