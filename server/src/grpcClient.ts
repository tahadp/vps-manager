import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { prisma } from './prisma';

const PROTO_PATH = path.join(__dirname, '../../proto/vps.proto');

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

// Connection cache to avoid leaking gRPC connections
const clientCache = new Map<string, any>();

/**
 * Helper to get a gRPC client for a specific VPS (cached).
 */
export async function getAgentClient(vpsId: string): Promise<any> {
  if (clientCache.has(vpsId)) {
    return clientCache.get(vpsId)!;
  }

  const vps = await prisma.vps.findUnique({ where: { id: vpsId } });
  if (!vps) throw new Error('VPS not found');
  if (!vps.ipAddress) throw new Error('VPS IP address is missing');

  const client = new AgentService(
    `${vps.ipAddress}:${AGENT_PORT}`,
    grpc.credentials.createInsecure()
  );
  clientCache.set(vpsId, client);
  return client;
}

export async function executeCommand(vpsId: string, command: string): Promise<{ success: boolean; output: string }> {
  const client = await getAgentClient(vpsId);
  return new Promise((resolve, reject) => {
    client.ExecuteCommand({ vps_id: vpsId, command }, (err: any, response: any) => {
      if (err) return reject(err);
      resolve(response);
    });
  });
}

export async function listDirectory(vpsId: string, dirPath: string): Promise<any> {
  const client = await getAgentClient(vpsId);
  return new Promise((resolve, reject) => {
    client.ListDirectory({ vps_id: vpsId, path: dirPath }, (err: any, response: any) => {
      if (err) return reject(err);
      resolve(response);
    });
  });
}

export async function readFile(vpsId: string, filePath: string): Promise<any> {
  const client = await getAgentClient(vpsId);
  return new Promise((resolve, reject) => {
    client.ReadFile({ vps_id: vpsId, path: filePath }, (err: any, response: any) => {
      if (err) return reject(err);
      resolve(response);
    });
  });
}

export async function writeFile(vpsId: string, filePath: string, content: Buffer): Promise<any> {
  const client = await getAgentClient(vpsId);
  return new Promise((resolve, reject) => {
    client.WriteFile({ vps_id: vpsId, path: filePath, content }, (err: any, response: any) => {
      if (err) return reject(err);
      resolve(response);
    });
  });
}
