import { redisSubscriber, redisCache } from './redis';
import axios from 'axios';
import { prisma } from './prisma';
import { executeCommand } from './grpcClient';

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
          const diskKey = `vps_disk_alert:${vps.id}`;
          const alerted = await redisCache.get(diskKey);
          if (!alerted) {
             await sendTelegramAlert(vps.userId, `🚨 UYARI! VPS ${vps.name} (${vps.ipAddress}) Disk Kullanımı kritik seviyede: %${data.DiskUsage.toFixed(2)}`);
             await redisCache.set(diskKey, '1', 'EX', 3600); // 1 saat boyunca tekrar atmasın
          }
        }
        
        // Kural 2: CPU Kullanımı > %90 for 10 minutes
        const cpuKey = `vps_cpu_alert:${vps.id}`;
        if (data.CPUUsage > 90) {
          const val = await redisCache.get(cpuKey);
          if (!val) {
            await redisCache.set(cpuKey, Date.now().toString());
          } else {
            const startTime = parseInt(val, 10);
            const diffMins = (Date.now() - startTime) / 60000;
            if (diffMins > 10) {
               await sendTelegramAlert(vps.userId, `🚨 UYARI! VPS ${vps.name} (${vps.ipAddress}) CPU Kullanımı 10 dakikadır %90 üzerinde! Restart komutu gönderiliyor...`);
               try {
                 await executeCommand(vps.id, 'sudo systemctl restart docker || sudo service nginx restart');
               } catch (cmdErr) {
                 console.error('Failed to execute recovery command:', cmdErr);
               }
               // Reset timer after action
               await redisCache.del(cpuKey);
            }
          }
        } else {
           await redisCache.del(cpuKey);
        }
      } catch (err) {
        console.error('Error parsing telemetry for alerting', err);
      }
    }
  });
};
