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
import { initAlertingEngine } from './alerting';

dotenv.config({ path: '../.env' });

const app = express();

if (!process.env.JWT_SECRET) {
  throw new Error("FATAL ERROR: JWT_SECRET environment variable is missing.");
}
if (!process.env.AGENT_API_KEY) {
  throw new Error("FATAL ERROR: AGENT_API_KEY environment variable is missing.");
}

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRouter);
app.use('/api/vps', vpsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/audit', auditRouter);
app.use('/api/rules', rulesRouter);

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
});
