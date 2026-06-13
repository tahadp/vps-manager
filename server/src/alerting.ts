import { redisSubscriber, redisCache, redisPublisher } from './redis';
import axios from 'axios';
import { prisma } from './prisma';
import { executeCommand } from './grpcClient';
import { writeHistoricalMetric } from './metrics';

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

export const pushNotification = async (userId: string, notification: {
  type: 'ALERT' | 'OFFLINE' | 'RECOVERY' | 'RESTART';
  ruleId?: string;
  vpsId?: string;
  vpsName?: string;
  message: string;
  timestamp: number;
}) => {
  try {
    await redisCache.lpush(`notifications:user:${userId}`, JSON.stringify(notification));
    await redisCache.ltrim(`notifications:user:${userId}`, 0, 49);
  } catch (err) {
    console.error('pushNotification failed:', err);
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
  
  // Offline detection: mark VPS as OFFLINE if no heartbeat for 60 seconds
  setInterval(async () => {
    try {
      const cutoff = new Date(Date.now() - 60000);
      const staleVps = await prisma.vps.findMany({
        where: {
          status: 'ONLINE',
          lastHeartbeat: { lt: cutoff }
        }
      });

      for (const vps of staleVps) {
        const lastHb = vps.lastHeartbeat ? vps.lastHeartbeat.getTime() : Date.now();
        const offlineMinutes = Math.floor((Date.now() - lastHb) / 60000);

        await prisma.vps.update({
          where: { id: vps.id },
          data: { status: 'OFFLINE' }
        });

        redisPublisher.publish(`vps_status:${vps.id}`, JSON.stringify({
          vpsId: vps.id,
          status: 'OFFLINE',
          lastHeartbeat: vps.lastHeartbeat,
          ipAddress: vps.ipAddress
        }));

        await sendTelegramAlert(
          vps.userId,
          `⚠️ VPS ${vps.name} (${vps.ipAddress}) is OFFLINE — no heartbeat received for over 60 seconds.`
        );

        // Check OFFLINE rules for this user/vps
        const offlineRules = activeRules.filter(r =>
          r.userId === vps.userId &&
          (r.vpsId === null || r.vpsId === vps.id) &&
          (r.metric === 'OFFLINE' || r.metric === null) &&
          r.offlineThresholdMin !== null
        );

        for (const rule of offlineRules) {
          if (offlineMinutes < rule.offlineThresholdMin) continue;

          const cooldownKey = `rule_cooldown:${rule.id}:${vps.id}`;
          const inCooldown = await redisCache.get(cooldownKey);
          if (inCooldown) continue;

          await triggerRuleAction(vps, rule, {
            metric: 'OFFLINE',
            value: 0,
            threshold: 0,
            durationMin: 0,
            offlineMinutes
          });
          await redisCache.set(cooldownKey, '1', 'EX', 3600);
        }
      }

      // Also detect recovery: VPS that were OFFLINE and now have a fresh heartbeat
      const recoveredVps = await prisma.vps.findMany({
        where: {
          status: 'OFFLINE',
          lastHeartbeat: { gte: cutoff }
        }
      });
      for (const vps of recoveredVps) {
        // Recovery is signalled by the next heartbeat; the existing rule already
        // pushes an OFFLINE alert. We don't auto-recover here (let the agent's
        // next heartbeat reset status). Skip to avoid duplicate notifications.
      }
    } catch (err) {
      console.error('Offline detection error:', err);
    }
  }, 30000);
  
  redisSubscriber.on('pmessage', async (pattern, channel, message) => {
    if (channel.startsWith('telemetry:')) {
      try {
        const data = JSON.parse(message);
        
        const vps = await prisma.vps.findUnique({ where: { id: data.vpsId } });
        if (!vps) return;
        
        // Throttled DB write (one row per 15s per VPS)
        await writeHistoricalMetric({
          vpsId: vps.id,
          cpu: data.CPUUsage,
          ram: data.RAMUsage,
          disk: data.DiskUsage,
          netTx: data.NetTx,
          netRx: data.NetRx,
          diskTotal: data.DiskTotal,
          timestamp: data.Timestamp
        });

        // Find applicable rules for this VPS (either specifically for this VPS or global for the user)
        const applicableRules = activeRules.filter(r => 
          r.userId === vps.userId && (r.vpsId === null || r.vpsId === vps.id)
        );

        for (const rule of applicableRules) {
          // Skip OFFLINE rules in telemetry handler (handled separately on status change)
          if (rule.metric === 'OFFLINE' || rule.metric === null) continue;

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
                await triggerRuleAction(vps, rule, {
                  metric: rule.metric,
                  value: metricValue,
                  threshold: rule.threshold,
                  durationMin: rule.durationMin
                });

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

/**
 * Trigger a rule's action (alert, restart, custom script, or alert+restart).
 * Builds the message (using custom template if provided) and executes any commands.
 */
const triggerRuleAction = async (vps: any, rule: any, context: {
  metric: string;
  value: number;
  threshold: number;
  durationMin: number;
  offlineMinutes?: number;
}) => {
  const baseMsg = rule.customMessage
    ? applyMessageTemplate(rule.customMessage, vps, context)
    : `🚨 ALERT! VPS ${vps.name} (${vps.ipAddress}) violated rule: ${context.metric} ${rule.condition} ${context.threshold}% for ${context.durationMin} minutes. Current: ${context.value.toFixed(1)}%.`;

  const shouldRestart = rule.action === 'RESTART' || rule.action === 'ALERT_AND_RESTART' || rule.restartOnAlert;
  const shouldAlert = rule.action === 'ALERT' || rule.action === 'ALERT_AND_RESTART' || rule.action === 'NOTIFY_ONLY' || !shouldRestart;
  const shouldRunCustom = rule.action === 'CUSTOM_SCRIPT' && rule.customScript;

  if (shouldAlert) {
    await sendTelegramAlert(vps.userId, baseMsg);
    await pushNotification(vps.userId, {
      type: context.metric === 'OFFLINE' ? 'OFFLINE' : 'ALERT',
      ruleId: rule.id,
      vpsId: vps.id,
      vpsName: vps.name,
      message: baseMsg,
      timestamp: Date.now()
    });
  }

  if (shouldRunCustom) {
    try {
      await executeCommand(vps.id, rule.customScript);
    } catch (cmdErr) {
      console.error('Failed to execute custom script:', cmdErr);
    }
  } else if (shouldRestart) {
    try {
      await executeCommand(vps.id, 'reboot');
    } catch (cmdErr) {
      console.error('Failed to execute restart:', cmdErr);
    }
  }
};

/**
 * Replace template variables in a custom message.
 * Supported: {{vpsName}}, {{ip}}, {{metric}}, {{value}}, {{threshold}}, {{duration}}, {{offlineMinutes}}
 */
const applyMessageTemplate = (template: string, vps: any, context: any): string => {
  return template
    .replace(/\{\{vpsName\}\}/g, vps.name || '')
    .replace(/\{\{ip\}\}/g, vps.ipAddress || '')
    .replace(/\{\{metric\}\}/g, String(context.metric || ''))
    .replace(/\{\{value\}\}/g, (context.value ?? 0).toFixed(1))
    .replace(/\{\{threshold\}\}/g, String(context.threshold ?? ''))
    .replace(/\{\{duration\}\}/g, String(context.durationMin ?? ''))
    .replace(/\{\{offlineMinutes\}\}/g, String(context.offlineMinutes ?? 0));
};
