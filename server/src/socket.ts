import { Server } from 'socket.io';
import http from 'http';
import { redisSubscriber } from './redis';

import { prisma } from './prisma';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecret';

let io: Server;

export const initWebSocket = (server: http.Server) => {
  io = new Server(server, {
    cors: { origin: '*' }
  });

  io.use((socket, next) => {
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

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id, 'User:', socket.data.user.email);

    // İstemci belirli bir VPS'in odasına(room) katılmak isterse
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

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });

  // Redis Pub/Sub'dan gelen verileri WebSocket ile ilgili odalara dağıt
  redisSubscriber.psubscribe('telemetry:*', (err, count) => {
    if (err) console.error('Redis PSubscribe Error:', err);
  });

  redisSubscriber.on('pmessage', (pattern, channel, message) => {
    // channel formatı: telemetry:123
    const vpsId = channel.split(':')[1];
    io.to(`vps_${vpsId}`).emit('telemetry_update', JSON.parse(message));
  });
};
