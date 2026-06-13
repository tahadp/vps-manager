import { randomUUID } from 'crypto';

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
  console.log(`[agentIO] stream registered for vps=${vpsId} (total=${streamMap.size})`);
}

export function unregisterAgentStream(vpsId: string, stream: ServerWritableStream) {
  if (streamMap.get(vpsId) === stream) {
    streamMap.delete(vpsId);
    heartbeatMap.delete(vpsId);
    rejectAllForVps(vpsId, 'Agent stream disconnected');
    console.log(`[agentIO] stream unregistered for vps=${vpsId} (total=${streamMap.size})`);
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
    console.error(`[agentIO] write failed for vps=${vpsId}:`, err);
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
    if (msg.body && (msg.body.shell_output || msg.body.shell_opened || msg.body.shell_closed)) {
      return;
    }
    console.warn(`[agentIO] no pending request for id=${msg.request_id}`);
    return;
  }
  clearTimeout(pending.timer);
  pendingRequests.delete(msg.request_id);
  pending.resolve(msg);
}

export function getConnectedVpsIds(): string[] {
  return Array.from(streamMap.keys());
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
    try { h(sessionId, buf); } catch (err) { console.error('[agentIO] shell handler error:', err); }
  }
}
