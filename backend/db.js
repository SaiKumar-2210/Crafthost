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

const User = mongoose.model('User', UserSchema);
const Server = mongoose.model('Server', ServerSchema);

module.exports = { connectDB, User, Server };
