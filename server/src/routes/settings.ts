import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth, AuthRequest } from '../middlewares/authMiddleware';
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
