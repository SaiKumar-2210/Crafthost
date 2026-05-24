const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb+srv://saikumar22102005:projectstartup@cluster0.spzm4pc.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

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
  plan: { type: String, default: 'Free Tier' }
}, { timestamps: true });

const ServerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  serverId: { type: String, required: true, unique: true },
  ip: { type: String, required: true },
  versionType: { type: String, required: true },
  versionNumber: { type: String, required: true },
  port: { type: Number, required: true }
}, { timestamps: true });

const ServerPermissionSchema = new mongoose.Schema({
  serverId: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  role: { type: String, enum: ['on_off', 'full'], required: true }
}, { timestamps: true });

// Avoid duplicate sharing records per user per server
ServerPermissionSchema.index({ serverId: 1, userId: 1 }, { unique: true });

const VMNodeSchema = new mongoose.Schema({
  vmName: { type: String, required: true, unique: true },
  ip: { type: String, required: true },
  region: { type: String, required: true },
  status: { type: String, enum: ['deallocated', 'starting', 'running'], default: 'deallocated' },
  activeServersCount: { type: Number, default: 0 },
  maxServers: { type: Number, default: 5 }
}, { timestamps: true });

const User = mongoose.model('User', UserSchema);
const Server = mongoose.model('Server', ServerSchema);
const ServerPermission = mongoose.model('ServerPermission', ServerPermissionSchema);
const VMNode = mongoose.model('VMNode', VMNodeSchema);

module.exports = { connectDB, User, Server, ServerPermission, VMNode };
