import { prisma } from '../prisma';
import { logger } from '../logger';

export interface AuditOptions {
  userId: string;
  action: string;
  target: string;
  details?: string;
}

export async function logAudit(opts: AuditOptions): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: opts.userId,
        action: opts.action,
        target: opts.details ? `${opts.target} - ${opts.details}` : opts.target,
      },
    });
  } catch (err) {
    console.error('audit log failed:', err);
  }
}

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Deletes AuditLog rows older than 90 days.
 * Returns the number of pruned rows.
 */
export const pruneOldAuditLogs = async (): Promise<number> => {
  try {
    const cutoff = new Date(Date.now() - NINETY_DAYS_MS);
    const result = await prisma.auditLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    if (result.count > 0) {
      logger.info({ deleted: result.count, retentionDays: 90 }, 'pruneOldAuditLogs: deleted old rows');
    }
    return result.count;
  } catch (err) {
    logger.error({ err }, 'pruneOldAuditLogs failed');
    return 0;
  }
};

/**
 * Schedules a daily prune of AuditLog rows older than 90 days.
 * Runs once at startup, then every 24 hours. Uses interval.unref() so it
 * does not block process exit.
 */
export const startAuditPruneInterval = (): NodeJS.Timeout => {
  pruneOldAuditLogs().catch(() => {});
  const interval = setInterval(() => {
    pruneOldAuditLogs().catch(() => {});
  }, 24 * 60 * 60 * 1000);
  interval.unref();
  return interval;
};

export async function logIpChangeIfChanged(vpsId: string, newIp: string): Promise<void> {
  try {
    const vps = await prisma.vps.findUnique({ where: { id: vpsId } });
    if (!vps) return;
    const oldIp = vps.ipAddress;
    if (oldIp !== newIp && newIp && newIp !== 'Unknown' && newIp !== 'Pending') {
      logger.info({ vpsId, oldIp, newIp }, 'VPS IP address changed');
      await logAudit({
        userId: vps.userId,
        action: 'IP_CHANGED',
        target: vpsId,
        details: `IP address changed from ${oldIp} to ${newIp}`
      });
    }
  } catch (err) {
    logger.error({ err, vpsId }, 'Failed to log IP change');
  }
}
