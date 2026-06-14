import { prisma } from './prisma';
import { redisCache } from './redis';
import { logger } from './logger';
import { metrics as m } from './metrics-prom';

const FIFTEEN_SECONDS_MS = 15_000;
const RETENTION_HOURS = 24;
const THROTTLE_WINDOW_MS = 15_000;

const lastWriteKey = (vpsId: string) => `metric_last_write:${vpsId}`;

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Writes a HistoricalMetric row for the given VPS, throttled to one row per 15 seconds.
 * Uses Redis SET NX EX for atomic check-and-set to avoid race conditions.
 * Returns true if a write occurred, false if throttled.
 */
export const writeHistoricalMetric = async (payload: {
  vpsId: string;
  cpu: number;
  ram: number;
  disk: number;
  netTx?: number;
  netRx?: number;
  diskTotal?: number;
  timestamp?: number;
}): Promise<boolean> => {
  try {
    const now = Date.now();
    const key = lastWriteKey(payload.vpsId);
    // F0-11: Atomic acquire. If another writer already owns this slot, skip.
    const acquired = await redisCache.set(key, now.toString(), 'PX', THROTTLE_WINDOW_MS, 'NX');
    if (acquired !== 'OK') return false;

    try {
      await prisma.historicalMetric.create({
        data: {
          vpsId: payload.vpsId,
          cpu: round2(payload.cpu || 0),
          ram: round2(payload.ram || 0),
          disk: round2(payload.disk || 0),
          netTx: round2(payload.netTx || 0),
          netRx: round2(payload.netRx || 0),
          diskTotal: round2(payload.diskTotal || 0),
          timestamp: payload.timestamp ? new Date(Number(payload.timestamp) * 1000) : new Date()
        }
      });
      m.historicalMetricWrites.inc();
      return true;
    } catch (dbErr) {
      // Release the slot so the next attempt can write
      await redisCache.del(key).catch(() => {});
      logger.error({ err: dbErr, vpsId: payload.vpsId }, 'writeHistoricalMetric DB write failed');
      return false;
    }
  } catch (err) {
    logger.error({ err, vpsId: payload.vpsId }, 'writeHistoricalMetric failed');
    return false;
  }
};

/**
 * Deletes HistoricalMetric rows older than RETENTION_HOURS.
 * Called periodically by the server.
 */
export const pruneOldMetrics = async (): Promise<number> => {
  try {
    const cutoff = new Date(Date.now() - RETENTION_HOURS * 60 * 60 * 1000);
    const result = await prisma.historicalMetric.deleteMany({
      where: { timestamp: { lt: cutoff } }
    });
    if (result.count > 0) {
      logger.info({ deleted: result.count, retentionHours: RETENTION_HOURS }, 'pruneOldMetrics: deleted old rows');
    }
    return result.count;
  } catch (err) {
    logger.error({ err }, 'pruneOldMetrics failed');
    return 0;
  }
};

export const startMetricsPruneInterval = (): NodeJS.Timeout => {
  return setInterval(() => {
    pruneOldMetrics().catch(() => {});
  }, 60 * 60 * 1000);
};
