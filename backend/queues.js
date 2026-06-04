/**
 * queues.js — Shared BullMQ queue definitions + Redis connection config.
 * Imported by both control.js (producer) and scheduler.js (consumer).
 */
const { Queue } = require('bullmq');

const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;

const redisConnection = {
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: REDIS_PASSWORD,
  maxRetriesPerRequest: null,  // Required by BullMQ
};

// --- Queue Definitions ---

// Main orchestration queue: deploy, stop, delete server jobs
const orchestrationQueue = new Queue('crafthost-orchestration', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { age: 3600 * 24 },    // Keep completed jobs for 24h
    removeOnFail: { age: 3600 * 24 * 7 },    // Keep failed jobs for 7 days
  }
});

// Idle reaper queue: recurring VM cleanup job
const reaperQueue = new Queue('crafthost-reaper', {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: { count: 10 },
    removeOnFail: { count: 50 },
  }
});

module.exports = {
  redisConnection,
  orchestrationQueue,
  reaperQueue,
  REDIS_HOST,
  REDIS_PORT,
};
