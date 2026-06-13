import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth, AuthRequest } from '../middlewares/authMiddleware';
import { validate } from '../middlewares/validation';
import { logAudit } from '../middlewares/audit';
import { z } from 'zod';
import axios from 'axios';

export const settingsRouter = Router();

settingsRouter.use(requireAuth);

settingsRouter.get('/telegram', async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    res.json({
      telegramBotToken: user.telegramBotToken || '',
      telegramChatId: user.telegramChatId || ''
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

settingsRouter.post('/telegram', async (req: AuthRequest, res) => {
  const { telegramBotToken, telegramChatId } = req.body;
  try {
    await prisma.user.update({
      where: { id: req.user!.id },
      data: { telegramBotToken, telegramChatId }
    });
    await logAudit({ userId: req.user!.id, action: 'TELEGRAM_CONFIG_CHANGED', target: req.user!.id });
    res.json({ message: 'Telegram config updated successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

settingsRouter.post('/telegram/test', async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user || !user.telegramBotToken || !user.telegramChatId) {
      return res.status(400).json({ error: 'Please save your Telegram credentials first.' });
    }

    const response = await axios.post(`https://api.telegram.org/bot${user.telegramBotToken}/sendMessage`, {
      chat_id: user.telegramChatId,
      text: '✅ VPS Manager: Test notification successful! The alerting engine is now ready to send alerts here.',
    });
    
    if (response.data.ok) {
      res.json({ message: 'Test message sent successfully!' });
    } else {
      res.status(400).json({ error: 'Failed to send test message' });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.response?.data?.description || 'Failed to send test message. Check your credentials.' });
  }
});

const userPrefsSchema = z.object({
  dashboardVpsOrder: z.array(z.string().uuid()).max(500).optional(),
  chartVisibleMetrics: z.array(z.enum(['cpu', 'ram', 'disk', 'network'])).max(4).optional()
});

settingsRouter.get('/preferences', async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    let dashboardVpsOrder: string[] = [];
    let chartVisibleMetrics: string[] = ['cpu', 'ram', 'disk', 'network'];
    if (user.dashboardVpsOrder) {
      try { dashboardVpsOrder = JSON.parse(user.dashboardVpsOrder); } catch {}
    }
    if (user.chartVisibleMetrics) {
      try { chartVisibleMetrics = JSON.parse(user.chartVisibleMetrics); } catch {}
    }
    res.json({ dashboardVpsOrder, chartVisibleMetrics });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch preferences' });
  }
});

settingsRouter.put('/preferences', validate(userPrefsSchema), async (req: AuthRequest, res) => {
  try {
    const data: any = {};
    if (req.body.dashboardVpsOrder !== undefined) {
      data.dashboardVpsOrder = JSON.stringify(req.body.dashboardVpsOrder);
    }
    if (req.body.chartVisibleMetrics !== undefined) {
      data.chartVisibleMetrics = JSON.stringify(req.body.chartVisibleMetrics);
    }
    await prisma.user.update({ where: { id: req.user!.id }, data });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

// DEPRECATED: Last login is now updated automatically on /api/auth/login.
// Kept for backward compatibility. Will be removed in a future release.
settingsRouter.put('/last-login', async (req: AuthRequest, res) => {
  try {
    await prisma.user.update({ where: { id: req.user!.id }, data: { lastLogin: new Date() } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update last login' });
  }
});
