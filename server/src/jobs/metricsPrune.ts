import { pruneOldMetrics } from '../metrics';
import { logger } from '../logger';

const HOUR_MS = 60 * 60 * 1000;
let interval: NodeJS.Timeout | null = null;

export function startMetricsPruneJob(): void {
  pruneOldMetrics().catch((err: unknown) =>
    logger.error({ err }, 'startup metrics prune failed'),
  );
  interval = setInterval(() => {
    pruneOldMetrics().catch(() => {});
  }, HOUR_MS);
  interval.unref();
}

export function stopMetricsPruneJob(): void {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
}
