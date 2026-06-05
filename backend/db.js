const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://saikumar22102005:projectstartup@cluster0.spzm4pc.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

const connectDB = async () => {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Successfully connected to MongoDB Atlas');
  } catch (error) {
    console.error('❌ Error connecting to MongoDB:', error.message);
    process.exit(1);
  }
};

// --- Models ---

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  plan: { type: String, default: 'Free Tier' },
  role: { type: String, default: 'user', enum: ['user', 'admin'] }
}, { timestamps: true });

const ServerPermissionSchema = new mongoose.Schema({
  serverId: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  role: { type: String, enum: ['on_off', 'full'], required: true }
}, { timestamps: true });

// Avoid duplicate sharing records per user per server
ServerPermissionSchema.index({ serverId: 1, userId: 1 }, { unique: true });

// --- VMNode: Supports multiple VMs per region + heartbeat tracking ---
const VMNodeSchema = new mongoose.Schema({
  vmName: { type: String, required: true, unique: true },
  // e.g. "crafthost-vm-eastus-1", "crafthost-vm-eastus-2"
  ip: { type: String },
  region: { type: String, required: true, index: true },
  vmIndex: { type: Number, required: true, default: 1 },
  status: {
    type: String,
    enum: ['deallocated', 'provisioning', 'starting', 'running', 'unhealthy'],
    default: 'deallocated'
  },
  activeServersCount: { type: Number, default: 0 },
  maxServers: { type: Number, default: 5 },
  // Heartbeat fields (pushed by daemon agent)
  lastHeartbeat: { type: Date },
  cpuPercent: { type: Number, default: 0 },
  ramUsedMB: { type: Number, default: 0 },
  runningServerIds: { type: [String], default: [] },
}, { timestamps: true });

VMNodeSchema.index({ region: 1, status: 1 });
VMNodeSchema.index({ region: 1, activeServersCount: 1 });

// --- GameServer: Replaces filesystem-based metadata ---
const GameServerSchema = new mongoose.Schema({
  serverId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  vmNodeId: { type: mongoose.Schema.Types.ObjectId, ref: 'VMNode' },
  vmName: { type: String },
  region: { type: String, required: true },
  ip: { type: String },
  port: { type: Number },
  versionType: { type: String, default: 'Paper' },
  versionNumber: { type: String, default: '1.21.11' },
  status: {
    type: String,
    enum: ['queued', 'provisioning', 'deploying', 'online', 'offline', 'error'],
    default: 'queued'
  },
  deployJobId: { type: String },
  node: { type: String },  // Legacy compat: friendly region name
}, { timestamps: true });

GameServerSchema.index({ ownerId: 1 });
GameServerSchema.index({ vmNodeId: 1 });
GameServerSchema.index({ vmName: 1 });
GameServerSchema.index({ serverId: 1, ownerId: 1 });

// --- DeployJob: Async job status for frontend polling ---
const DeployJobSchema = new mongoose.Schema({
  jobId: { type: String, required: true, unique: true },
  type: { type: String, enum: ['deploy', 'stop', 'delete'], required: true },
  status: {
    type: String,
    enum: ['queued', 'provisioning_vm', 'starting_vm', 'deploying_server', 'completed', 'failed'],
    default: 'queued'
  },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  serverId: { type: String },
  region: { type: String },
  progress: { type: Number, default: 0 },       // 0-100
  message: { type: String, default: 'Queued' },  // Human-readable status
  result: { type: mongoose.Schema.Types.Mixed },  // Final server data on success
  error: { type: String },                        // Error message on failure
}, { timestamps: true });

DeployJobSchema.index({ userId: 1 });
DeployJobSchema.index({ jobId: 1, userId: 1 });

const User = mongoose.model('User', UserSchema);
const ServerPermission = mongoose.model('ServerPermission', ServerPermissionSchema);
const VMNode = mongoose.model('VMNode', VMNodeSchema);
const GameServer = mongoose.model('GameServer', GameServerSchema);
const DeployJob = mongoose.model('DeployJob', DeployJobSchema);

module.exports = { connectDB, User, ServerPermission, VMNode, GameServer, DeployJob };
