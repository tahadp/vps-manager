import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth } from '../middlewares/authMiddleware';
import { validate, schemas } from '../middlewares/validation';
import { redisPublisher } from '../redis';

const router = Router();

const publishRulesChanged = (userId: string, ruleId: string, action: 'created' | 'updated' | 'deleted') => {
  try {
    redisPublisher.publish('vps_event:global', JSON.stringify({
      type: 'RULES_CHANGED',
      userId,
      ruleId,
      action
    }));
  } catch (err) {
    console.error('RULES_CHANGED publish failed:', err);
  }
};

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
    const {
      vpsId, metric, condition, threshold, durationMin,
      offlineThresholdMin, customMessage, restartOnAlert, action, script
    } = req.body;

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
        metric: metric || null,
        condition: condition || null,
        threshold: threshold !== undefined ? parseFloat(threshold) : null,
        durationMin: durationMin !== undefined ? parseInt(durationMin) : null,
        offlineThresholdMin: offlineThresholdMin !== undefined ? parseInt(offlineThresholdMin) : null,
        customMessage: customMessage || null,
        restartOnAlert: !!restartOnAlert,
        action,
        customScript: action === 'CUSTOM_SCRIPT' ? script : null
      }
    });

    publishRulesChanged(req.user.id, rule.id, 'created');

    res.status(201).json(rule);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create rule' });
  }
});

// Update rule
router.put('/:id', requireAuth, validate(schemas.createRule), async (req: any, res) => {
  try {
    const existing = await prisma.alertRule.findFirst({
      where: { id: req.params.id, userId: req.user.id }
    });
    if (!existing) return res.status(404).json({ error: 'Rule not found' });

    const {
      vpsId, metric, condition, threshold, durationMin,
      offlineThresholdMin, customMessage, restartOnAlert, action, script
    } = req.body;

    const updated = await prisma.alertRule.update({
      where: { id: req.params.id },
      data: {
        vpsId: vpsId || null,
        metric: metric || null,
        condition: condition || null,
        threshold: threshold !== undefined ? parseFloat(threshold) : null,
        durationMin: durationMin !== undefined ? parseInt(durationMin) : null,
        offlineThresholdMin: offlineThresholdMin !== undefined ? parseInt(offlineThresholdMin) : null,
        customMessage: customMessage || null,
        restartOnAlert: !!restartOnAlert,
        action,
        customScript: action === 'CUSTOM_SCRIPT' ? script : null
      }
    });

    publishRulesChanged(req.user.id, updated.id, 'updated');

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update rule' });
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

    publishRulesChanged(req.user.id, req.params.id, 'deleted');

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete rule' });
  }
});

export const rulesRouter = router;
