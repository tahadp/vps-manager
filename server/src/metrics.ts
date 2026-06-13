import { prisma } from './prisma';
import { redisCache } from './redis';

const FIFTEEN_SECONDS_MS = 15_000;
const RETENTION_HOURS = 24;

const lastWriteKey = (vpsId: string) => `metric_last_write:${vpsId}`;

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Writes a HistoricalMetric row for the given VPS, throttled to one row per 15 seconds.
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
    const last = await redisCache.get(lastWriteKey(payload.vpsId));
    if (last && now - parseInt(last, 10) < FIFTEEN_SECONDS_MS) {
      return false;
    }

    await prisma.historicalMetric.create({
      data: {
        vpsId: payload.vpsId,
        cpu: round2(payload.cpu || 0),
        ram: round2(payload.ram || 0),
        disk: round2(payload.disk || 0),
        netTx: round2(payload.netTx || 0),
        netRx: round2(payload.netRx || 0),
        diskTotal: round2(payload.diskTotal || 0),
        timestamp: payload.timestamp ? new Date(payload.timestamp * 1000) : new Date()
      }
    });

    await redisCache.set(lastWriteKey(payload.vpsId), now.toString(), 'PX', FIFTEEN_SECONDS_MS * 2);
    return true;
  } catch (err) {
    console.error('writeHistoricalMetric failed:', err);
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
      console.log(`pruneOldMetrics: deleted ${result.count} rows older than ${RETENTION_HOURS}h`);
    }
    return result.count;
  } catch (err) {
    console.error('pruneOldMetrics failed:', err);
    return 0;
  }
};

export const startMetricsPruneInterval = (): NodeJS.Timeout => {
  return setInterval(() => {
    pruneOldMetrics().catch(() => {});
  }, 60 * 60 * 1000);
};
