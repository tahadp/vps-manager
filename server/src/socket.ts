import { Server } from 'socket.io';
import http from 'http';
import { redisSubscriber, redisCache } from './redis';
import { prisma } from './prisma';
import jwt from 'jsonwebtoken';
import { getAgentClient, clearAgentClient } from './grpcClient';

const JWT_SECRET = process.env.JWT_SECRET as string;

let io: Server;

export const initWebSocket = (server: http.Server) => {
  io = new Server(server, {
    cors: {
      origin: (origin: any, callback: any) => {
        callback(null, true);
      },
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
    console.log('Client connected:', socket.id, 'User:', socket.data.user.email);
    let ptyStream: any = null;
    let connectedVpsId: string | null = null;

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
        console.log(`Socket ${socket.id} joined room vps_${vpsId}`);
      } catch (err) {
        console.error(err);
      }
    });

    // Generic list-level room for dashboard / inventory live updates
    socket.on('subscribe_vps_list', () => {
      socket.join('vps_list');
    });

    socket.on('unsubscribe_vps_list', () => {
      socket.leave('vps_list');
    });

    socket.on('pty_connect', async (vpsId: string) => {
      try {
        const user = socket.data.user;
        if (user.role !== 'ADMIN') {
          const vps = await prisma.vps.findUnique({ where: { id: vpsId } });
          if (!vps || vps.userId !== user.id) return socket.emit('pty_error', 'Unauthorized');
        }

        const agentClient = await getAgentClient(vpsId);
        ptyStream = agentClient.ShellStream();
        connectedVpsId = vpsId;

        socket.emit('pty_connected');

        ptyStream.on('data', (msg: any) => {
          socket.emit('pty_output', msg.data.toString('utf-8'));
        });

        ptyStream.on('error', (err: any) => {
          clearAgentClient(vpsId);
          socket.emit('pty_error', err.message || 'Stream error');
          socket.emit('pty_closed');
        });

        ptyStream.on('end', () => {
          socket.emit('pty_output', '\r\n[Connection closed]\r\n');
          socket.emit('pty_closed');
        });

      } catch (err: any) {
        clearAgentClient(vpsId);
        socket.emit('pty_error', err.message || 'Failed to start PTY');
        socket.emit('pty_closed');
      }
    });

    socket.on('pty_input', (data: string) => {
      if (ptyStream && connectedVpsId) {
        ptyStream.write({ vps_id: connectedVpsId, data: Buffer.from(data, 'utf-8') });
      }
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
      if (ptyStream) {
        ptyStream.end();
      }
    });
  });

  redisSubscriber.psubscribe('telemetry:*', 'screenshot:*', 'vps_status:*', 'vps_event:*', (err: any, count: any) => {
    if (err) console.error('Redis PSubscribe Error:', err);
  });

  redisSubscriber.on('pmessage', (pattern: any, channel: any, message: any) => {
    const vpsId = channel.split(':')[1];
    if (pattern === 'telemetry:*') {
      io.to(`vps_${vpsId}`).emit('telemetry_update', JSON.parse(message));
    } else if (pattern === 'screenshot:*') {
      io.to(`vps_${vpsId}`).emit('screenshot_update', JSON.parse(message));
    } else if (pattern === 'vps_status:*') {
      const payload = JSON.parse(message);
      io.to(`vps_${vpsId}`).emit('vps_status_update', payload);
      io.to('vps_list').emit('vps_event', { type: 'STATUS_CHANGED', ...payload });
    } else if (pattern === 'vps_event:*') {
      const payload = JSON.parse(message);
      io.to('vps_list').emit('vps_event', payload);
    }
  });
};
