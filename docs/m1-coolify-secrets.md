# M1 — Coolify Env Doğrulaması (IP-based, secret rotate YOK)

> **Karar:** Mevcut `JWT_SECRET` / `POSTGRES_PASSWORD` / `REDIS_PASSWORD` rotate EDİLMEYECEK. IP tabanlı erişim, Traefik/reverse proxy YOK.

## Coolify deployment bilgileri

### Server service
- **Domain:** `http://x0o0ckog4cco4gco0sk8wk8w.45.198.68.109.sslip.io`
- **Coolify auto PORT:** `4567` (HTTP/REST + WebSocket)
- **GRPC_PORT:** `50051` (port mapping 50051:50051)
- **Base dir:** `/server`, **Dockerfile:** `/Dockerfile`

### Client service
- **Domain:** `http://wcgg0k48osoksswo08wskkkk.45.198.68.109.sslip.io`
- **Coolify auto PORT:** `5674` (Next.js stand-alone)
- **Base dir:** `/client`, **Dockerfile:** `/Dockerfile`

### Container network
- Server ↔ postgres/redis: Coolify `postgres` / `redis` service hostname (internal DNS)
- Server ↔ external: `45.198.68.109:50051` for gRPC agents
- Client ↔ external: `http://x0o0ckog4cco4gco0sk8wk8w.45.198.68.109.sslip.io` (REST/WS)
- Browser ↔ client: `http://wcgg0k48osoksswo08wskkkk.45.198.68.109.sslip.io`

## Coolify'da kontrol listesi

### Service: `server` (Environment Variables UI)

| Variable | Value | Notes |
|---|---|---|
| `PORT` | (Coolify auto-injects 4567) | Don't set manually |
| `GRPC_PORT` | `50051` | Set manually, matches port mapping |
| `DATABASE_URL` | `postgresql://postgres:${POSTGRES_PASSWORD}@postgres:5432/postgres?schema=public&connection_limit=20` | Use `postgres` hostname, not public IP |
| `REDIS_HOST` | `redis` | Coolify service hostname |
| `REDIS_PORT` | `6379` | |
| `REDIS_PASSWORD` | (your existing value) | |
| `JWT_SECRET` | (your existing value) | **MUST be >= 32 chars** or server fails to boot |
| `CORS_ORIGIN` | `http://wcgg0k48osoksswo08wskkkk.45.198.68.109.sslip.io` | **MUST match client domain exactly** |
| `ALLOW_CUSTOM_SCRIPTS` | `false` | |
| `NODE_ENV` | `production` | Enables helmet HSTS |
| `LOG_LEVEL` | `info` | |

### Service: `client` (Build args)

| Build Arg | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `http://x0o0ckog4cco4gco0sk8wk8w.45.198.68.109.sslip.io` |
| `NEXT_PUBLIC_RUSTDESK_URL` | (leave empty) |

### Service: `postgres`

| Variable | Value |
|---|---|
| `POSTGRES_USER` | `postgres` |
| `POSTGRES_PASSWORD` | (your existing value) |
| `POSTGRES_DB` | `postgres` |

### Service: `redis`

| Variable | Value |
|---|---|
| `REDIS_PASSWORD` | (your existing value) |

## Doğrulama adımları

1. **Coolify paneline gir**, her service için env'leri yukarıdaki listeyle karşılaştır.
2. **Eksik/yanlış olanları düzelt.**
3. **Container'ları restart et.**
4. **Server health check** (Coolify auto PORT 4567):
   ```bash
   curl http://x0o0ckog4cco4gco0sk8wk8w.45.198.68.109.sslip.io/health/ready
   # → {"status":"ok"}
   ```
5. **gRPC check** (doğrudan IP, port 50051 plain):
   ```bash
   # Server tarafında 50051 dinlendiğini doğrula (container içinden veya başka bir host'tan)
   nc -zv 45.198.68.109 50051
   # → Connection succeeded
   ```
6. **Client tarayıcıdan git:** `http://wcgg0k48osoksswo08wskkkk.45.198.68.109.sslip.io`
7. **Login test** (admin hesabın varsa):
   ```bash
   curl -i -X POST http://x0o0ckog4cco4gco0sk8wk8w.45.198.68.109.sslip.io/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"identifier":"admin","password":"<admin-pass>"}'
   # → 200 + Set-Cookie: auth-token=...; HttpOnly; SameSite=Strict
   ```

## `JWT_SECRET` < 32 char uyarısı

Eğer `JWT_SECRET=super-secret-key-12345` (25 char) ile server boot etmiyorsa, PowerShell'de yeni secret üret ve Coolify + (gerekirse) `server/.env`'e koy:

```powershell
$jwt = -join ((1..64) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })
Write-Host $jwt
```

Mevcut tüm login token'ları invalid olur. Kullanıcılar tekrar login olur.

## PORT uyumsuzluğu kontrolü

Coolify'ın eski config'de "Ports Exposes" `5000` yazıyordu ama Coolify `PORT=4567` inject ediyordu. Bu uyumsuzluk `Dockerfile`'ın `EXPOSE 5000` demesi ve server'ın 4567'de dinlemesi demekti — şimdi `server/Dockerfile` hem 4567 hem 50051'i expose ediyor.

Eğer hâlâ 5000 görüyorsan:
```bash
# Coolify'ın config'ini güncelle: Ports Exposes = 4567,50051
```

## M1 kapatma

Checklist'i Coolify'da doğrula, sonra bana "M1 tamam" de.
