import { Server } from 'socket.io';
import http from 'http';
import { redisSubscriber } from './redis';

let io: Server;

export const initWebSocket = (server: http.Server) => {
  io = new Server(server, {
    cors: { origin: '*' }
  });

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // İstemci belirli bir VPS'in odasına(room) katılmak isterse
    socket.on('subscribe_vps', (vpsId: string) => {
      socket.join(`vps_${vpsId}`);
      console.log(`Socket ${socket.id} joined room vps_${vpsId}`);
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
