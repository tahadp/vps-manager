import client from 'prom-client';

// Default registry; collect default Node.js metrics (CPU, memory, GC, event loop lag)
client.collectDefaultMetrics({ prefix: 'vpsmgr_' });

export const metrics = {
  httpRequestsTotal: new client.Counter({
    name: 'http_requests_total',
    help: 'Total HTTP requests',
    labelNames: ['method', 'route', 'status'] as const,
  }),
  httpRequestDurationSeconds: new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status'] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  }),
  socketIoConnections: new client.Gauge({
    name: 'socket_io_connections',
    help: 'Current number of connected socket.io clients',
  }),
  grpcCallsTotal: new client.Counter({
    name: 'grpc_calls_total',
    help: 'Total gRPC calls',
    labelNames: ['method', 'status'] as const,
  }),
  telemetryFramesTotal: new client.Counter({
    name: 'telemetry_frames_total',
    help: 'Total telemetry frames received from agents',
  }),
  historicalMetricWrites: new client.Counter({
    name: 'historical_metric_writes_total',
    help: 'Total historical metric rows written to DB',
  }),
  alertFirings: new client.Counter({
    name: 'alert_firings_total',
    help: 'Total alert firings',
    labelNames: ['metric', 'action'] as const,
  }),
};

// GET /metrics — Prometheus text format. Intentionally NO auth: this endpoint is
// expected to be scraped by an internal Prometheus server / sidecar only.
// In production deployments, restrict access at the network layer (firewall,
// internal LB, or bind to a separate admin port).
export const metricsHandler = async (_req: any, res: any) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
};
