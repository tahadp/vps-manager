import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { redisPublisher, redisCache } from './redis';
import { logger } from './logger';
import { metrics as m } from './metrics-prom';
import { handleVpsRecovery } from './alerting';

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
import { logIpChangeIfChanged } from './middlewares/audit';
import { registerAgentStream, unregisterAgentStream, resolveAgentResponse, handleShellOutput, recordHeartbeat } from './agentDispatcher';

// parseAgentIPs splits a comma-separated agent_ip value into a JSON array
// of trimmed, non-empty IP strings. Returns null for empty or single-IP
// (no comma) input — in that case the caller falls back to writing
// ipAddress only.
//
// Examples:
//   ""                      -> null
//   "192.168.1.10"          -> null
//   "192.168.1.10,10.0.0.5" -> '["192.168.1.10","10.0.0.5"]'
//   "192.168.1.10, ,10.0.0.5" -> '["192.168.1.10","10.0.0.5"]' (whitespace tolerated)
export function parseAgentIPs(agentIp: string | undefined | null): string | null {
  if (!agentIp) return null;
  const parts = agentIp
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (parts.length < 2) return null;
  return JSON.stringify(parts);
}

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
    if (!(await checkApiKey(call))) {
      m.grpcCallsTotal.inc({ method: 'StreamTelemetry', status: 'error' });
      return;
    }

    call.on('data', (request: any) => {
      m.telemetryFramesTotal.inc();
      redisPublisher.publish(`telemetry:${request.vps_id}`, JSON.stringify({
        vpsId: request.vps_id,
        CPUUsage: request.cpu_usage,
        RAMUsage: request.ram_usage,
        RAMTotal: request.ram_total,
        DiskUsage: request.disk_usage,
        DiskTotal: request.disk_total,
        NetTx: request.net_tx,
        NetRx: request.net_rx,
        Timestamp: request.timestamp,
        Uptime: Number(request.uptime || 0)
      }));
    });

    call.on('end', () => {
      call.end();
    });
    call.on('error', () => {
      m.grpcCallsTotal.inc({ method: 'StreamTelemetry', status: 'error' });
    });
  },
  UploadScreenshot: async (call: any, callback: any) => {
    if (!(await checkApiKey(call, callback))) {
      m.grpcCallsTotal.inc({ method: 'UploadScreenshot', status: 'error' });
      return;
    }
    redisPublisher.publish(`screenshot:${call.request.vps_id}`, JSON.stringify({
      vpsId: call.request.vps_id,
      imageData: call.request.image_data.toString('base64')
    }));
    await redisCache.hset('vps_latest_screenshots', call.request.vps_id, call.request.image_data.toString('base64'));
    m.grpcCallsTotal.inc({ method: 'UploadScreenshot', status: 'ok' });
    callback(null, { success: true });
  },
  Heartbeat: async (call: any, callback: any) => {
    if (!(await checkApiKey(call, callback))) {
      m.grpcCallsTotal.inc({ method: 'Heartbeat', status: 'error' });
      return;
    }
    try {
      const peer = call.getPeer();
      const parts = peer.split(':');
      let peerIp = 'Unknown';
      if (parts.length >= 2) {
        if (parts[0] === 'ipv4' || parts[0] === 'ipv6') {
          peerIp = parts[1].replace(/[\[\]]/g, '');
        } else {
          peerIp = parts[0].replace(/[\[\]]/g, '');
        }
      } else {
        peerIp = peer;
      }
      const agentIp = (call.request && call.request.agent_ip) || peerIp;
      const ipAddressesJson = parseAgentIPs(agentIp);
      const now = new Date();

      await handleVpsRecovery(call.authenticatedVpsId, now, agentIp, ipAddressesJson);

      let settingsMessage: any = null;
      try {
        let settings = await prisma.vpsSettings.findUnique({ where: { vpsId: call.authenticatedVpsId } });
        if (!settings) {
          try {
            settings = await prisma.vpsSettings.create({
              data: {
                vpsId: call.authenticatedVpsId,
                screenshotIntervalSec: 30,
                telemetryIntervalSec: 1,
                ramDiskVisible: true,
                networkVisible: true
              }
            });
          } catch (createErr: any) {
            if (createErr.code === 'P2002') {
              settings = await prisma.vpsSettings.findUnique({ where: { vpsId: call.authenticatedVpsId } });
            } else {
              throw createErr;
            }
          }
        }
        if (settings) {
          settingsMessage = {
            screenshotIntervalSec: settings.screenshotIntervalSec,
            telemetryIntervalSec: settings.telemetryIntervalSec
          };
        }
      } catch (settingsErr) {
        logger.error({ err: settingsErr }, 'Settings load failed (using defaults)');
      }

      recordHeartbeat(call.authenticatedVpsId);

      redisPublisher.publish(`vps_status:${call.authenticatedVpsId}`, JSON.stringify({
        vpsId: call.authenticatedVpsId,
        status: 'ONLINE',
        lastHeartbeat: now.toISOString(),
        ipAddress: agentIp
      }));

      m.grpcCallsTotal.inc({ method: 'Heartbeat', status: 'ok' });

      if (settingsMessage) {
        callback(null, { success: true, settings: settingsMessage });
      } else {
        callback(null, { success: true });
      }
    } catch (err) {
      logger.error({ err }, 'Heartbeat update failed');
      m.grpcCallsTotal.inc({ method: 'Heartbeat', status: 'error' });
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
          m.grpcCallsTotal.inc({ method: 'StreamAgentIO', status: 'error' });
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
        if (msg.body === 'register' && msg.register) {
          const req = msg.register;
          if (req.agent_ip) {
            await logIpChangeIfChanged(boundVpsId, req.agent_ip);
            const registerIpAddressesJson = parseAgentIPs(req.agent_ip);
            await prisma.vps.update({
              where: { id: boundVpsId },
              data: {
                ipAddress: req.agent_ip,
                ...(registerIpAddressesJson !== null ? { ipAddresses: registerIpAddressesJson } : {})
              }
            }).catch((e) => logger.error({ err: e, vpsId: boundVpsId }, 'Failed to update agent_ip'));
          }
          registerAgentStream(boundVpsId, call);
          try {
            call.write({
              request_id: msg.request_id || '',
              register: { success: true }
            });
          } catch (e) {
            logger.error({ err: e, vpsId: boundVpsId }, 'StreamAgentIO register write failed');
          }
          return;
        }
        if (msg.body === 'shell_output' && msg.shell_output) {
          const out = msg.shell_output;
          const sessionId = out.session_id;
          const data = out.data;
          if (sessionId && data) {
            const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
            handleShellOutput(sessionId, buf);
          }
          return;
        }
        resolveAgentResponse(msg);
      } catch (err) {
        logger.error({ err, vpsId: boundVpsId }, 'StreamAgentIO data handler error');
      }
    });

    call.on('end', () => {
      m.grpcCallsTotal.inc({ method: 'StreamAgentIO', status: 'ok' });
      if (boundVpsId) unregisterAgentStream(boundVpsId, call);
      try { call.end(); } catch {}
    });

    call.on('error', (err: any) => {
      m.grpcCallsTotal.inc({ method: 'StreamAgentIO', status: 'error' });
      if (boundVpsId) unregisterAgentStream(boundVpsId, call);
      logger.error({ err: err?.message || err, vpsId: boundVpsId }, 'StreamAgentIO stream error');
    });

    call.on('cancelled', () => {
      if (boundVpsId) unregisterAgentStream(boundVpsId, call);
    });
  }
});

export const startGrpcServer = () => {
  const GRPC_PORT = parseInt(process.env.GRPC_PORT || '50051', 10);
  server.bindAsync(
    `0.0.0.0:${GRPC_PORT}`,
    grpc.ServerCredentials.createInsecure(),
    (error, port) => {
      if (error) {
        logger.error({ err: error }, 'Failed to start gRPC server');
        return;
      }
      logger.info({ port }, 'gRPC Server is running');
    }
  );
};
