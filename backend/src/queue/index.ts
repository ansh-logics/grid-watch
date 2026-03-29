import { Queue, Worker, QueueEvents } from 'bullmq';
import Redis from 'ioredis';

const redisOptions = {
  maxRetriesPerRequest: null,
};

// Singleton Redis connection for BullMQ
export const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379/0', redisOptions);

// Define queues
export const anomalyQueue = new Queue('anomaly-detection', { connection });
export const anomalyEvents = new QueueEvents('anomaly-detection', { connection });

export const startQueueProcessing = () => {
  console.log('BullMQ setup complete, queues ready.');
};
