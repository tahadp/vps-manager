# VPS Yönetim Paneli (vps-manager)

Multi-user VPS management dashboard. Users register, register VPS instances, the server deploys
Go agents that stream telemetry and screenshots over gRPC; the dashboard renders metrics, terminals,
file managers, and rule-based alerts in real time.

## Stack
- **Agent**: Go 1.25 + Bubbletea TUI
- **Backend**: Node.js 22 + TypeScript 6, Express 5, gRPC bridge
- **Frontend**: Next.js 16.2 + React 19
- **Storage**: PostgreSQL 15 (relational), Redis 7 (telemetry pub/sub + rate limit)
- **Transport**: gRPC (agent ↔ backend), WebSocket (backend ↔ frontend)
- **Deployment**: Coolify on `45.198.68.109`

## Prerequisites
- Node.js 22.x
- Go 1.25.x
- Docker + Docker Compose (for local dev)
- PostgreSQL 15 client (optional, for inspecting prod DB)

## Install
```bash
git clone https://github.com/tahadp/vps-manager.git
cd vps-manager
# Server
cd server && npm install
# Client
cd ../client && npm install
# Agent (Go modules)
cd ../agent && go mod download
```

## Development
```bash
# Start Postgres + Redis + server + client
docker compose up -d
# In separate terminals:
cd server && npm run dev          # http://localhost:4567
cd client && npm run dev          # http://localhost:3000
cd agent && go run .              # TUI dashboard
```

## Test
```bash
cd server && npm test             # 19 vitest tests
cd client && npm test             # 9 vitest tests
cd agent && go test -race ./...   # Go test suite
```

## Type check
```bash
cd server && npm run typecheck    # tsc --noEmit
cd client && npm run typecheck
cd agent && go vet ./...
```

## Proto sync
```bash
cd server && npm run proto:sync   # copy root -> server/proto
cd server && npm run proto:check  # CI drift guard, exit 1 on drift
```

## Encryption setup (F2-3, required for production)
```bash
openssl rand -base64 32           # generate 32-byte base64 ENCRYPTION_KEY
# Add to .env and Coolify env
node server/scripts/encrypt-existing-tokens.ts   # one-time backfill of legacy plain-text tokens
```

## Deploy
Coolify auto-deploys on push to `main`. Manual deploy:
```bash
# Push to main
git push origin main
# Coolify webhook → rebuild server + client images → deploy
```

For production deploy hardening (TLS, fail2ban, systemd, logrotate), see [docs/m1-coolify-secrets.md](docs/m1-coolify-secrets.md).

For disaster recovery and monitoring, see:
- [docs/runbook/disaster-recovery.md](docs/runbook/disaster-recovery.md)
- [docs/monitoring.md](docs/monitoring.md)

## Project layout
```
/server   Node.js backend + gRPC bridge
/client   Next.js web dashboard
/agent    Go VPS agent (Bubbletea TUI)
/proto    gRPC contract (single source of truth)
```

## License
Proprietary.
