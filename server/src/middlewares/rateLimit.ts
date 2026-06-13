import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { redisCache } from '../redis';

interface RateLimitOptions {
  windowMs: number;
  max: number;
  message?: string;
  keyGenerator?: (req: Request) => string;
}

const defaultKeyGenerator = (req: Request): string => {
  return req.ip || req.socket.remoteAddress || 'unknown';
};

export function rateLimit(options: RateLimitOptions) {
  const {
    windowMs = 15 * 60 * 1000,
    max = 100,
    message = 'Too many requests, please try again later.',
    keyGenerator = defaultKeyGenerator
  } = options;

  const keyPrefix = 'rl';

  return async (req: Request, res: Response, next: NextFunction) => {
    const key = `${keyPrefix}:${keyGenerator(req)}`;
    const now = Date.now();
    const windowStart = now - windowMs;
    const member = `${now}:${randomUUID()}`;

    try {
      const results = await redisCache
        .multi()
        .zadd(key, now, member)
        .zremrangebyscore(key, 0, windowStart)
        .zcard(key)
        .pexpire(key, windowMs * 2)
        .exec();

      if (!results) {
        return next();
      }

      const zcardResult = results[2];
      if (!zcardResult || zcardResult[0]) {
        return next();
      }

      const count = Number(zcardResult[1]) || 0;
      const remaining = Math.max(0, max - count);
      const reset = Math.ceil((now + windowMs) / 1000);

      res.setHeader('X-RateLimit-Limit', max);
      res.setHeader('X-RateLimit-Remaining', remaining);
      res.setHeader('X-RateLimit-Reset', reset);

      if (count > max) {
        res.setHeader('Retry-After', Math.ceil(windowMs / 1000));
        return res.status(429).json({ error: message });
      }

      return next();
    } catch (err) {
      console.error('Rate limiter Redis error:', (err as Error).message);
      return next();
    }
  };
}

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many login attempts. Please try again in 15 minutes.',
  keyGenerator: (req: Request) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    return `${ip}:${req.path}`;
  }
});

export const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  message: 'Too many requests. Please slow down.'
});
