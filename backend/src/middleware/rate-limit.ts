import { NextFunction, Request, Response } from 'express';

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

function clientKey(req: Request): string {
  const userPart = req.authUser?.id || req.ip || 'unknown';
  return `${userPart}:${req.path}`;
}

export function createRateLimiter(limit: number, windowMs: number) {
  return function rateLimit(req: Request, res: Response, next: NextFunction): void {
    const key = clientKey(req);
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    if (bucket.count >= limit) {
      res.status(429).json({ error: 'Rate limit exceeded' });
      return;
    }

    bucket.count += 1;
    next();
  };
}
