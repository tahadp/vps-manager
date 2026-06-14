import { Server } from 'socket.io';
import http from 'http';
import { redisSubscriber } from './redis';
import { prisma } from './prisma';
import jwt from 'jsonwebtoken';
import { openShellOnAgent, sendShellInput, closeShellOnAgent, getShellSession } from './agentCommands';
import { logger } from './logger';
import { metrics as m } from './metrics-prom';

const JWT_SECRET = process.env.JWT_SECRET as string;

let io: Server;
export { io };

const getCorsOrigins = (): string[] => {
  const raw = process.env.CORS_ORIGIN || 'http://localhost:3000';
  return raw.split(',').map(s => s.trim()).filter(Boolean);
};

export const initWebSocket = (server: http.Server) => {
  io = new Server(server, {
    cors: {
      origin: getCorsOrigins(),
      credentials: true
    },
    transports: ['websocket', 'polling']
  });

  io.use((socket: any, next: any) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication error'));
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      socket.data.user = decoded;
      next();
    } catch (err) {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket: any) => {
    m.socketIoConnections.inc();
    logger.info({ socketId: socket.id, user: socket.data.user?.email }, 'Client connected');

    // Per-user room for live notification push (F0-2)
    if (socket.data.user?.id) {
      socket.join(`user:${socket.data.user.id}`);
    }

    const activeSessions = new Map<string, string>();

    socket.on('subscribe_vps', async (vpsId: string) => {
      try {
        const user = socket.data.user;
        if (user.role !== 'ADMIN') {
          const vps = await prisma.vps.findUnique({ where: { id: vpsId } });
          if (!vps || vps.userId !== user.id) {
            return socket.emit('error', 'Unauthorized to view this VPS');
          }
        }
        socket.join(`vps_${vpsId}`);
        logger.info({ socketId: socket.id, vpsId }, 'Socket joined room');
      } catch (err) {
        logger.error({ err, socketId: socket.id, vpsId }, 'subscribe_vps error');
      }
    });

    socket.on('subscribe_vps_list', () => {
      socket.join('vps_list');
    });

    socket.on('unsubscribe_vps_list', () => {
      socket.leave('vps_list');
    });

    socket.on('shell:open', async (payload: { vpsId: string; sessionId?: string; shell?: string }) => {
      try {
        const user = socket.data.user;
        const { vpsId, sessionId: clientSessionId, shell } = payload || {};
        if (!vpsId) return socket.emit('shell:error', { error: 'vpsId required' });
        if (user.role !== 'ADMIN') {
          const vps = await prisma.vps.findUnique({ where: { id: vpsId } });
          if (!vps || vps.userId !== user.id) return socket.emit('shell:error', { error: 'Unauthorized' });
        }
        const session = await openShellOnAgent(vpsId, shell || (process.platform === 'win32' ? 'cmd.exe' : 'bash'));
        activeSessions.set(session.sessionId, vpsId);
        socket.join(`shell:${session.sessionId}`);
        socket.emit('shell:opened', { sessionId: session.sessionId, vpsId });
      } catch (err: any) {
        socket.emit('shell:error', { error: err?.message || 'Failed to open shell' });
      }
    });

    socket.on('shell:input', (payload: { sessionId: string; data: string }) => {
      if (!payload || !payload.sessionId) return;
      const ok = sendShellInput(payload.sessionId, payload.data);
      if (!ok) {
        socket.emit('shell:error', { sessionId: payload.sessionId, error: 'Session not found' });
      }
    });

    socket.on('shell:close', async (payload: { sessionId: string }) => {
      if (!payload || !payload.sessionId) return;
      const sessionId = payload.sessionId;
      await closeShellOnAgent(sessionId).catch(() => {});
      activeSessions.delete(sessionId);
      socket.leave(`shell:${sessionId}`);
      socket.emit('shell:closed', { sessionId });
    });

    socket.on('disconnect', () => {
      m.socketIoConnections.dec();
      logger.info({ socketId: socket.id }, 'Client disconnected');
      for (const sessionId of activeSessions.keys()) {
        closeShellOnAgent(sessionId).catch(() => {});
      }
      activeSessions.clear();
    });
  });

  redisSubscriber.psubscribe('telemetry:*', 'screenshot:*', 'vps_status:*', 'vps_event:*', 'shell:output:*', 'notifications:user:*', (err: any, count: any) => {
    if (err) logger.error({ err }, 'Redis PSubscribe Error');
  });

  redisSubscriber.on('pmessage', (pattern: any, channel: any, message: any) => {
    if (pattern === 'telemetry:*') {
      const vpsId = channel.split(':')[1];
      io.to(`vps_${vpsId}`).emit('telemetry_update', JSON.parse(message));
    } else if (pattern === 'screenshot:*') {
      const vpsId = channel.split(':')[1];
      io.to(`vps_${vpsId}`).emit('screenshot_update', JSON.parse(message));
    } else if (pattern === 'vps_status:*') {
      const vpsId = channel.split(':')[1];
      const payload = JSON.parse(message);
      io.to(`vps_${vpsId}`).emit('vps_status_update', payload);
      io.to('vps_list').emit('vps_event', { type: 'STATUS_CHANGED', ...payload });
    } else if (pattern === 'vps_event:*') {
      const payload = JSON.parse(message);
      io.to('vps_list').emit('vps_event', payload);
    } else if (pattern === 'shell:output:*') {
      const sessionId = channel.split(':')[2];
      const payload = JSON.parse(message);
      io.to(`shell:${sessionId}`).emit('shell:output', {
        sessionId,
        data: Buffer.from(payload.data, 'base64').toString('utf-8')
      });
    } else if (pattern === 'notifications:user:*') {
      // F0-2: Live notification push to the specific user's room
      const userId = channel.split(':')[1];
      const payload = JSON.parse(message);
      io.to(`user:${userId}`).emit('notification', payload);
    }
  });
};
