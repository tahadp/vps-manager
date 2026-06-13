import { prisma } from '../prisma';

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
