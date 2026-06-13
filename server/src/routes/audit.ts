import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth, AuthRequest } from '../middlewares/authMiddleware';

export const auditRouter = Router();

auditRouter.use(requireAuth);

auditRouter.get('/', async (req: AuthRequest, res) => {
  try {
    const skip = parseInt(req.query.skip as string) || 0;
    const take = parseInt(req.query.take as string) || 100;
    const vpsId = req.query.vpsId as string | undefined;

    let logs;
    let total;

    const baseInclude = { user: { select: { email: true } } };

    if (req.user!.role === 'ADMIN') {
      const where: any = {};
      if (vpsId) {
        where.OR = [
          { target: { contains: vpsId } },
          { action: { contains: vpsId } }
        ];
      }
      [logs, total] = await Promise.all([
        prisma.auditLog.findMany({
          where,
          include: baseInclude,
          orderBy: { createdAt: 'desc' },
          skip,
          take
        }),
        prisma.auditLog.count({ where })
      ]);
    } else {
      const where: any = { userId: req.user!.id };
      if (vpsId) {
        where.OR = [
          { target: { contains: vpsId } },
          { action: { contains: vpsId } }
        ];
      }
      [logs, total] = await Promise.all([
        prisma.auditLog.findMany({
          where,
          include: baseInclude,
          orderBy: { createdAt: 'desc' },
          skip,
          take
        }),
        prisma.auditLog.count({ where })
      ]);
    }
    res.json({ data: logs, total, skip, take });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});
