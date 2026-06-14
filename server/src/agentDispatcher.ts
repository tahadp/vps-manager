import { randomUUID } from 'crypto';
import { logger } from './logger';

type ServerWritableStream = any;

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
  timer: NodeJS.Timeout;
  vpsId: string;
}

const streamMap = new Map<string, ServerWritableStream>();
const heartbeatMap = new Map<string, number>();
const pendingRequests = new Map<string, PendingRequest>();
const DEFAULT_TIMEOUT_MS = 30_000;
const HEARTBEAT_TTL_MS = 60_000;
const HEARTBEAT_PRUNE_INTERVAL_MS = 30_000;

function pruneStaleHeartbeats() {
  const now = Date.now();
  for (const [vpsId, ts] of heartbeatMap) {
    if (now - ts > HEARTBEAT_TTL_MS) heartbeatMap.delete(vpsId);
  }
}

setInterval(pruneStaleHeartbeats, HEARTBEAT_PRUNE_INTERVAL_MS).unref();

export function recordHeartbeat(vpsId: string): void {
  heartbeatMap.set(vpsId, Date.now());
}

function rejectAllForVps(vpsId: string, reason: string) {
  for (const [id, p] of pendingRequests.entries()) {
    if (p.vpsId === vpsId) {
      clearTimeout(p.timer);
      p.reject(new Error(reason));
      pendingRequests.delete(id);
    }
  }
}

export function registerAgentStream(vpsId: string, stream: ServerWritableStream) {
  const previous = streamMap.get(vpsId);
  if (previous && previous !== stream) {
    try { previous.end(); } catch {}
  }
  streamMap.set(vpsId, stream);
  logger.info({ vpsId, total: streamMap.size }, '[agentIO] stream registered');
}

export function unregisterAgentStream(vpsId: string, stream: ServerWritableStream) {
  if (streamMap.get(vpsId) === stream) {
    streamMap.delete(vpsId);
    heartbeatMap.delete(vpsId);
    rejectAllForVps(vpsId, 'Agent stream disconnected');
    logger.info({ vpsId, total: streamMap.size }, '[agentIO] stream unregistered');
  }
}

export function isAgentOnline(vpsId: string): boolean {
  return streamMap.has(vpsId);
}

export function sendToAgent(vpsId: string, serverMessage: any): boolean {
  const stream = streamMap.get(vpsId);
  if (!stream) return false;
  try {
    stream.write(serverMessage);
    return true;
  } catch (err) {
    logger.error({ err, vpsId }, '[agentIO] write failed');
    unregisterAgentStream(vpsId, stream);
    return false;
  }
}

export async function requestAgent<T = any>(
  vpsId: string,
  buildMessage: (requestId: string) => any,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const stream = streamMap.get(vpsId);
  if (!stream) {
    throw new Error(`Agent for vps=${vpsId} is not connected`);
  }
  const requestId = randomUUID();
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error(`Agent request timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    pendingRequests.set(requestId, { resolve, reject, timer, vpsId });
    const msg = buildMessage(requestId);
    if (!msg) {
      clearTimeout(timer);
      pendingRequests.delete(requestId);
      reject(new Error('buildMessage returned undefined'));
      return;
    }
    try {
      stream.write(msg);
    } catch (err) {
      clearTimeout(timer);
      pendingRequests.delete(requestId);
      unregisterAgentStream(vpsId, stream);
      reject(err);
    }
  });
}

export function resolveAgentResponse(msg: any) {
  if (!msg || !msg.request_id) return;
  const pending = pendingRequests.get(msg.request_id);
  if (!pending) {
    // shell_output gibi fire-and-forget mesajlar için yoksay
    if (msg.body && (msg.body.shell_output || msg.body.shell_opened || msg.body.shell_closed || msg.body.file_op_result)) {
      return;
    }
    logger.warn({ requestId: msg.request_id }, '[agentIO] no pending request');
    return;
  }
  clearTimeout(pending.timer);
  pendingRequests.delete(msg.request_id);
  pending.resolve(msg);
}

export function sendSettingsUpdate(vpsId: string, settings: {
  screenshotIntervalSec: number;
  telemetryIntervalSec: number;
  ramDiskVisible?: boolean;
  networkVisible?: boolean;
  telegramEnabled?: boolean;
  customAlertMessage?: string | null;
  visibleCharts?: string[];
}): boolean {
  const visibleCharts = settings.visibleCharts ?? [];
  return sendToAgent(vpsId, {
    request_id: '',
    settings_update: {
      vps_id: vpsId,
      settings: {
        screenshot_interval_sec: settings.screenshotIntervalSec,
        telemetry_interval_sec: settings.telemetryIntervalSec,
        ram_disk_visible: settings.ramDiskVisible ?? true,
        network_visible: settings.networkVisible ?? true,
        telegram_enabled: settings.telegramEnabled ?? true,
        custom_alert_message: settings.customAlertMessage ?? '',
        visible_charts: visibleCharts
      }
    }
  });
}

export type ShellOutputHandler = (sessionId: string, data: Buffer) => void;
const shellHandlers = new Set<ShellOutputHandler>();

export function onShellOutput(handler: ShellOutputHandler): () => void {
  shellHandlers.add(handler);
  return () => shellHandlers.delete(handler);
}

export function handleShellOutput(sessionId: string, data: Uint8Array | Buffer) {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  for (const h of shellHandlers) {
    try { h(sessionId, buf); } catch (err) { logger.error({ err, sessionId }, '[agentIO] shell handler error'); }
  }
}
