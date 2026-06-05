require('dotenv').config();
const mongoose = require('mongoose');
const { User } = require('./db');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://saikumar22102005:projectstartup@cluster0.spzm4pc.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

async function makeAdmin() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: node make-admin.js <email>');
    process.exit(1);
  }

  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    const user = await User.findOne({ email });
    if (!user) {
      console.error(`User with email ${email} not found.`);
      process.exit(1);
    }

    user.role = 'admin';
    await user.save();

    console.log(`✅ User ${user.email} (${user.name}) is now an admin!`);
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

makeAdmin();
