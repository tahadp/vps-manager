import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth, AuthRequest } from '../middlewares/authMiddleware';

export const auditRouter = Router();

auditRouter.use(requireAuth);

auditRouter.get('/', async (req: AuthRequest, res) => {
  try {
    const skip = parseInt(req.query.skip as string) || 0;
    const take = parseInt(req.query.take as string) || 100;

    let logs;
    let total;

    if (req.user!.role === 'ADMIN') {
      [logs, total] = await Promise.all([
        prisma.auditLog.findMany({
          include: { user: { select: { email: true } } },
          orderBy: { createdAt: 'desc' },
          skip,
          take
        }),
        prisma.auditLog.count()
      ]);
    } else {
      [logs, total] = await Promise.all([
        prisma.auditLog.findMany({
          where: { userId: req.user!.id },
          include: { user: { select: { email: true } } },
          orderBy: { createdAt: 'desc' },
          skip,
          take
        }),
        prisma.auditLog.count({ where: { userId: req.user!.id } })
      ]);
    }
    res.json({ data: logs, total, skip, take });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});
