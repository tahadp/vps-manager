import { randomUUID } from 'crypto';
import { requestAgent, sendToAgent, isAgentOnline, handleShellOutput, onShellOutput } from './agentDispatcher';
import { redisPublisher } from './redis';

const EXEC_TIMEOUT_MS = 35_000;
const READ_TIMEOUT_MS = 15_000;
const WRITE_TIMEOUT_MS = 15_000;
const LISTDIR_TIMEOUT_MS = 15_000;
const REFRESH_TIMEOUT_MS = 10_000;
const SHELL_OPEN_TIMEOUT_MS = 10_000;

export async function execOnAgent(vpsId: string, command: string, timeoutSeconds = 30): Promise<{ success: boolean; output: string }> {
  const resp = await requestAgent<any>(vpsId, (requestId) => ({
    request_id: requestId,
    exec: { vps_id: vpsId, command, timeout_seconds: timeoutSeconds }
  }), EXEC_TIMEOUT_MS);
  const body = resp.body?.exec_result;
  return { success: !!body?.success, output: body?.output || '' };
}

export async function listDirOnAgent(vpsId: string, path: string): Promise<{ success: boolean; files: Array<{ name: string; isDir: boolean; size: number }>; error?: string }> {
  const resp = await requestAgent<any>(vpsId, (requestId) => ({
    request_id: requestId,
    listdir: { vps_id: vpsId, path }
  }), LISTDIR_TIMEOUT_MS);
  const body = resp.body?.listdir_result;
  return {
    success: !!body?.success,
    files: (body?.files || []).map((f: any) => ({ name: f.name, isDir: f.is_dir, size: Number(f.size) })),
    error: body?.error || undefined,
  };
}

export async function readFileFromAgent(vpsId: string, path: string): Promise<{ success: boolean; content: Buffer; error?: string }> {
  const resp = await requestAgent<any>(vpsId, (requestId) => ({
    request_id: requestId,
    read: { vps_id: vpsId, path }
  }), READ_TIMEOUT_MS);
  const body = resp.body?.read_result;
  let content: Buffer = Buffer.alloc(0);
  if (body?.content) {
    if (Buffer.isBuffer(body.content)) content = body.content;
    else if (body.content instanceof Uint8Array) content = Buffer.from(body.content);
    else if (typeof body.content === 'string') content = Buffer.from(body.content, 'base64');
  }
  return { success: !!body?.success, content, error: body?.error || undefined };
}

export async function writeFileToAgent(vpsId: string, path: string, content: Buffer): Promise<{ success: boolean; error?: string }> {
  const resp = await requestAgent<any>(vpsId, (requestId) => ({
    request_id: requestId,
    write: { vps_id: vpsId, path, content }
  }), WRITE_TIMEOUT_MS);
  const body = resp.body?.write_result;
  return { success: !!body?.success, error: body?.error || undefined };
}

export async function refreshAgent(vpsId: string): Promise<{ success: boolean }> {
  if (!isAgentOnline(vpsId)) {
    return { success: false };
  }
  const resp = await requestAgent<any>(vpsId, (requestId) => ({
    request_id: requestId,
    refresh: { vps_id: vpsId }
  }), REFRESH_TIMEOUT_MS);
  return { success: !!resp.body?.refresh_ack?.success };
}

export interface ShellSession {
  sessionId: string;
  vpsId: string;
  shell: string;
}

const shellSessions = new Map<string, ShellSession>();
const SHELL_OUTPUT_HOOK = 'agent-commands';

let shellHandlerInstalled = false;
function ensureShellHandlerInstalled() {
  if (shellHandlerInstalled) return;
  onShellOutput((sessionId, data) => {
    const session = shellSessions.get(sessionId);
    if (!session) return;
    redisPublisher.publish(`shell:output:${sessionId}`, JSON.stringify({
      sessionId, vpsId: session.vpsId, data: data.toString('base64')
    }));
  });
  shellHandlerInstalled = true;
}

export async function openShellOnAgent(vpsId: string, shell: string): Promise<ShellSession> {
  ensureShellHandlerInstalled();
  if (!isAgentOnline(vpsId)) {
    throw new Error(`Agent for vps=${vpsId} is not connected`);
  }
  const sessionId = randomUUID();
  const session: ShellSession = { sessionId, vpsId, shell };
  const resp = await requestAgent<any>(vpsId, (requestId) => ({
    request_id: requestId,
    shell_open: { session_id: sessionId, vps_id: vpsId, shell }
  }), SHELL_OPEN_TIMEOUT_MS);
  const body = resp.body?.shell_opened;
  if (!body?.success) {
    throw new Error(body?.error || 'Failed to open shell');
  }
  shellSessions.set(sessionId, session);
  return session;
}

export function sendShellInput(sessionId: string, data: Buffer | string): boolean {
  const session = shellSessions.get(sessionId);
  if (!session) return false;
  const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
  return sendToAgent(session.vpsId, {
    request_id: '',
    shell_input: { session_id: sessionId, data: buf }
  });
}

export async function closeShellOnAgent(sessionId: string): Promise<boolean> {
  const session = shellSessions.get(sessionId);
  if (!session) return false;
  if (!isAgentOnline(session.vpsId)) {
    shellSessions.delete(sessionId);
    return true;
  }
  const ok = sendToAgent(session.vpsId, {
    request_id: '',
    shell_close: { session_id: sessionId }
  });
  shellSessions.delete(sessionId);
  return ok;
}

export function getShellSession(sessionId: string): ShellSession | undefined {
  return shellSessions.get(sessionId);
}
