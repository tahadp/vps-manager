import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import http from 'http';
import { startGrpcServer } from './grpcServer';
import { initWebSocket } from './socket';
import { authRouter } from './routes/auth';
import { vpsRouter } from './routes/vps';
import { adminRouter } from './routes/admin';
import { settingsRouter } from './routes/settings';
import { auditRouter } from './routes/audit';
import { rulesRouter } from './routes/rules';
import { notificationsRouter } from './routes/notifications';
import { initAlertingEngine } from './alerting';
import { startMetricsPruneInterval } from './metrics';
import { authLimiter, apiLimiter } from './middlewares/rateLimit';

dotenv.config({ path: '../.env' });

const app = express();

if (!process.env.JWT_SECRET) {
  throw new Error("FATAL ERROR: JWT_SECRET environment variable is missing.");
}
if (process.env.JWT_SECRET.length < 32) {
  throw new Error("FATAL ERROR: JWT_SECRET must be at least 32 characters (use: openssl rand -hex 64).");
}

const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000')
  .split(',').map(s => s.trim()).filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('CORS: origin not allowed'));
  },
  credentials: true
}));
app.use(express.json());

// Rate limiting
app.use('/api/auth', authLimiter, authRouter);
app.use('/api/vps', apiLimiter, vpsRouter);
app.use('/api/admin', apiLimiter, adminRouter);
app.use('/api/settings', apiLimiter, settingsRouter);
app.use('/api/audit', apiLimiter, auditRouter);
app.use('/api/rules', apiLimiter, rulesRouter);
app.use('/api/notifications', apiLimiter, notificationsRouter);

const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'vps-management-server' });
});

initWebSocket(server);

server.listen(PORT, () => {
  console.log(`HTTP/WebSocket Server is running on port ${PORT}`);
  startGrpcServer();
  initAlertingEngine();
  startMetricsPruneInterval();
});
