# Monitoring & Observability

## Logging
- **Library**: `pino` (structured JSON)
- **Default level**: `info` (override via `LOG_LEVEL=debug` for troubleshooting)
- **Request correlation**: `reqId` propagated as `req.log` middleware
- **Production transport**: stdout (JSON); Coolify collects to Traefik access log

## Metrics (Prometheus)
- **Endpoint**: `GET /metrics` (no auth; internal scrape only)
- **Key series**:
  - `http_requests_total{method, route, status}` — request counter
  - `http_request_duration_seconds{method, route, status}` — histogram
  - `historical_metric_writes_total` — telemetry throttling observed
- **Scrape config**: see [docs/m1-coolify-secrets.md](../m1-coolify-secrets.md)

## Error tracking (Sentry)
- **Status**: SDK wiring prepared (server + client `Sentry.init({dsn: process.env.SENTRY_DSN, enabled: !!process.env.SENTRY_DSN})`); env not yet set
- **Required for activation**: `M7` — set `SENTRY_DSN` in Coolify env
- **Sample rate**: 0.1 to start; tune from quota dashboard

## Alerting
- **Telegram**: per-user `VpsSettings.telegramEnabled` + `customAlertMessage` template
- **Templates**: `{{vpsName}}`, `{{ip}}`, `{{metric}}`, `{{value}}`, `{{threshold}}`, `{{duration}}`, `{{offlineMinutes}}`
- **Cooldown**: 1 hour (Redis)
- **429 backoff**: exponential + jitter; circuit-breaker after 5 consecutive errors
- **Recovery notification**: `pushNotification({type: 'RECOVERY'})` on offline→online transition

## Health checks
- `GET /health` — always 200, process liveness
- `GET /health/ready` — 200 if DB + Redis reachable, 503 otherwise
- **Coolify health check**: not configured (`health_check_enabled: false`); rely on Traefik + process restart policy

## Background jobs
See `server/src/jobs/` for the 4 centralized jobs:
- `metricsPrune` — hourly, removes HistoricalMetric rows > 24h
- `auditPrune` — daily, removes AuditLog rows > 90d
- `heartbeatPrune` — 30s, evicts offline agent heartbeat entries
- `rulesRefresh` — 30s, refreshes in-memory alert rule cache from DB

## Runbook links
- Disaster recovery: [runbook/disaster-recovery.md](runbook/disaster-recovery.md)
- Backup script: [../server/scripts/backup.README.md](../server/scripts/backup.README.md)
