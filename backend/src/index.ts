import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Boot modules natively
import { startQueueProcessing } from './queue';
import { anomalyWorker } from './workers/anomaly-worker';
import { bootCrons } from './workers/cron';
import { SSEManager } from './real-time/sse';

// Restructured Controllers mapped cleanly over legacy router
import { ingestRouter } from './controllers/ingest.controller';
import { historyRouter } from './controllers/history.controller';
import { alertsRouter, suppressRouter } from './controllers/alert.controller';

dotenv.config();

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(cors());

// Mount Controllers
app.use('/ingest', ingestRouter);
app.use('/', historyRouter);
app.use('/alerts', alertsRouter);
app.use('/', suppressRouter);

// Set up server-sent events route
// Connect operator browser client natively
app.get('/events/zone/:zoneId', (req: Request, res: Response) => {
  const zoneId = req.params.zoneId as string;
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  // Authorize & Add client implicitly maps realtime pushes directly isolated to the operators zone
  SSEManager.addClient(zoneId, res);
});

// App fallback error handling
app.use((err: any, req: Request, res: Response, next: any) => {
  console.error('Unhandled app error:', err);
  if (!res.headersSent) {
    res.status(500).json({ error: 'Internal server fault' });
  }
});

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`GridWatch Backend API is listening aggressively on ${port}`);
  
  // Start autonomous workers
  startQueueProcessing();
  anomalyWorker.waitUntilReady().then(() => console.log('Anomaly Async Worker mounted successfully.'));
  bootCrons();
});
