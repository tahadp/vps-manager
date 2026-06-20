import { logger } from '../logger';
import {
  startMetricsPruneJob,
  stopMetricsPruneJob,
} from './metricsPrune';
import {
  startAuditPruneJob,
  stopAuditPruneJob,
} from './auditPrune';
import {
  startHeartbeatPruneJob,
  stopHeartbeatPruneJob,
} from './heartbeatPrune';
import {
  startRulesRefreshJob,
  stopRulesRefreshJob,
} from './rulesRefresh';

export function startAllJobs(): void {
  startMetricsPruneJob();
  startAuditPruneJob();
  startHeartbeatPruneJob();
  startRulesRefreshJob();
  logger.info('all background jobs started');
}

export function stopAllJobs(): void {
  stopMetricsPruneJob();
  stopAuditPruneJob();
  stopHeartbeatPruneJob();
  stopRulesRefreshJob();
  logger.info('all background jobs stopped');
}
