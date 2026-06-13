import Redis from 'ioredis';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = Number(process.env.REDIS_PORT) || 6379;
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;

const redisOptions = {
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: REDIS_PASSWORD,
  retryStrategy: (times: number) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  autoResubscribe: true,
  autoResendUnfulfilledCommands: true,
  lazyConnect: false,
  reconnectOnError: () => true,
};

export const redisPublisher = new Redis(redisOptions);
export const redisSubscriber = new Redis(redisOptions);
export const redisCache = new Redis(redisOptions);

// Graceful error handling
redisPublisher.on('error', (err) => {
  console.error('Redis Publisher Error:', err.message);
});

redisSubscriber.on('error', (err) => {
  console.error('Redis Subscriber Error:', err.message);
});

redisCache.on('error', (err) => {
  console.error('Redis Cache Error:', err.message);
});

process.on('unhandledRejection', (reason) => {
  if (reason && (reason as any).message && String((reason as any).message).includes('Redis')) {
    console.error('Suppressed Redis unhandledRejection');
    return;
  }
  console.error('Unhandled Rejection:', reason);
});

redisPublisher.on('connect', () => console.log('Redis Publisher connected'));
redisSubscriber.on('connect', () => console.log('Redis Subscriber connected'));
redisCache.on('connect', () => console.log('Redis Cache connected'));

redisPublisher.on('reconnecting', (delay: number) => {
  console.log(`Redis Publisher reconnecting in ${delay}ms...`);
});

redisSubscriber.on('reconnecting', (delay: number) => {
  console.log(`Redis Subscriber reconnecting in ${delay}ms...`);
});

redisCache.on('reconnecting', (delay: number) => {
  console.log(`Redis Cache reconnecting in ${delay}ms...`);
});
