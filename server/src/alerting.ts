import { redisSubscriber } from './redis';
import axios from 'axios';
import { prisma } from './prisma';

export const sendTelegramAlert = async (userId: string, message: string) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.telegramBotToken || !user.telegramChatId) return;

    await axios.post(`https://api.telegram.org/bot${user.telegramBotToken}/sendMessage`, {
      chat_id: user.telegramChatId,
      text: message,
    });
  } catch (error) {
    console.error('Telegram notification failed for user', userId);
  }
};

export const initAlertingEngine = () => {
  console.log('Alerting Engine Initialized');
  
  redisSubscriber.on('pmessage', async (pattern, channel, message) => {
    if (channel.startsWith('telemetry:')) {
      try {
        const data = JSON.parse(message);
        
        // Fetch VPS to know the owner
        const vps = await prisma.vps.findUnique({ where: { id: data.vpsId } });
        if (!vps) return;
        
        // Kural 1: Disk Kullanımı > %95
        if (data.DiskUsage > 95) {
          await sendTelegramAlert(vps.userId, `🚨 UYARI! VPS ${vps.name} (${vps.ipAddress}) Disk Kullanımı kritik seviyede: %${data.DiskUsage.toFixed(2)}`);
        }
        
        // Kural 2: CPU Kullanımı > %90
        if (data.CPUUsage > 90) {
           // check if key exists in redis, if not set with 10min expiry
           // if exists and time diff > 10m, send alert and trigger restart
           // To be implemented fully later.
        }
      } catch (err) {
        console.error('Error parsing telemetry for alerting', err);
      }
    }
  });
};
