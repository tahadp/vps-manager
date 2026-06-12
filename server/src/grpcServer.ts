import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';

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

server.addService(vpsPackage.BackendService.service, {
  StreamTelemetry: (call: any) => {
    call.on('data', (request: any) => {
      // console.log(`[Telemetry] VPS ID: ${request.vps_id} - CPU: ${request.cpu_usage}%`);
      // Telemetry processing logic
      const redisPublisher = require('./redis').redisPublisher;
      if (redisPublisher) {
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
      }
    });
    call.on('end', () => {
      call.end();
    });
  },
  UploadScreenshot: (call: any, callback: any) => {
    // console.log(`[Screenshot] Received for VPS ID: ${call.request.vps_id}`);
    const redisPublisher = require('./redis').redisPublisher;
    if (redisPublisher) {
      redisPublisher.publish(`screenshot:${call.request.vps_id}`, JSON.stringify({
        vpsId: call.request.vps_id,
        imageData: call.request.image_data.toString('base64')
      }));
    }
    callback(null, { success: true });
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
