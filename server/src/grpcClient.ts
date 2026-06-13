import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { prisma } from './prisma';

const PROTO_PATH = path.join(__dirname, '../proto/vps.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any;
const AgentService = protoDescriptor.vps.AgentService;

const AGENT_PORT = 50052;
const GRPC_DEADLINE = 10000; // 10 seconds

const clientCache = new Map<string, any>();

export function clearAgentClient(vpsId: string): void {
  const cached = clientCache.get(vpsId);
  if (cached) {
    try { cached.close(); } catch {}
    clientCache.delete(vpsId);
  }
}

export async function getAgentClient(vpsId: string): Promise<any> {
  if (!vpsId) throw new Error('VPS ID is required');

  if (clientCache.has(vpsId)) {
    return clientCache.get(vpsId)!;
  }

  const vps = await prisma.vps.findUnique({ where: { id: vpsId } });
  if (!vps) throw new Error('VPS not found');
  if (!vps.ipAddress || vps.ipAddress === 'Pending') throw new Error('VPS IP address is missing. Is the agent running?');
  if (!vps.apiKey) throw new Error('VPS API key is missing. Agent is not registered.');

  const metadata = new grpc.Metadata();
  metadata.add('x-api-key', vps.apiKey);

  const client = new AgentService(
    `${vps.ipAddress}:${AGENT_PORT}`,
    grpc.credentials.createInsecure(),
    { 'grpc.enable_http_proxy': 0 }
  );
  (client as any)._authMetadata = metadata;
  clientCache.set(vpsId, client);
  return client;
}

export async function executeCommand(vpsId: string, command: string): Promise<{ success: boolean; output: string }> {
  const client = await getAgentClient(vpsId);
  const metadata: grpc.Metadata = (client as any)._authMetadata;
  return new Promise((resolve, reject) => {
    client.ExecuteCommand({ vps_id: vpsId, command }, metadata, { deadline: Date.now() + GRPC_DEADLINE }, (err: any, response: any) => {
      if (err) {
        if (err.code === grpc.status.UNAVAILABLE || err.code === grpc.status.DEADLINE_EXCEEDED) clearAgentClient(vpsId);
        return reject(err);
      }
      resolve(response);
    });
  });
}

export async function listDirectory(vpsId: string, dirPath: string): Promise<any> {
  const client = await getAgentClient(vpsId);
  const metadata: grpc.Metadata = (client as any)._authMetadata;
  return new Promise((resolve, reject) => {
    client.ListDirectory({ vps_id: vpsId, path: dirPath }, metadata, { deadline: Date.now() + GRPC_DEADLINE }, (err: any, response: any) => {
      if (err) {
        if (err.code === grpc.status.UNAVAILABLE || err.code === grpc.status.DEADLINE_EXCEEDED) clearAgentClient(vpsId);
        return reject(err);
      }
      resolve(response);
    });
  });
}

export async function readFile(vpsId: string, filePath: string): Promise<any> {
  const client = await getAgentClient(vpsId);
  const metadata: grpc.Metadata = (client as any)._authMetadata;
  return new Promise((resolve, reject) => {
    client.ReadFile({ vps_id: vpsId, path: filePath }, metadata, { deadline: Date.now() + GRPC_DEADLINE }, (err: any, response: any) => {
      if (err) {
        if (err.code === grpc.status.UNAVAILABLE || err.code === grpc.status.DEADLINE_EXCEEDED) clearAgentClient(vpsId);
        return reject(err);
      }
      resolve(response);
    });
  });
}

export async function writeFile(vpsId: string, filePath: string, content: Buffer): Promise<any> {
  const client = await getAgentClient(vpsId);
  const metadata: grpc.Metadata = (client as any)._authMetadata;
  return new Promise((resolve, reject) => {
    client.WriteFile({ vps_id: vpsId, path: filePath, content }, metadata, { deadline: Date.now() + GRPC_DEADLINE }, (err: any, response: any) => {
      if (err) {
        if (err.code === grpc.status.UNAVAILABLE || err.code === grpc.status.DEADLINE_EXCEEDED) clearAgentClient(vpsId);
        return reject(err);
      }
      resolve(response);
    });
  });
}

/**
 * Trigger the agent to send one immediate telemetry frame and one screenshot.
 * Uses ExecuteCommand with the special "__refresh__" marker.
 */
export async function refreshNow(vpsId: string): Promise<{ success: boolean; output: string }> {
  const client = await getAgentClient(vpsId);
  const metadata: grpc.Metadata = (client as any)._authMetadata;
  return new Promise((resolve, reject) => {
    client.ExecuteCommand({ vps_id: vpsId, command: '__refresh__', timeout_seconds: 5 }, metadata, { deadline: Date.now() + 30000 }, (err: any, response: any) => {
      if (err) {
        if (err.code === grpc.status.UNAVAILABLE || err.code === grpc.status.DEADLINE_EXCEEDED) clearAgentClient(vpsId);
        return reject(err);
      }
      resolve(response);
    });
  });
}
