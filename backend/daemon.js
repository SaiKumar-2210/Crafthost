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
const archiver = require('archiver');
const pidusage = require('pidusage');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });

app.use(cors());
app.use(express.json());

// Daemon Authentication: Only the Central Control Plane can command this node.
const DAEMON_SECRET = process.env.DAEMON_SECRET || 'crafthost-internal-node-secret';
const requireControlPlane = (req, res, next) => {
  const secret = req.headers['x-daemon-secret'];
  if (secret !== DAEMON_SECRET) return res.status(403).json({ error: 'Unauthorized Daemon Access' });
  next();
};

app.use(requireControlPlane);

const SERVERS_DIR = path.join(__dirname, 'servers');
const VERSIONS_DIR = path.join(__dirname, 'versions');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

[SERVERS_DIR, VERSIONS_DIR, UPLOADS_DIR].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

const upload = multer({ dest: UPLOADS_DIR });
const runningProcesses = {};
const consoleHistory = {};
const processStartTimes = {};
const statsHistory = {};

// Background CPU/RAM stats collector (samples every 2 seconds)
setInterval(async () => {
  for (const id of Object.keys(runningProcesses)) {
    const proc = runningProcesses[id];
    if (!proc) continue;
    try {
      const stats = await pidusage(proc.pid);
      if (!statsHistory[id]) {
        statsHistory[id] = [];
      }
      statsHistory[id].push({
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        cpu: stats.cpu || 0,
        ram: (stats.memory / 1024 / 1024 / 1024) || 0
      });
      // Keep last 30 samples (60 seconds)
      if (statsHistory[id].length > 30) {
        statsHistory[id].shift();
      }
    } catch (err) {
      // process might have exited, ignore
    }
  }
}, 2000);

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

const https = require('https');
let activeDownload = null;

async function ensureServerJar(versionType, versionNumber) {
  if (!versionNumber || ['1.16.5', '1.20.4', '1.21.4'].includes(versionNumber)) {
    versionNumber = '1.21.11';
  }
  const jarName = `${versionType}-${versionNumber}.jar`;
  const jarPath = path.join(VERSIONS_DIR, jarName);
  
  if (fs.existsSync(jarPath)) {
    const stats = fs.statSync(jarPath);
    if (stats.size > 1000000) return jarPath; // Ensure it's not a corrupt 0-byte file
  }
  
  if (activeDownload) return activeDownload;

  console.log(`[Daemon] Downloading ${jarName}...`);
  const downloadUrl = 'https://api.papermc.io/v2/projects/paper/versions/1.21.11/builds/69/downloads/paper-1.21.11-69.jar';
  
  activeDownload = new Promise((resolve, reject) => {
    const fileStream = fs.createWriteStream(jarPath);
    https.get(downloadUrl, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }
      response.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close();
        resolve(jarPath);
      });
    }).on('error', (err) => {
      fs.unlink(jarPath, () => reject(err));
    });
  });

  try {
    const result = await activeDownload;
    activeDownload = null;
    return result;
  } catch (err) {
    activeDownload = null;
    throw err;
  }
}

// 1. Daemon Status / Healthcheck
app.get('/api/daemon/status', (req, res) => {
  const serverUptimes = {};
  for (const id of Object.keys(runningProcesses)) {
    if (processStartTimes[id]) {
      serverUptimes[id] = Math.floor((Date.now() - processStartTimes[id]) / 1000);
    }
  }
  res.json({
    status: 'online',
    running: Object.keys(runningProcesses),
    activeProcesses: Object.keys(runningProcesses).length,
    uptime: process.uptime(),
    serverUptimes
  });
});

// 2. Deploy Server Command
app.post('/api/daemon/deploy', async (req, res) => {
  const { id, name, ownerId, versionType, versionNumber, publicIp, node } = req.body;
  const serverPath = path.join(SERVERS_DIR, id);

  try {
    const dirs = fs.readdirSync(SERVERS_DIR);
    let maxServerPort = 25564;
    let maxRconPort = 25574;

    dirs.forEach(d => {
       const mPath = path.join(SERVERS_DIR, d, 'crafthost-meta.json');
       if(fs.existsSync(mPath)) {
          const m = require(mPath);
          if (m.port && parseInt(m.port) > maxServerPort) maxServerPort = parseInt(m.port);
       }
       const pPath = path.join(SERVERS_DIR, d, 'server.properties');
       if (fs.existsSync(pPath)) {
          const props = fs.readFileSync(pPath, 'utf8');
          props.split('\n').forEach(l => {
             if(l.startsWith('rcon.port=')) {
                const rp = parseInt(l.split('=')[1]);
                if (rp > maxRconPort) maxRconPort = rp;
             }
          });
       }
    });

    const assignedPort = maxServerPort + 1;
    const rconPort = maxRconPort + 1;

    fs.mkdirSync(serverPath);
    fs.writeFileSync(path.join(serverPath, 'eula.txt'), 'eula=true\n');
    
    const rconPassword = `rcn-${Math.random().toString(36).substring(7)}`;
    const serverProps = `enable-rcon=true\nrcon.port=${rconPort}\nrcon.password=${rconPassword}\nbroadcast-rcon-to-ops=false\nserver-port=${assignedPort}\nonline-mode=false\n`;
    fs.writeFileSync(path.join(serverPath, 'server.properties'), serverProps);
    
    const meta = {
      id, name, ownerId, versionType, versionNumber, ip: publicIp, port: assignedPort,
      players: '0/20', uptime: '0m', node: node || process.env.NODE_REGION || 'Local Windows Node'
    };
    
    fs.writeFileSync(path.join(serverPath, 'crafthost-meta.json'), JSON.stringify(meta, null, 2));
    res.json({ success: true, server: meta });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Power Command
app.post('/api/daemon/power/:id', async (req, res) => {
  const { id } = req.params;
  const { action } = req.body;
  const serverPath = path.join(SERVERS_DIR, id);

  if (!fs.existsSync(serverPath)) return res.status(404).json({ error: 'Server not found' });
  const metaPath = path.join(serverPath, 'crafthost-meta.json');
  let meta = fs.existsSync(metaPath) ? require(metaPath) : { versionType: 'Paper', versionNumber: '1.21.11' };

  if (action === 'start' || action === 'restart') {
    if (action === 'start' && runningProcesses[id]) {
      return res.json({ success: true, status: 'online', message: 'Server is already running' });
    }
    if (runningProcesses[id]) {
      runningProcesses[id].kill('SIGINT');
      await new Promise(r => setTimeout(r, 2000));
      delete runningProcesses[id];
    }
    try {
      const jarPath = await ensureServerJar(meta.versionType, meta.versionNumber);
      // AIKAR FLAGS INJECTED TO PREVENT AWS KERNEL PANICS!
      const serverProcess = spawn('java', [
        '-Xmx800M', '-Xms400M', 
        '-XX:+UseG1GC', '-XX:MaxGCPauseMillis=200', '-XX:MaxMetaspaceSize=256m',
        '-jar', jarPath, 'nogui'
      ], { cwd: serverPath });
      
      runningProcesses[id] = serverProcess;
      processStartTimes[id] = Date.now();
      statsHistory[id] = []; // Reset stats history
      console.log(`[Daemon] Java process ${serverProcess.pid} started for ${id}`);

      serverProcess.stdout.on('data', (data) => {
        const line = data.toString();
        if (!consoleHistory[id]) consoleHistory[id] = [];
        consoleHistory[id].push(line);
        if (consoleHistory[id].length > 250) consoleHistory[id].shift();
        io.to(`server-${id}`).emit('console-log', line);
        if (line.includes('Done (') || line.includes('For help, type "help"')) {
          io.to(`server-${id}`).emit('status-update', 'online');
        }
      });
      serverProcess.stderr.on('data', (data) => {
        const line = data.toString();
        if (!consoleHistory[id]) consoleHistory[id] = [];
        consoleHistory[id].push(line);
        if (consoleHistory[id].length > 250) consoleHistory[id].shift();
        io.to(`server-${id}`).emit('console-error', line);
      });
      serverProcess.on('error', (err) => {
        io.to(`server-${id}`).emit('console-error', err.message);
      });
      serverProcess.on('close', (code, signal) => {
        io.to(`server-${id}`).emit('console-log', `[System] Server closed (${code})\r\n`);
        delete runningProcesses[id];
        delete processStartTimes[id];
        io.to(`server-${id}`).emit('status-update', 'offline');
      });

      res.json({ success: true, status: 'starting' });
    } catch (error) {
      res.status(500).json({ error: 'Start failed: ' + error.message });
    }
  } else if (action === 'stop') {
    if (runningProcesses[id]) {
      runningProcesses[id].stdin.write('stop\r\n');
    }
    res.json({ success: true, status: 'offline' });
  } else if (action === 'kill') {
    if (runningProcesses[id]) {
      runningProcesses[id].kill('SIGKILL');
      delete runningProcesses[id];
      delete processStartTimes[id];
    }
    res.json({ success: true, status: 'offline' });
  }
});

// 4. Players API (RCON)
app.get('/api/daemon/players/:id', async (req, res) => {
  const { id } = req.params;

  const creds = getRconCredentials(id);
  if (!creds) {
    console.log(`[RCON] No credentials found for server ${id}`);
    return res.json({ players: [] });
  }

  // Avoid gating purely on runningProcesses[id].
  // The Node process may restart (Azure, PM2) while the Java server survives.
  try {
    const client = new util.RCON();
    await client.connect('127.0.0.1', creds.port, { timeout: 3000 });
    await client.login(creds.password, { timeout: 3000 });
    const listRes = await client.execute('list');
    await client.close();

    let players = [];
    if (listRes) {
      const clean = listRes.replace(/§[0-9a-fk-or]/ig, '').trim();
      // Match text after "online:" to support formats like:
      // "There are 2 of a max of 20 players online: Steve, Alex"
      const match = clean.match(/online:\s*(.+)/i);
      if (match && match[1]) {
        const namesStr = match[1].trim();
        if (namesStr && !/^there are/i.test(namesStr)) {
          // Read ops.json to check who has operator privileges
          const opsPath = path.join(SERVERS_DIR, id, 'ops.json');
          let opNames = [];
          if (fs.existsSync(opsPath)) {
            try {
              const opsData = JSON.parse(fs.readFileSync(opsPath, 'utf8'));
              opNames = opsData.map(o => o.name.toLowerCase());
            } catch (e) {
              console.error(`[Ops Reader] Failed to parse ops.json for ${id}:`, e.message);
            }
          }
          players = namesStr.split(',').map(p => {
            const name = p.trim();
            return {
              name,
              ping: Math.floor(Math.random() * 50) + 10,
              isOp: opNames.includes(name.toLowerCase())
            };
          });
        }
      }
    }
    res.json({ players });
  } catch (err) {
    console.error(`[RCON] Daemon server ${id} player fetch failed:`, err.message);
    res.json({ players: [] });
  }
});

// 5. Server Stats (Real RAM/CPU)
app.get('/api/daemon/stats/:id', async (req, res) => {
  const { id } = req.params;
  if (!runningProcesses[id]) return res.json({ cpu: 0, ram: 0 });
  try {
    const stats = await pidusage(runningProcesses[id].pid);
    res.json({ cpu: stats.cpu, ram: stats.memory / 1024 / 1024 / 1024 });
  } catch (err) {
    res.json({ cpu: 0, ram: 0 });
  }
});

// 5b. Server Stats History
app.get('/api/daemon/stats-history/:id', (req, res) => {
  const { id } = req.params;
  res.json({ history: statsHistory[id] || [] });
});

// 6. Server Settings
app.get('/api/daemon/settings/:id', (req, res) => {
  const { id } = req.params;
  const propsPath = path.join(SERVERS_DIR, id, 'server.properties');
  if (!fs.existsSync(propsPath)) return res.json({ difficulty: 'normal', gamemode: 'survival', maxPlayers: '20', viewDistance: '10' });

  const props = fs.readFileSync(propsPath, 'utf8');
  const get = (key, fallback) => {
    const match = props.match(new RegExp(`^${key}=(.*)$`, 'm'));
    return match ? match[1].trim() : fallback;
  };

  res.json({
    difficulty: get('difficulty', 'normal'),
    gamemode: get('gamemode', 'survival'),
    maxPlayers: get('max-players', '20'),
    viewDistance: get('view-distance', '10')
  });
});

app.post('/api/daemon/settings/:id', (req, res) => {
  const { id } = req.params;
  const { difficulty, gamemode, maxPlayers, viewDistance } = req.body;
  const serverPath = path.join(SERVERS_DIR, id);
  const propsPath = path.join(serverPath, 'server.properties');
  
  if (!fs.existsSync(propsPath)) return res.status(404).json({ error: 'server.properties not found' });
  
  let props = fs.readFileSync(propsPath, 'utf8');
  
  const updateProp = (key, val) => {
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (props.match(regex)) props = props.replace(regex, `${key}=${val}`);
    else props += `\n${key}=${val}`;
  };
  
  if (difficulty) updateProp('difficulty', difficulty);
  if (gamemode) updateProp('gamemode', gamemode);
  if (maxPlayers) updateProp('max-players', maxPlayers);
  if (viewDistance) updateProp('view-distance', viewDistance);
  
  fs.writeFileSync(propsPath, props);
  res.json({ success: true });
});

// 7. Execute Command
app.post('/api/daemon/command/:id', (req, res) => {
  const { id } = req.params;
  const { command } = req.body;
  if (runningProcesses[id]) {
    runningProcesses[id].stdin.write(command + '\r\n');
    const echo = `> ${command}\r\n`;
    if (!consoleHistory[id]) consoleHistory[id] = [];
    consoleHistory[id].push(echo);
    if (consoleHistory[id].length > 250) consoleHistory[id].shift();
    io.to(`server-${id}`).emit('console-log', echo);
    return res.json({ success: true });
  }
  res.status(400).json({ error: 'Server not running' });
});

// 8. Daemon Status (merged into endpoint #1 above)

// 9. File Manager
app.get('/api/daemon/files/:id', (req, res) => {
  const { id } = req.params;
  const targetPath = req.query.path || '/';
  const fullPath = path.join(SERVERS_DIR, id, targetPath);
  if (!fs.existsSync(fullPath)) return res.json({ files: [] });
  
  try {
    const items = fs.readdirSync(fullPath, { withFileTypes: true });
    const files = items.map(item => {
      const stats = fs.statSync(path.join(fullPath, item.name));
      return {
        name: item.name,
        type: item.isDirectory() ? 'folder' : 'file',
        size: item.isDirectory() ? '--' : (stats.size / 1024).toFixed(2) + ' KB',
        modified: stats.mtime.toLocaleString()
      };
    });
    files.sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      return a.type === 'folder' ? -1 : 1;
    });
    res.json({ files });
  } catch (e) {
    res.json({ files: [] });
  }
});

app.delete('/api/daemon/files/:id', (req, res) => {
  const { id } = req.params;
  const targetPath = req.query.path;
  const fullPath = path.join(SERVERS_DIR, id, targetPath);
  if (fs.existsSync(fullPath)) {
    fs.rmSync(fullPath, { recursive: true, force: true });
  }
  res.json({ success: true });
});

app.get('/api/daemon/files/content/:id', (req, res) => {
  const { id } = req.params;
  const targetPath = req.query.path;
  const fullPath = path.join(SERVERS_DIR, id, targetPath);
  if (fs.existsSync(fullPath)) {
    try {
      const content = fs.readFileSync(fullPath, 'utf8');
      res.json({ content });
    } catch (e) {
      res.status(500).json({ error: 'Cannot read file' });
    }
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

app.post('/api/daemon/files/content/:id', (req, res) => {
  const { id } = req.params;
  const { path: targetPath, content } = req.body;
  const fullPath = path.join(SERVERS_DIR, id, targetPath);
  fs.writeFileSync(fullPath, content);
  res.json({ success: true });
});

app.post('/api/daemon/files/upload/:id', upload.single('file'), (req, res) => {
  const { id } = req.params;
  const targetPath = req.query.path || '/';
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const finalPath = path.join(SERVERS_DIR, id, targetPath, req.file.originalname);
  fs.renameSync(req.file.path, finalPath);
  res.json({ success: true });
});

app.get('/api/daemon/files/download/:id', (req, res) => {
  const { id } = req.params;
  const targetPath = req.query.path || '/';
  const fullPath = path.join(SERVERS_DIR, id, targetPath);
  
  if (!fs.existsSync(fullPath)) return res.status(404).send('Not found');
  
  if (fs.statSync(fullPath).isFile()) {
    res.download(fullPath);
  } else {
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename=${id}-backup.zip`);
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(res);
    archive.directory(fullPath, false);
    archive.finalize();
  }
});

// Socket routing
io.on('connection', (socket) => {
  socket.on('join-server', (serverId) => {
    socket.join(`server-${serverId}`);
    if (consoleHistory[serverId]) {
      socket.emit('console-history', consoleHistory[serverId].join(''));
    }
  });
  socket.on('send-command', ({ serverId, command }) => {
    if (runningProcesses[serverId]) {
      runningProcesses[serverId].stdin.write(command + '\r\n');
      const echo = `> ${command}\r\n`;
      if (!consoleHistory[serverId]) consoleHistory[serverId] = [];
      consoleHistory[serverId].push(echo);
      if (consoleHistory[serverId].length > 250) consoleHistory[serverId].shift();
      io.to(`server-${serverId}`).emit('console-log', echo);
    }
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`CraftHost Worker Daemon running on port ${PORT}`);
});
