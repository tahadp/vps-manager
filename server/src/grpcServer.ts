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

// F0-15: Cache of VPS IDs that already have a VpsSettings row. Avoids the upsert round-trip
// on every heartbeat (10s) for every agent. Invalidated when the user updates settings.
const settingsCache = new Set<string>();

const server = new grpc.Server();

import { prisma } from './prisma';
import { registerAgentStream, unregisterAgentStream, resolveAgentResponse, handleShellOutput, recordHeartbeat } from './agentDispatcher';

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
        DiskTotal: request.disk_total,
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
      const peerIp = peer.split(':')[0] || 'Unknown';
      const agentIp = (call.request && call.request.agent_ip) || peerIp;
      const now = new Date();

      // F0-15: updateMany avoids the existence-check round-trip of update()
      await prisma.vps.updateMany({
        where: { id: call.authenticatedVpsId },
        data: {
          lastHeartbeat: now,
          status: 'ONLINE',
          ipAddress: agentIp
        }
      });

      let settingsMessage: any = null;
      try {
        // F0-15: Cache to avoid upsert round-trip every heartbeat
        const existing = settingsCache.has(call.authenticatedVpsId);
        let settings = existing
          ? await prisma.vpsSettings.findUnique({ where: { vpsId: call.authenticatedVpsId } })
          : null;
        if (!settings) {
          settings = await prisma.vpsSettings.create({
            data: {
              vpsId: call.authenticatedVpsId,
              screenshotIntervalSec: 30,
              telemetryIntervalSec: 1,
              ramDiskVisible: true,
              networkVisible: true
            }
          });
          settingsCache.add(call.authenticatedVpsId);
        }
        settingsMessage = {
          screenshotIntervalSec: settings.screenshotIntervalSec,
          telemetryIntervalSec: settings.telemetryIntervalSec,
          ramDiskVisible: settings.ramDiskVisible,
          networkVisible: settings.networkVisible
        };
      } catch (settingsErr) {
        console.error('Settings load failed (using defaults):', settingsErr);
      }

      recordHeartbeat(call.authenticatedVpsId);

      redisPublisher.publish(`vps_status:${call.authenticatedVpsId}`, JSON.stringify({
        vpsId: call.authenticatedVpsId,
        status: 'ONLINE',
        lastHeartbeat: now.toISOString(),
        ipAddress: agentIp
      }));

      if (settingsMessage) {
        callback(null, { success: true, settings: settingsMessage });
      } else {
        callback(null, { success: true });
      }
    } catch (err) {
      console.error('Heartbeat update failed:', err);
      callback(null, { success: false });
    }
  },
  StreamAgentIO: (call: any) => {
    let boundVpsId: string | null = null;
    let authChecked = false;
    let authPromise: Promise<boolean> | null = null;

    const ensureAuth = async (): Promise<boolean> => {
      if (authChecked) return !!boundVpsId;
      if (!authPromise) {
        authPromise = (async () => {
          const ok = await checkApiKey(call);
          if (ok) {
            boundVpsId = call.authenticatedVpsId;
            authChecked = true;
            return true;
          }
          return false;
        })();
      }
      return authPromise;
    };

    call.on('data', async (msg: any) => {
      try {
        const ok = await ensureAuth();
        if (!ok || !boundVpsId) {
          call.end();
          return;
        }
        if (!msg) return;
        if (msg.body && msg.body.register) {
          const req = msg.body.register;
          if (req.agent_ip) {
            await prisma.vps.update({
              where: { id: boundVpsId },
              data: { ipAddress: req.agent_ip }
            }).catch((e) => console.error('Failed to update agent_ip:', e));
          }
          registerAgentStream(boundVpsId, call);
          try {
            call.write({
              request_id: msg.request_id || '',
              register: { success: true }
            });
          } catch (e) {
            console.error('StreamAgentIO register write failed:', e);
          }
          return;
        }
        if (msg.body && msg.body.shell_output) {
          const out = msg.body.shell_output;
          const sessionId = out.session_id;
          const data = out.data;
          if (sessionId && data) {
            const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
            handleShellOutput(sessionId, buf);
          }
          return;
        }
        if (msg.body && (msg.body.shell_opened || msg.body.shell_closed)) {
          return;
        }
        resolveAgentResponse(msg);
      } catch (err) {
        console.error('StreamAgentIO data handler error:', err);
      }
    });

    call.on('end', () => {
      if (boundVpsId) unregisterAgentStream(boundVpsId, call);
      try { call.end(); } catch {}
    });

    call.on('error', (err: any) => {
      if (boundVpsId) unregisterAgentStream(boundVpsId, call);
      console.error('StreamAgentIO stream error:', err?.message || err);
    });

    call.on('cancelled', () => {
      if (boundVpsId) unregisterAgentStream(boundVpsId, call);
    });
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
