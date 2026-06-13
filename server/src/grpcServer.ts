import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { redisPublisher, redisCache } from './redis';

const PROTO_PATH = path.join(__dirname, '../proto/vps.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any;
const vpsPackage = protoDescriptor.vps;

const server = new grpc.Server();

import { prisma } from './prisma';

const checkApiKey = async (call: any, callback?: any) => {
  const apiKey = call.metadata.get('x-api-key')[0];
  if (!apiKey) {
    const err = { code: grpc.status.UNAUTHENTICATED, details: 'Missing API Key' };
    if (callback) callback(err); else call.emit('error', err);
    return false;
  }

  const vps = await prisma.vps.findUnique({ where: { apiKey } });
  if (!vps) {
    const err = { code: grpc.status.UNAUTHENTICATED, details: 'Invalid API Key' };
    if (callback) callback(err); else call.emit('error', err);
    return false;
  }

  call.authenticatedVpsId = vps.id;
  return true;
};

server.addService(vpsPackage.BackendService.service, {
  StreamTelemetry: async (call: any) => {
    if (!(await checkApiKey(call))) return;
    call.on('data', (request: any) => {
      redisPublisher.publish(`telemetry:${request.vps_id}`, JSON.stringify({
        vpsId: request.vps_id,
        CPUUsage: request.cpu_usage,
        RAMUsage: request.ram_usage,
        RAMTotal: request.ram_total,
        DiskUsage: request.disk_usage,
        NetTx: request.net_tx,
        NetRx: request.net_rx,
        Timestamp: request.timestamp
      }));
    });
    call.on('end', () => {
      call.end();
    });
  },
  UploadScreenshot: async (call: any, callback: any) => {
    if (!(await checkApiKey(call, callback))) return;
    redisPublisher.publish(`screenshot:${call.request.vps_id}`, JSON.stringify({
      vpsId: call.request.vps_id,
      imageData: call.request.image_data.toString('base64')
    }));
    await redisCache.hset('vps_latest_screenshots', call.request.vps_id, call.request.image_data.toString('base64'));
    callback(null, { success: true });
  },
  Heartbeat: async (call: any, callback: any) => {
    if (!(await checkApiKey(call, callback))) return;
    try {
      const peer = call.getPeer();
      const agentIp = peer.split(':')[0] || 'Unknown';

      await prisma.vps.update({
        where: { id: call.authenticatedVpsId },
        data: {
          lastHeartbeat: new Date(),
          status: 'ONLINE',
          ipAddress: agentIp
        }
      });
      callback(null, { success: true });
    } catch (err) {
      console.error('Heartbeat update failed:', err);
      callback(null, { success: false });
    }
  }
});

export const startGrpcServer = () => {
  const GRPC_PORT = process.env.GRPC_PORT || 50051;
  server.bindAsync(
    `0.0.0.0:${GRPC_PORT}`,
    grpc.ServerCredentials.createInsecure(),
    (error, port) => {
      if (error) {
        console.error('Failed to start gRPC server:', error);
        return;
      }
      console.log(`gRPC Server is running on port ${port}`);
    }
  );
};
