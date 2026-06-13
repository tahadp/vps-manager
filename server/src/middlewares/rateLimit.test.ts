import { describe, it, expect, vi, beforeEach } from 'vitest';

const { execMock } = vi.hoisted(() => ({ execMock: vi.fn() }));

vi.mock('../redis', () => {
  const multi = {
    zadd: vi.fn().mockReturnThis(),
    zremrangebyscore: vi.fn().mockReturnThis(),
    zcard: vi.fn().mockReturnThis(),
    pexpire: vi.fn().mockReturnThis(),
    exec: execMock,
  };
  return {
    redisCache: {
      multi: vi.fn(() => multi),
    },
  };
});

vi.mock('../logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { rateLimit } from './rateLimit';
import { redisCache } from '../redis';

type Req = any;
type Res = any;

function makeRes() {
  const res: any = {
    statusCode: 200,
    headers: {} as Record<string, string | number>,
    body: undefined as any,
    setHeader(name: string, value: string | number) {
      this.headers[name] = value;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: any) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

describe('rateLimit sliding window log', () => {
  beforeEach(() => {
    execMock.mockReset();
  });

  it('calls ZADD, ZREMRANGEBYSCORE, ZCARD on a request and calls next() when under limit', async () => {
    execMock.mockResolvedValueOnce([
      [null, 1],
      [null, 0],
      [null, 1],
      [null, 1],
    ]);

    const limiter = rateLimit({ windowMs: 1000, max: 5 });
    const req: Req = { ip: '1.1.1.1', socket: { remoteAddress: '1.1.1.1' } };
    const res = makeRes();
    const next = vi.fn();

    await limiter(req, res, next);

    expect(redisCache.multi).toHaveBeenCalledTimes(1);
    expect(execMock).toHaveBeenCalledTimes(1);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.headers['X-RateLimit-Limit']).toBe(5);
    expect(res.headers['X-RateLimit-Remaining']).toBe(4);
    expect(res.statusCode).toBe(200);
  });

  it('returns 429 when ZCARD count exceeds max', async () => {
    execMock.mockResolvedValueOnce([
      [null, 1],
      [null, 0],
      [null, 11],
      [null, 1],
    ]);

    const limiter = rateLimit({ windowMs: 1000, max: 10 });
    const req: Req = { ip: '2.2.2.2', socket: { remoteAddress: '2.2.2.2' } };
    const res = makeRes();
    const next = vi.fn();

    await limiter(req, res, next);

    expect(execMock).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(429);
    expect(res.body).toEqual({ error: 'Too many requests, please try again later.' });
    expect(res.headers['Retry-After']).toBe(1);
  });
});
