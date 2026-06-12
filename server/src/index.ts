import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import http from 'http';
import { startGrpcServer } from './grpcServer';
import { initWebSocket } from './socket';
import { authRouter } from './routes/auth';

dotenv.config({ path: '../.env' });

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'vps-management-server' });
});

initWebSocket(server);

server.listen(PORT, () => {
  console.log(`HTTP/WebSocket Server is running on port ${PORT}`);
  startGrpcServer();
});
