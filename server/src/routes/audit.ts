import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth, AuthRequest } from '../middlewares/authMiddleware';

export const auditRouter = Router();

auditRouter.use(requireAuth);

auditRouter.get('/', async (req: AuthRequest, res) => {
  try {
    let logs;
    if (req.user!.role === 'ADMIN') {
      logs = await prisma.auditLog.findMany({
        include: { user: { select: { email: true } } },
        orderBy: { createdAt: 'desc' },
        take: 100
      });
    } else {
      logs = await prisma.auditLog.findMany({
        where: { userId: req.user!.id },
        include: { user: { select: { email: true } } },
        orderBy: { createdAt: 'desc' },
        take: 100
      });
    }
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});
