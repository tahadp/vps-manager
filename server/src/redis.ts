import Redis from 'ioredis';
import dotenv from 'dotenv';
import { logger } from './logger';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '../.env') });

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
  logger.error({ err: err.message }, 'Redis Publisher Error');
});

redisSubscriber.on('error', (err) => {
  logger.error({ err: err.message }, 'Redis Subscriber Error');
});

redisCache.on('error', (err) => {
  logger.error({ err: err.message }, 'Redis Cache Error');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error({ err: reason, promise }, 'Unhandled promise rejection');
});

redisPublisher.on('connect', () => logger.info('Redis Publisher connected'));
redisSubscriber.on('connect', () => logger.info('Redis Subscriber connected'));
redisCache.on('connect', () => logger.info('Redis Cache connected'));

redisPublisher.on('reconnecting', (delay: number) => {
  logger.info({ delay }, 'Redis Publisher reconnecting');
});

redisSubscriber.on('reconnecting', (delay: number) => {
  logger.info({ delay }, 'Redis Subscriber reconnecting');
});

redisCache.on('reconnecting', (delay: number) => {
  logger.info({ delay }, 'Redis Cache reconnecting');
});
