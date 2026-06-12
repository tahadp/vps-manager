import Redis from 'ioredis';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = Number(process.env.REDIS_PORT) || 6379;
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;

export const redisPublisher = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: REDIS_PASSWORD,
});

export const redisSubscriber = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: REDIS_PASSWORD,
});

export const redisCache = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: REDIS_PASSWORD,
});

redisPublisher.on('connect', () => console.log('Redis Publisher connected'));
redisSubscriber.on('connect', () => console.log('Redis Subscriber connected'));
redisCache.on('connect', () => console.log('Redis Cache connected'));

export const pushTelemetry = async (vpsId: string, data: any) => {
  // Pub/Sub üzerinden anlık bildirim (Websocket dinleyicilerine gitmek üzere)
  await redisPublisher.publish(`telemetry:${vpsId}`, JSON.stringify(data));
  
  // Hash map üzerinde en güncel datayı tut (sayfa ilk açıldığında hızlı yükleme için)
  await redisCache.hset('vps_latest_metrics', vpsId, JSON.stringify(data));
};
