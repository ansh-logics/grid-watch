import express, { Request, Response } from 'express';
import cors from 'cors';

import { SSEManager } from './real-time/sse';
import { ingestRouter } from './controllers/ingest.controller';
import { historyRouter } from './controllers/history.controller';
import { alertsRouter, suppressRouter } from './controllers/alert.controller';
import { requireIngestApiKey } from './middleware/ingest-api-key';
import { authModeLabel, requireAuthContext } from './middleware/auth';
import { createRateLimiter } from './middleware/rate-limit';

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '50mb' }));
  app.use(cors());

  const ingestRateLimit = Number(process.env.INGEST_RATE_LIMIT || '120');
  const authRateLimit = Number(process.env.AUTH_RATE_LIMIT || '300');
  const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS || '60000');

  app.use('/ingest', createRateLimiter(ingestRateLimit, windowMs), requireIngestApiKey, ingestRouter);
  app.use('/', requireAuthContext, createRateLimiter(authRateLimit, windowMs), historyRouter);
  app.use('/alerts', requireAuthContext, createRateLimiter(authRateLimit, windowMs), alertsRouter);
  app.use('/', requireAuthContext, createRateLimiter(authRateLimit, windowMs), suppressRouter);

  app.get(
    '/events/zone/:zoneId',
    requireAuthContext,
    createRateLimiter(authRateLimit, windowMs),
    (req: Request, res: Response) => {
    const zoneId = req.params.zoneId as string;
    const user = req.authUser;

    if (!user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Supervisors can subscribe to any zone. Operators are restricted to their zones.
    if (user.role === 'operator' && !user.zones.includes(zoneId)) {
      res.status(403).json({ error: 'User is not authorized for this zone' });
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Auth-Mode': authModeLabel(),
    });

    SSEManager.addClient(zoneId, res);
    }
  );

  app.use((err: any, req: Request, res: Response, next: any) => {
    console.error('Unhandled app error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server fault' });
    }
  });

  return app;
}
