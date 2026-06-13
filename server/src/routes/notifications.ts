import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middlewares/authMiddleware';
import { redisCache } from '../redis';

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);

notificationsRouter.get('/', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const raw = await redisCache.lrange(`notifications:user:${userId}`, 0, 49);
    const items = raw.map(r => {
      try { return JSON.parse(r); } catch { return null; }
    }).filter(Boolean);
    res.json({ items });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

notificationsRouter.post('/mark-read', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    await redisCache.del(`notifications:user:${userId}`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
