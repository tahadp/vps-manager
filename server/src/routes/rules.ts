import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth } from '../middlewares/authMiddleware';
import { validate, schemas } from '../middlewares/validation';

const router = Router();

// Get user's rules
router.get('/', requireAuth, async (req: any, res) => {
  try {
    const rules = await prisma.alertRule.findMany({
      where: { userId: req.user.id },
      include: { vps: { select: { name: true } } },
      orderBy: { createdAt: 'desc' }
    });
    res.json(rules);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch rules' });
  }
});

// Create rule
router.post('/', requireAuth, validate(schemas.createRule), async (req: any, res) => {
  try {
    const { vpsId, metric, condition, threshold, durationMin, action, script } = req.body;
    
    // Validate vpsId if provided
    if (vpsId) {
      const vps = await prisma.vps.findFirst({
        where: { id: vpsId, userId: req.user.id }
      });
      if (!vps) {
        return res.status(403).json({ error: 'VPS not found or unauthorized' });
      }
    }

    const rule = await prisma.alertRule.create({
      data: {
        userId: req.user.id,
        vpsId: vpsId || null,
        metric,
        condition,
        threshold: parseFloat(threshold),
        durationMin: parseInt(durationMin),
        action,
        script: action === 'CUSTOM_SCRIPT' ? script : null
      }
    });
    
    res.status(201).json(rule);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create rule' });
  }
});

// Delete rule
router.delete('/:id', requireAuth, async (req: any, res) => {
  try {
    const rule = await prisma.alertRule.findFirst({
      where: { id: req.params.id, userId: req.user.id }
    });
    
    if (!rule) {
      return res.status(404).json({ error: 'Rule not found' });
    }

    await prisma.alertRule.delete({
      where: { id: req.params.id }
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete rule' });
  }
});

export const rulesRouter = router;
