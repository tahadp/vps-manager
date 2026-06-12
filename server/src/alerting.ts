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

let activeRules: any[] = [];

const refreshRules = async () => {
  try {
    activeRules = await prisma.alertRule.findMany();
  } catch (err) {
    console.error('Failed to refresh alert rules', err);
  }
};

export const initAlertingEngine = () => {
  console.log('Dynamic Alerting Engine Initialized');
  
  // Refresh rules every 30 seconds
  refreshRules();
  setInterval(refreshRules, 30000);
  
  redisSubscriber.on('pmessage', async (pattern, channel, message) => {
    if (channel.startsWith('telemetry:')) {
      try {
        const data = JSON.parse(message);
        
        const vps = await prisma.vps.findUnique({ where: { id: data.vpsId } });
        if (!vps) return;
        
        // Find applicable rules for this VPS (either specifically for this VPS or global for the user)
        const applicableRules = activeRules.filter(r => 
          r.userId === vps.userId && (r.vpsId === null || r.vpsId === vps.id)
        );

        for (const rule of applicableRules) {
          // Map the metric
          let metricValue = 0;
          if (rule.metric === 'CPU') metricValue = data.CPUUsage;
          else if (rule.metric === 'RAM') metricValue = data.RAMUsage;
          else if (rule.metric === 'DISK') metricValue = data.DiskUsage;
          else continue;

          // Check condition
          let isViolated = false;
          if (rule.condition === '>') isViolated = metricValue > rule.threshold;
          else if (rule.condition === '<') isViolated = metricValue < rule.threshold;

          const ruleStateKey = `rule_state:${rule.id}:${vps.id}`;
          const ruleCooldownKey = `rule_cooldown:${rule.id}:${vps.id}`;

          if (isViolated) {
            // Check cooldown
            const inCooldown = await redisCache.get(ruleCooldownKey);
            if (inCooldown) continue; // Already triggered recently, wait

            // Tracking duration
            const val = await redisCache.get(ruleStateKey);
            if (!val) {
              await redisCache.set(ruleStateKey, Date.now().toString());
            } else {
              const startTime = parseInt(val, 10);
              const diffMins = (Date.now() - startTime) / 60000;
              
              if (diffMins >= rule.durationMin) {
                // Trigger action!
                const actionMsg = rule.action === 'RESTART' ? "Restarting server..." : "Notification only.";
                await sendTelegramAlert(vps.userId, `🚨 ALERT! VPS ${vps.name} (${vps.ipAddress}) violated rule: ${rule.metric} ${rule.condition} ${rule.threshold}% for ${rule.durationMin} minutes. Current: ${metricValue.toFixed(1)}%. ${actionMsg}`);
                
                if (rule.action === 'RESTART') {
                  try {
                    await executeCommand(vps.id, 'sudo systemctl restart docker || sudo service nginx restart');
                  } catch (cmdErr) {
                    console.error('Failed to execute rule recovery command:', cmdErr);
                  }
                }

                // Reset state and set a 1 hour cooldown so it doesn't spam
                await redisCache.del(ruleStateKey);
                await redisCache.set(ruleCooldownKey, '1', 'EX', 3600);
              }
            }
          } else {
            // Metric recovered, reset the tracking timer
            await redisCache.del(ruleStateKey);
          }
        }
      } catch (err) {
        console.error('Error parsing telemetry for alerting', err);
      }
    }
  });
};
