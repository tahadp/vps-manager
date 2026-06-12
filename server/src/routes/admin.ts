import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth, requireAdmin, AuthRequest } from '../middlewares/authMiddleware';

export const adminRouter = Router();

adminRouter.use(requireAuth, requireAdmin);

adminRouter.get('/users', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, email: true, role: true, status: true, tier: true, createdAt: true }
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

adminRouter.put('/users/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!['PENDING', 'APPROVED', 'BANNED'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const userReq = req as AuthRequest;
  if (id === userReq.user?.id) {
    return res.status(403).json({ error: 'Cannot change your own status' });
  }

  try {
    const updatedUser = await prisma.user.update({
      where: { id },
      data: { status }
    });
    res.json({ message: 'Status updated', status: updatedUser.status });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update user' });
  }
});
