import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
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
import { startAuditPruneInterval } from './middlewares/audit';
import { authLimiter, apiLimiter } from './middlewares/rateLimit';
import { requireCsrf } from './middlewares/csrf';
import { prisma } from './prisma';
import { redisCache } from './redis';
import { logger } from './logger';
import { metricsHandler, metrics as m } from './metrics-prom';

import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

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
app.use(express.json({ limit: '12mb' })); // 10MB write + 2MB headroom
app.use(cookieParser());

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

// HTTP request metrics (after helmet/cors, before routes)
app.use((req, res, next) => {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const route = (req.route?.path as string) || req.path.replace(/[0-9a-f-]{20,}/gi, ':id');
    const duration = Number(process.hrtime.bigint() - start) / 1e9;
    m.httpRequestsTotal.inc({ method: req.method, route, status: String(res.statusCode) });
    m.httpRequestDurationSeconds.observe({ method: req.method, route, status: String(res.statusCode) }, duration);
  });
  next();
});

// Rate limiting + CSRF
app.use('/api/auth', requireCsrf, authLimiter, authRouter);
app.use('/api/vps', requireCsrf, apiLimiter, vpsRouter);
app.use('/api/admin', requireCsrf, apiLimiter, adminRouter);
app.use('/api/settings', requireCsrf, apiLimiter, settingsRouter);
app.use('/api/audit', requireCsrf, apiLimiter, auditRouter);
app.use('/api/rules', requireCsrf, apiLimiter, rulesRouter);
app.use('/api/notifications', requireCsrf, apiLimiter, notificationsRouter);

// F6-1: Prometheus /metrics endpoint (no auth, not rate-limited — internal scrape only)
app.get('/metrics', metricsHandler);

const PORT = process.env.PORT || 5000;
const GRPC_PORT = parseInt(process.env.GRPC_PORT || '50051', 10);
const server = http.createServer(app);

import { isAgentOnline } from './agentDispatcher';

app.get('/api/debug/agent-status/:id', (req, res) => {
  res.json({ vpsId: req.params.id, isOnline: isAgentOnline(req.params.id) });
});

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
  console.log(`HTTP/WebSocket Server is running on port ${PORT} (gRPC port: ${GRPC_PORT})`);
  startGrpcServer();
  initAlertingEngine();
  startMetricsPruneInterval();
  startAuditPruneInterval();
});
