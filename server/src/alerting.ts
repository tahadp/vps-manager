import { redisSubscriber } from './redis';
import axios from 'axios';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

export const sendTelegramAlert = async (message: string) => {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
    });
  } catch (error) {
    console.error('Telegram notification failed', error);
  }
};

export const initAlertingEngine = () => {
  console.log('Alerting Engine Initialized');
  
  // Redis'ten gelen canlı telemetri verilerini analiz et
  redisSubscriber.on('pmessage', async (pattern, channel, message) => {
    if (channel.startsWith('telemetry:')) {
      try {
        const data = JSON.parse(message);
        
        // Kural 1: Disk Kullanımı > %95
        if (data.DiskUsage > 95) {
          await sendTelegramAlert(`🚨 UYARI! VPS ${data.vpsId} Disk Kullanımı kritik seviyede: %${data.DiskUsage.toFixed(2)}`);
        }
        
        // Kural 2: CPU Kullanımı > %90 (10 dk takibi Redis set/get ile implemente edilecek)
        if (data.CPUUsage > 90) {
           // check if key exists in redis, if not set with 10min expiry
           // if exists and time diff > 10m, send alert and trigger restart
        }
      } catch (err) {
        console.error('Error parsing telemetry for alerting', err);
      }
    }
  });
};
