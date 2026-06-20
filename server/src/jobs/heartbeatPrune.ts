import { pruneStaleHeartbeats } from '../agentDispatcher';
import { logger } from '../logger';

const PRUNE_INTERVAL_MS = 30_000;
let interval: NodeJS.Timeout | null = null;

export function startHeartbeatPruneJob(): void {
  interval = setInterval(() => {
    try {
      pruneStaleHeartbeats();
    } catch (err) {
      logger.error({ err }, 'heartbeat prune failed');
    }
  }, PRUNE_INTERVAL_MS);
  interval.unref();
}

export function stopHeartbeatPruneJob(): void {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
}
