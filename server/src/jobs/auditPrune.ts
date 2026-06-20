import { startAuditPruneInterval as legacyStart } from '../middlewares/audit';

let interval: NodeJS.Timeout | null = null;

export function startAuditPruneJob(): void {
  interval = legacyStart();
}

export function stopAuditPruneJob(): void {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
}
