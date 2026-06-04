// Quick cleanup of queues and stale DB records
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Queue } = require('bullmq');
const { connectDB, VMNode, GameServer, DeployJob } = require('../db');

async function main() {
  const redisConnection = {
    host: '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    maxRetriesPerRequest: null,
  };

  const oq = new Queue('crafthost-orchestration', { connection: redisConnection });
  const rq = new Queue('crafthost-reaper', { connection: redisConnection });
  await oq.obliterate({ force: true });
  console.log('✅ crafthost-orchestration obliterated');
  await rq.obliterate({ force: true });
  console.log('✅ crafthost-reaper obliterated');
  await oq.close();
  await rq.close();

  await connectDB();
  const vms = await VMNode.deleteMany({});
  console.log('Deleted', vms.deletedCount, 'VMNodes');
  const gs = await GameServer.deleteMany({ status: { $in: ['queued', 'error'] } });
  console.log('Deleted', gs.deletedCount, 'stale GameServers');
  const dj = await DeployJob.deleteMany({});
  console.log('Deleted', dj.deletedCount, 'DeployJobs');

  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
