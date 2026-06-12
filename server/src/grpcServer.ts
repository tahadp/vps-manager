import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';

const PROTO_PATH = path.resolve(__dirname, '../../proto/vps.proto');

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

server.addService(vpsPackage.VpsAgent.service, {
  StreamTelemetry: (call: any) => {
    call.on('data', (request: any) => {
      console.log(`[Telemetry] VPS ID: ${request.vps_id} - CPU: ${request.cpu_usage}%`);
      // TODO: Push metrics to Redis Pub/Sub here
    });
    call.on('end', () => {
      call.end();
    });
  },
  ShellStream: (call: any) => {
    call.on('data', (message: any) => {
      console.log(`[Shell] Received data from VPS ID: ${message.vps_id}`);
      // TODO: Forward shell data to WebSockets
    });
    call.on('end', () => {
      call.end();
    });
  },
  ExecuteCommand: (call: any, callback: any) => {
    console.log(`[Command] Received execution request for VPS: ${call.request.vps_id}`);
    callback(null, { success: true, output: 'Command queued' });
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
