import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import http from 'http';
import { randomUUID } from 'crypto';
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
import { prisma } from './prisma';
import { redisCache } from './redis';
import { logger } from './logger';

dotenv.config({ path: '../.env' });

const app = express();

app.set('trust proxy', 1);

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

app.use((req, _res, next) => {
  (req as any).id = randomUUID();
  (req as any).log = logger.child({ reqId: (req as any).id });
  next();
});

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  hsts: process.env.NODE_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
}));

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

app.get('/health/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    await redisCache.ping();
    res.json({ status: 'ok' });
  } catch (err) {
    res.status(503).json({ status: 'degraded', error: (err as Error).message });
  }
});

initWebSocket(server);

server.listen(PORT, () => {
  console.log(`HTTP/WebSocket Server is running on port ${PORT}`);
  startGrpcServer();
  initAlertingEngine();
  startMetricsPruneInterval();
});
