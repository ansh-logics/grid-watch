import { Request, Response, NextFunction } from 'express';

/**
 * When INGEST_API_KEY is set, POST /ingest requires X-Api-Key: <key> or Authorization: Bearer <key>.
 */
export function requireIngestApiKey(req: Request, res: Response, next: NextFunction): void {
  const key = process.env.INGEST_API_KEY;
  if (!key) {
    next();
    return;
  }
  const auth = req.header('authorization');
  const bearer =
    auth && /^Bearer\s+/i.test(auth) ? auth.replace(/^Bearer\s+/i, '').trim() : undefined;
  const provided = req.header('x-api-key') || bearer;
  if (provided !== key) {
    res.status(401).json({ error: 'Invalid or missing ingest API key' });
    return;
  }
  next();
}
