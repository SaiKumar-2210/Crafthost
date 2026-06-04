require('dotenv').config();
const Redis = require('ioredis');
const { connectDB, GameServer, DeployJob, VMNode } = require('./db');
const { REDIS_HOST, REDIS_PORT } = require('./queues');

async function run() {
  // 1. Connect and clear MongoDB
  await connectDB();
  console.log('🧹 Clearing GameServers, DeployJobs, and VMNodes from MongoDB...');
  
  const serverResult = await GameServer.deleteMany({});
  console.log(`Deleted ${serverResult.deletedCount} GameServer records.`);
  
  const jobResult = await DeployJob.deleteMany({});
  console.log(`Deleted ${jobResult.deletedCount} DeployJob records.`);

  const vmResult = await VMNode.deleteMany({});
  console.log(`Deleted ${vmResult.deletedCount} VMNode records.`);

  // 2. Connect and clear Redis
  console.log(`🔌 Connecting to Redis at ${REDIS_HOST}:${REDIS_PORT}...`);
  const redis = new Redis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    maxRetriesPerRequest: 1
  });

  try {
    const response = await redis.flushall();
    console.log(`✅ Redis database successfully flushed: ${response}`);
  } catch (err) {
    console.error(`❌ Failed to flush Redis: ${err.message}`);
  } finally {
    redis.disconnect();
  }

  console.log('✨ Environment successfully reset to a clean state!');
  process.exit(0);
}

run().catch(err => {
  console.error('Fatal error during queue clearing:', err);
  process.exit(1);
});
