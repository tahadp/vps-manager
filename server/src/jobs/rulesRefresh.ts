import { refreshRules } from '../alerting';
import { logger } from '../logger';

const REFRESH_INTERVAL_MS = 30_000;
let interval: NodeJS.Timeout | null = null;

export function startRulesRefreshJob(): void {
  interval = setInterval(() => {
    refreshRules().catch((err: unknown) =>
      logger.error({ err }, 'rules refresh failed'),
    );
  }, REFRESH_INTERVAL_MS);
  interval.unref();
}

export function stopRulesRefreshJob(): void {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
}
