import { redisSubscriber, redisCache, redisPublisher } from './redis';
import axios from 'axios';
import { prisma } from './prisma';
import { execOnAgent } from './agentCommands';
import { writeHistoricalMetric } from './metrics';
import { io } from './socket';
import { logger } from './logger';
import { metrics as m } from './metrics-prom';

export const sendTelegramAlert = async (userId: string, message: string) => {
  try {
    // F1-8: honor 429 backoff window
    const backoffKey = `tg_backoff:${userId}`;
    if (await redisCache.get(backoffKey)) {
      logger.debug({ userId }, 'Telegram alert skipped: in 429 backoff');
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.telegramBotToken || !user.telegramChatId) return;

    try {
      const res = await axios.post(`https://api.telegram.org/bot${user.telegramBotToken}/sendMessage`, {
        chat_id: user.telegramChatId,
        text: message,
      }, { timeout: 5000 });
      if (res.status === 429) {
        await redisCache.set(backoffKey, '1', 'EX', 60);
        logger.warn({ userId }, 'Telegram 429: backoff 60s');
      }
    } catch (sendErr) {
      if (axios.isAxiosError(sendErr) && sendErr.response?.status === 429) {
        await redisCache.set(backoffKey, '1', 'EX', 60);
        logger.warn({ userId }, 'Telegram 429: backoff 60s');
      } else {
        throw sendErr;
      }
    }
  } catch (error) {
    logger.error({ err: error, userId }, 'Telegram notification failed for user');
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
    const payload = JSON.stringify(notification);
    await redisCache.lpush(`notifications:user:${userId}`, payload);
    await redisCache.ltrim(`notifications:user:${userId}`, 0, 49);
    // F0-2: Live push via WebSocket. Publish to Redis so any node instance can forward.
    await redisPublisher.publish(`notifications:user:${userId}`, payload);
    // Also emit directly if io is already initialized in this process.
    io?.to(`user:${userId}`).emit('notification', notification);
  } catch (err) {
    logger.error({ err }, 'pushNotification failed');
  }
};

let activeRules: any[] = [];

const refreshRules = async () => {
  try {
    activeRules = await prisma.alertRule.findMany();
  } catch (err) {
    logger.error({ err }, 'Failed to refresh alert rules');
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

        // F0-14: Honor VpsSettings.telegramEnabled
        const offlineSettings = await prisma.vpsSettings.findUnique({ where: { vpsId: vps.id } }).catch(() => null);
        if (offlineSettings?.telegramEnabled !== false) {
          await sendTelegramAlert(
            vps.userId,
            `⚠️ VPS ${vps.name} (${vps.ipAddress}) is OFFLINE — no heartbeat received for over 60 seconds.`
          );
        }

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
          // F0-12: Atomic SET NX EX — only one writer claims the cooldown slot
          const acquired = await redisCache.set(cooldownKey, '1', 'EX', 3600, 'NX');
          if (acquired !== 'OK') continue;

          await triggerRuleAction(vps, rule, {
            metric: 'OFFLINE',
            value: 0,
            threshold: 0,
            durationMin: 0,
            offlineMinutes
          });
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
        // F0-3: Emit RECOVERY notification
        await prisma.vps.update({
          where: { id: vps.id },
          data: { status: 'ONLINE' }
        });
        redisPublisher.publish(`vps_status:${vps.id}`, JSON.stringify({
          vpsId: vps.id,
          status: 'ONLINE',
          lastHeartbeat: vps.lastHeartbeat,
          ipAddress: vps.ipAddress
        }));
        const recoveryMsg = `✅ ${vps.name} (${vps.ipAddress}) is back ONLINE.`;
        await sendTelegramAlert(vps.userId, recoveryMsg);
        await pushNotification(vps.userId, {
          type: 'RECOVERY',
          vpsId: vps.id,
          vpsName: vps.name,
          message: recoveryMsg,
          timestamp: Date.now()
        });
      }
    } catch (err) {
      logger.error({ err }, 'Offline detection error');
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
            // F0-12: Atomic cooldown check-and-set
            const ruleCooldownKey = `rule_cooldown:${rule.id}:${vps.id}`;
            const acquired = await redisCache.set(ruleCooldownKey, '1', 'EX', 3600, 'NX');
            if (acquired !== 'OK') continue; // Already triggered recently, wait

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

                // Reset state (cooldown already set atomically above)
                await redisCache.del(ruleStateKey);
              } else {
                // Within duration window but not yet exceeded; release the cooldown
                // so the next violation tick can attempt to fire.
                await redisCache.del(ruleCooldownKey);
              }
            }
          } else {
            // Metric recovered, reset the tracking timer
            await redisCache.del(ruleStateKey);
          }
        }
      } catch (err) {
        logger.error({ err }, 'Error parsing telemetry for alerting');
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
  // F0-14: Honor per-VPS overrides from VpsSettings
  const settings = await prisma.vpsSettings.findUnique({ where: { vpsId: vps.id } }).catch(() => null);
  const telegramEnabled = settings?.telegramEnabled !== false; // default true
  const customMessage = settings?.customAlertMessage || rule.customMessage;

  const baseMsg = customMessage
    ? applyMessageTemplate(customMessage, vps, context)
    : `🚨 ALERT! VPS ${vps.name} (${vps.ipAddress}) violated rule: ${context.metric} ${rule.condition} ${context.threshold}% for ${context.durationMin} minutes. Current: ${context.value.toFixed(1)}%.`;

  const shouldRestart = rule.action === 'RESTART' || rule.action === 'ALERT_AND_RESTART' || rule.restartOnAlert;
  const shouldAlert = rule.action === 'ALERT' || rule.action === 'ALERT_AND_RESTART' || rule.action === 'NOTIFY_ONLY' || !shouldRestart;
  const shouldRunCustom = rule.action === 'CUSTOM_SCRIPT' && rule.customScript;

  if (shouldAlert) {
    if (telegramEnabled) {
      await sendTelegramAlert(vps.userId, baseMsg);
    }
    await pushNotification(vps.userId, {
      type: context.metric === 'OFFLINE' ? 'OFFLINE' : 'ALERT',
      ruleId: rule.id,
      vpsId: vps.id,
      vpsName: vps.name,
      message: baseMsg,
      timestamp: Date.now()
    });
    m.alertFirings.inc({ metric: context.metric, action: 'ALERT' });
  }

  if (shouldRunCustom) {
    // F0-13: ALLOW_CUSTOM_SCRIPTS safety gate + per-rule timeout
    if (process.env.ALLOW_CUSTOM_SCRIPTS !== 'true') {
      logger.warn({ vpsId: vps.id, ruleId: rule.id }, '[alert] Custom script blocked (ALLOW_CUSTOM_SCRIPTS!=true)');
    } else {
      try {
        // F0-13: per-rule custom script timeout (schema default 30s, override via createRule.timeoutSeconds)
        const timeoutSec = rule.timeoutSeconds ?? 30;
        await execOnAgent(vps.id, rule.customScript, timeoutSec);
        m.alertFirings.inc({ metric: context.metric, action: 'CUSTOM_SCRIPT' });
      } catch (cmdErr) {
        logger.error({ err: cmdErr, vpsId: vps.id, ruleId: rule.id }, 'Failed to execute custom script');
      }
    }
  } else if (shouldRestart) {
    // F0-13: OS-aware restart command
    const cmd = vps.os === 'WINDOWS' ? 'shutdown /r /t 0' : 'reboot';
    try {
      await execOnAgent(vps.id, cmd);
      m.alertFirings.inc({ metric: context.metric, action: 'RESTART' });
    } catch (cmdErr) {
      logger.error({ err: cmdErr, vpsId: vps.id }, 'Failed to execute restart');
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
