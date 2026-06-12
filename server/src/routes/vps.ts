import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth, AuthRequest } from '../middlewares/authMiddleware';

export const vpsRouter = Router();

// Get all VPS instances for the user (Admin gets all)
vpsRouter.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    let vpsList;
    
    if (user.role === 'ADMIN') {
      vpsList = await prisma.vps.findMany({
        include: { user: { select: { id: true, email: true } } }
      });
    } else {
      vpsList = await prisma.vps.findMany({
        where: { userId: user.id }
      });
    }
    
    res.json(vpsList);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch VPS list' });
  }
});

// Add a new VPS (Admin only)
vpsRouter.post('/', requireAuth, async (req: AuthRequest, res) => {
  if (req.user!.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Only admins can add VPS' });
  }

  const { name, ipAddress, os, userId } = req.body;
  if (!name || !ipAddress || !os || !userId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const newVps = await prisma.vps.create({
      data: { name, ipAddress, os, userId }
    });
    res.json(newVps);
  } catch (error) {
    res.status(500).json({ error: 'Failed to add VPS' });
  }
});
