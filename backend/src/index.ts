import dotenv from 'dotenv';
import { startQueueProcessing } from './queue';
import { anomalyWorker } from './workers/anomaly-worker';
import { bootCrons } from './workers/cron';
import { createApp } from './app';

dotenv.config();

export const app = createApp();

const port = process.env.PORT || 3000;

if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    console.log(`GridWatch Backend API is listening aggressively on ${port}`);

    startQueueProcessing();
    anomalyWorker.waitUntilReady().then(() => console.log('Anomaly Async Worker mounted successfully.'));
    bootCrons();
  });
}
