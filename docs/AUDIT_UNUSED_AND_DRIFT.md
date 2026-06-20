# VPS Yönetim Paneli — Envanter / Tutarsızlık / Ölü Kod Audit Raporu

**Tarih:** 2026-06-20
**Kapsam:** `client/` (Next.js), `server/` (Node + TS), `agent/` (Go), `proto/`
**Yöntem:** 4 paralel `explore` alt-ajanı tarafından read-only denetim (kod değişikliği yapılmadı).
**Hedef:** AGENTS.md ve `proje.md` ile mevcut kod tabanı arasındaki tüm boşlukları, ölü kodları, hiçbir yere çıkmayan API/olayları ve sözleşme (contract) kaymalarını belgelemek.

---

## 0. Yönetici Özeti

| Kategori | Bulgu Sayısı |
|---|---|
| **Kritik (gerçek bug / bozuk sözleşme)** | 3 |
| **Yüksek (feature claim vs. kod çelişkisi)** | 5 |
| **Orta (drift — doküman vs. kod)** | 9 |
| **Düşük (kozmetik / dead export / orphan route)** | ~25 |

**Oracle doğrulaması (54dk):** 32 bulgudan 30'u CONFIRMED; P0-#2 "register malformed" framing'i "broken wire" yerine "dead write" olarak düzeltildi (Go protobuf unknown oneof case'ini sessizce drop ediyor); P1-#7 LDFLAGS no-op doğrulandı ama `--version` flag'i de yok — gözlemlenebilir semptom düzeltildi; P3-#20 listesine `Sidebar.tsx:7 LogOut` eklendi.

**En acil 4 madde** (prod'da gerçek etki yaratır):

1. **GitHub Actions CI workflow dosyası YOK** — `task.md:152` ve AGENTS.md F3-4 "✅ GitHub Actions CI" diyor; `.github/` sadece `CODEOWNERS` içeriyor.
2. **`NEXT_PUBLIC_RUSTDESK_URL` build arg olarak compose'a geçirilmiyor** — `client/src/app/remote/page.tsx` okuyor, `docker-compose.yml` build args vermiyor; prod imajı `localhost:8080` fallback'ine düşer.
3. **Server compose env eksikleri** — `ALLOW_CUSTOM_SCRIPTS`, `LOG_LEVEL`, `NODE_ENV` kod tarafından okunuyor, `.example.env`'de var, ama `docker-compose.yml:46-53` inject etmiyor.
4. **Server `grpcServer.ts:212-215` `register` oneof olmayan alanı yazıyor** — Go protobuf encoder bilinmeyen oneof case'ini sessizce drop eder; bu yüzden wire malformed değil, ama dead write. `call.write`'tan kaldırılmalı. (Önceki draft "broken wire" olarak işaretlemişti; Oracle düzeltmesiyle severity düşürüldü.)

---

## 1. Client Tier Bulguları

### 1.1 Dead / Unused Pages & Routes

| File | Route | Sorun | Kanıt |
|---|---|---|---|
| `client/src/app/remote/page.tsx` | `/remote` | Sidebar'da, CommandPalette'ta ve hiçbir yerde link yok. AGENTS.md / proje.md'de listelenmemiş. | `grep "href=.*['\"]/remote['\"]" client/src` → 0 sonuç. `Sidebar.tsx:15-21` 5 öğe içeriyor: Dashboard, VPS List, Alerts, Audit, Settings. |

Tüm diğer routelara Sidebar / CommandPalette / 3-nokta menüsünden erişiliyor; doğrulandı.

### 1.2 Dead API Client Exports

`client/src/lib/api.ts` içinde **3 export** public API'de hiç kullanılmıyor:

| Export | Dosya:Satır | Neden Dead |
|---|---|---|
| `apiDownload` | `lib/api.ts:143-151` | Hiçbir component'te çağrılmıyor. |
| `clearCsrfCache` | `lib/api.ts:47-50` | Hiçbir component'te çağrılmıyor. |
| `clearStoredUser` | `lib/api.ts:78-81` | Sadece `api()` içinde line 118'de self-invoke; dış consumer yok. |

Kanıt: `grep "import.*apiDownload|import.*clearCsrfCache|import.*clearStoredUser" client/src` → 0 sonuç.

### 1.3 Dead / Unused Icon Imports (lint no-unused-vars hatası)

| File | Dead Imports |
|---|---|
| `client/src/app/vps/[id]/page.tsx:14-17` | `Zap`, `LayoutDashboard`, `Plus`, `ChevronDown` |
| `client/src/app/vps/page.tsx:7-8` | `Check` |
| `client/src/alerts/page.tsx:7-8` | `ChevronDown`, `Shield` |

### 1.4 Dead / Unused Util Imports

| File | Dead Import | Kanıt |
|---|---|---|
| `client/src/app/page.tsx:15` | `setStoredUser` (from `@/lib/api`) | Sayfa `getStoredUser` çağırıyor; `setStoredUser` hiç çağrılmıyor. |

### 1.5 Mocked / Stub Data (Hardcoded)

| File:Line | Veri | Yorum |
|---|---|---|
| `client/src/components/vps/AddVpsModal.tsx:151` | `--backend-ip="45.198.68.109:50051"` | gRPC backend IP'si hardcoded; env'den gelmiyor. `.example.env`'de karşılığı yok. Prod'da çalışır, başka host'ta kırılır. |
| `client/src/components/vps/AddVpsModal.tsx:159` | Aynı IP Windows snippet'inde tekrar | Aynı sorun. |
| `client/src/app/login/page.tsx:82` | `"System v2.0.4"` branding stringi | Kozmetik, düşük öncelik. |

### 1.6 WebSocket Drift (client tarafı)

| Event | Durum |
|---|---|
| Tüm client→server emitleri (`subscribe_vps`, `subscribe_vps_list`, `shell:open`, `shell:input`, `shell:close`) | Server'da handler var. ✅ |
| Tüm server→client emitleri (`telemetry_update`, `screenshot_update`, `vps_status_update`, `vps_event`, `notification`, `shell:opened`, `shell:output`, `shell:closed`, `shell:error`) | Client'ta listener var. ✅ |
| `vps_event.RENAMED` tipi | Client handle ediyor (`page.tsx:250-269`), ama **server hiç publish etmiyor** (`vps.ts:12` union'da var ama çağrı yok). Kozmetik. |

### 1.7 proje.md / AGENTS.md Tutarsızlıkları (Client)

| İddia | Gerçek | Severity |
|---|---|---|
| AGENTS.md §4.5 — "`client/src/app/error.tsx` Server Component hatalarını yakalar" | `app/error.tsx` dosyası **yok**. Sadece `client/src/components/ErrorBoundary.tsx` (class component, `@deprecated` işaretli) var, `app/layout.tsx:6,49,51`'de wire edilmiş. Yorum: "Use the Next.js `error.tsx` route convention instead" — yani önerilmiş ama yapılmamış. | orta |
| AGENTS.md §4.5 — "Admin tier dropdown `TierSelect` component" | `TierSelect` component'i **yok**. Admin tier UI inline `<select>` (`app/admin/page.tsx:206-215`). `glob **/TierSelect*` → 0 dosya. | düşük |
| proje.md §4.4 — OFFLINE/UPTIME alert metrikleri | Client UI `UPTIME`'ı dropdown'da göstermiyor (sadece `CPU`/`RAM`/`DISK`/`OFFLINE`). Server `alerting.ts:263` `Uptime/60` ile destekliyor; yani server live, client UI yarım. | düşük |
| proje.md §5 — Sidebar 5 öğe + 3 alt sayfa | Hepsi doğrulandı. | OK |

### 1.8 Stale TODOs

`grep "TODO|FIXME|XXX|HACK" client/src/**` → **0 sonuç**. Temiz.

---

## 2. Server Tier Bulguları

### 2.1 Dead Lib Exports & Helpers

Server'da `lib/` dizini yok; helper'lar `server/src/*.ts`'de root'ta.

| File | Symbol | Neden Dead |
|---|---|---|
| `server/src/create_admin.ts:1-49` | `main()` | Standalone CLI script; import edilmiyor. `proje.md §10` ve `.example.env` bunu doğruluyor (auto-seed yok). |
| `server/src/list_users.ts:1-20` | `main()` | CLI-only. |
| `server/src/db_metrics_count.ts:1-20` | `main()` | Hardcoded VPS UUID (line 4); CLI-only. |
| `server/src/test_serialize.ts:1-70` | üç test bloğu | Hiçbir test runner referansı yok. |
| `server/src/middlewares/validation.ts:237-244` | `schemas.approveUser`, `schemas.updateUserRole` | Zod schema export edilmiş ama `validate(schemas.approveUser)` ile hiçbir yerde çağrılmıyor. `PUT /api/admin/users/:id/status` raw string kabul ediyor, Zod kullanmıyor. |

### 2.2 Orphan API Endpoints (no client caller)

| Path | Method | Dokümante mi? | Kanıt |
|---|---|---|---|
| `GET /api/debug/agent-status/:id` | GET | Hayır | `index.ts:98`. Client grep → 0. |
| `GET /health`, `GET /health/ready` | GET | Hayır | Infra probe; OK. |
| `GET /metrics` | GET | Hayır | Prometheus scrape; OK. |
| `POST /api/auth/logout-all` | POST | Evet (F2-1) | `auth.ts:216-239`. Client grep → 0 çağrı. UI yüzeyi yok. |
| `POST /api/auth/refresh` | POST | Evet | `auth.ts:166-206`. Client grep → 0 çağrı. Cookie-driven flow server-side handle ediyor. |

### 2.3 Dead / Orphan WebSocket Events

| Event | Emitted | Listened | Durum |
|---|---|---|---|
| `shell:closed` | `socket.ts:168` | (yok) | Client kapatıyor, hiç handle etmiyor. Düşük risk. |
| `error` (per-socket) | `socket.ts:112,118` | (yok) | Subscribe-vps hata durumlarında defensive; client handle etmiyor. |
| Tüm diğer event'ler (`telemetry_update`, `screenshot_update`, `vps_status_update`, `vps_event`, `notification`, `shell:opened`, `shell:error`, `shell:output`) | Server | Client | ✅ live |
| `subscribe_vps`, `subscribe_vps_list`, `unsubscribe_vps_list` | Client | Server | ✅ live |

### 2.4 Dead Prisma Artifacts

| Artifact | File:Line | Durum |
|---|---|---|
| Enum `VpsState.MAINTENANCE` | `schema.prisma:117` | Filter olarak okunuyor (`vps.ts:59`) ama **hiçbir yerde status='MAINTENENCE' set edilmiyor**. Forward-declared; UI toggle'ı yok. |
| Enum `AlertRule.metric` `UPTIME` | `schema.prisma:184` | Server `alerting.ts:263` destekliyor; client UI dropdown'unda yok (sadece CPU/RAM/DISK/OFFLINE). |
| Field `RefreshToken.replacedById` | `schema.prisma:157-167` | **Schema'da YOK**. proje.md §7 ve AGENTS.md F2-1 "replacedById" diyor; auth.ts:181-193 sadece `revokedAt` set ediyor. |

### 2.5 Dead Env Vars (kod tarafı)

| Name | Durum |
|---|---|
| `REFRESH_TOKEN_SECRET` | proje.md M1 / task.md M1 "≥32 char" diyor; **kod hiç okumuyor**. `auth.ts:35-42,199` hem access hem refresh için `JWT_SECRET` kullanıyor. |
| `AGENT_API_KEY` | proje.md M1 "Coolify env" diyor; **kod hiç okumuyor**. Per-VPS `apiKey` (`Vps.apiKey` field) gRPC metadata'da `x-api-key` üzerinden doğrulanıyor (`grpcServer.ts:32-49`). |
| `SENTRY_DSN` | proje.md M7 "kullanıcı DSN sağlamalı" diyor; **kod hiç okumuyor**. (M7 bloklama olarak kabul edilebilir.) |

`ALLOW_CUSTOM_SCRIPTS`, `LOG_LEVEL`, `NODE_ENV` `.example.env`'de var ve kod tarafından okunuyor; ama `docker-compose.yml:46-53` server container'a inject etmiyor.

### 2.6 Inconsistencies (proje.md / AGENTS.md ↔ Server)

| İddia | Gerçek | Severity |
|---|---|---|
| §4.5 `pruneOldMetrics()` her saat 24h'tan eski satırları siler | `metrics.ts:67-81` + `index.ts:122` `startMetricsPruneInterval` ✅ | OK |
| §4.4 Cooldown 1 saat | `alerting.ts:211,277` `set NX EX 3600` ✅ | OK |
| §4.4 OFFLINE rule | `alerting.ts:200-221` ✅ | OK |
| §4.4 Per-VPS VpsSettings telegramEnabled + customAlertMessage | `schema.prisma:65-66`, `alerting.ts:107,329,344` ✅ | OK |
| §4.6 `vps_event:global` Redis pub/sub chain | ✅ intact (`vps.ts:12-18` → `socket.ts:181` psubscribe → `socket.ts:200` emit). ANCAK `vps.ts:12` union `'ADDED' \| 'DELETED' \| 'STATUS_CHANGED' \| 'RENAMED'` — `RENAMED` hiç publish edilmiyor. | düşük |
| §4.4 "Hazır şablonlar: Critical, Warning, Offline, Recovery" | Sadece `Recovery` + `Offline` server tarafından üretiliyor. Template sistemi yok. | düşük (doc drift) |
| §4.2 xterm.js state machine `idle → connecting → connected → closed` | Server tarafında bu sabitler yok; sadece socket.ts shell open/close. Client `Terminal.tsx`'de state machine var (server audit kapsamı dışı). | düşük |
| §4.4 actions: ALERT, RESTART, CUSTOM_SCRIPT, ALERT_AND_RESTART | Zod enum `validation.ts:191` ayrıca `NOTIFY_ONLY` içeriyor; schema ve alerting engine bunu destekliyor. proje.md'de yok. | düşük |
| §7 `RefreshToken.replacedById` | Schema'da yok, kod yazmıyor. | orta |
| §4.2 `POST /api/auth/logout-all` | Çalışıyor ama UI yok. | düşük |
| §4.2 `POST /api/auth/refresh` | Çalışıyor ama client çağırmıyor. | düşük |

### 2.7 Stale TODOs

`grep "TODO|FIXME|XXX|HACK" server/src/**` → **0 sonuç**. Temiz.

---

## 3. Agent Tier Bulguları

### 3.1 Dead / Unused Go Exports

| File:Line | Symbol | Neden Dead |
|---|---|---|
| `agent/config.go:23` | `loadConfigFrom(path string)` | Üretimde sadece default path ile çağrılıyor. Test seam; test yok. |
| `agent/config.go:35` | `saveConfigTo(path string)` | Aynı. |
| `agent/tui/monitor.go:21` | `InitialMonitorModel()` | Sadece aynı paket içindeki `RunMonitor()` kullanıyor. |

### 3.2 Proto ↔ Agent Drift

| Bulgu | Kanıt | Severity |
|---|---|---|
| **`HeartbeatRequest.IpAddresses` (multi-NIC) YOK** | `proto/vps.proto:42-46` sadece `vps_id`, `timestamp`, `agent_ip` (singular). Agent `daemon.go:485-488` ve `:247-251` tek string gönderiyor. **AGENTS.md §4.3 F4.3 "Multi-NIC IP aggregation → `Heartbeat.IpAddresses`" diyor — feature claim vs. implementation drift.** | yüksek |
| **Server → agent `register` ack mesajı malformed** | `server/src/grpcServer.ts:212-215` `{ request_id, register: { success: true } }` yazıyor; `ServerMessage.body` oneof'unda `register` case'i yok (`proto/vps.proto:65-78` sadece 11-22 arası). Agent `daemon.go:533-562` switch'inde `*ServerMessage_Register` case'i yok. Mesaj drop ediliyor. | yüksek |
| **5 adet `VpsSettingsMessage` alanı agent tarafından okunmuyor** | `applySettings` (`daemon.go:40-53`) sadece `ScreenshotIntervalSec` + `TelemetryIntervalSec` okuyor. Diğer 5 (`ram_disk_visible`, `network_visible`, `telegram_enabled`, `custom_alert_message`, `visible_charts`) gönderiliyor (`agentDispatcher.ts:172-176`) ama agent hiçbirini tüketmiyor. Yorum `daemon.go:32-34`: "Visibility fields are server-driven; agent does not filter locally" — yani intentional ama göndermek anlamsız. | orta |
| **`DeleteFileRequest.request_id`, `MkdirRequest.request_id`, `RenameFileRequest.request_id` dead** | Agent outer `ServerMessage.request_id` kullanıyor (`daemon.go:554`); nested `req.RequestId` okunmuyor. | düşük |
| **Tüm 12 inbound `ServerMessage` case'i** (`Exec`, `Listdir`, `Read`, `Write`, `ShellOpen/Input/Close`, `Refresh`, `SettingsUpdate`, `DeleteFile`, `Mkdir`, `RenameFile`) | Server dispatch ediyor, agent handle ediyor. ✅ | OK |
| **Tüm `AgentMessage` body'leri** (`Register`, `ExecResult`, `ListdirResult`, `ReadResult`, `WriteResult`, `ShellOpened/Output/Closed`, `RefreshAck`, `FileOpResult`) | Server consume ediyor. ✅ | OK |

### 3.3 Dead Config Fields

`agent/config.go` 3 alan (`VpsID`, `BackendIP`, `APIKey`) — hepsi live. **`config.json.example` dosyası YOK** (proje.md ve AGENTS.md referans veriyor; `Makefile:8` de yorum olarak kullanıyor).

### 3.4 Dead TUI / CLI Commands

| UI Öğesi | Handler | Sorun |
|---|---|---|
| `[*] Monitor Metrics (Live)` (`tui/dashboard.go:42`) | `RunMonitor()` (`monitor.go:173-176`) | **`tea.NewProgram(...).Run()` bubbletea `Update` handler içinden çağrılıyor** → nested program parent'ı bloklar ve stdin/stdout'u bozar. Bubbletea nested `NewProgram.Run()` desteklemiyor. | yüksek |
| `r` key (`dashboard.go:117-124`, handler `refreshStatus()` L236-239) | stub | Yorum `L232-235`: "no-op that simply tells the user the refresh was acknowledged". Sadece status mesajı yazıyor. | düşük |

### 3.5 Telemetry Loop

Tüm metrikler toplanıyor (CPU, RAM, RAM total, Disk, Disk total, Net Tx/Rx, Timestamp, Uptime). Cross-platform stub'lanmamış. **Hiç dead branch yok.**

### 3.6 Makefile & Build Drift

| Item | Sorun |
|---|---|
| `Makefile:29` `LDFLAGS := -s -w -X main.version=$(VERSION) -X main.commit=$(COMMIT)` | `var version`, `var commit`, `var buildTime` **hiçbir yerde declared değil**. `cmd/` dizini yok. Go linker sessizce no-op yapar. Binary version expose etmiyor. |
| `make proto` | `agent/pb/` regenerate ediyor; commit'lenmiş generated dosya ile overwrite edebilir. Tasarım gereği ama drift risk. |
| `make build/test/lint/clean` | Hepsi live. |
| `make build-linux`, `make build-windows`, `make build-all` | Live. |

### 3.7 Inconsistencies (proje.md / AGENTS.md ↔ Agent)

| İddia | Gerçek | Severity |
|---|---|---|
| §4.2 "Manuel refresh: `__refresh__` gRPC komutu" | `__refresh__` kod tabanında **yok**; refresh artık `ServerMessage.refresh` (`daemon.go:549`, `agentCommands.ts:93-97`). Audit Batch 2 bunu not etmiş ama proje.md / AGENTS.md hâlâ eski metni içeriyor. | düşük (kod doğru, doküman stale) |
| §4.3 Multi-NIC IP aggregation | (yukarıda — feature missing) | yüksek |
| §4.3 Headless screenshot skip | `daemon.go:431-434` + `telemetry/screenshot.go:98-104` ✅ | OK |
| §4.3 Context discipline — `context.Background()` yasak | Tek `context.Background()` `daemon.go:172`'de root `WithCancel` için (kardianos service callback'inde upstream ctx yok — zorunlu root). Diğer tüm goroutine'ler `p.ctx` veya türevi. **İhlal değil, meşru bootstrap.** | OK |
| §4.3 "Per-VPS `VpsSettings` heartbeat yanıtı ile agent'a iletilir" | `grpcServer.ts:140-144` heartbeat response'unda sadece `screenshotIntervalSec` + `telemetryIntervalSec` populate ediliyor (F0-19/T5.10 intentional). Diğer 5 alan sadece `SettingsUpdate` ile gönderiliyor (`agentDispatcher.ts:172-176`) ama agent onları okumuyor. | orta |
| §6 TUI dashboard: install/uninstall/start/stop/foreground | Hepsi var. Monitor var ama broken (yukarıda). | kısmi |
| §6 Config wizard: VPS ID, Backend IP, API Key | `tui/wizard.go:48-58` hepsini soruyor ✅ | OK |
| §6 "Thread-safe network metrics" | `telemetry/monitor.go:28-33` `netMu sync.Mutex` ✅ | OK |
| §2 "gRPC Security: `x-api-key` header zorunlu" | `daemon.go:116-118` ✅ | OK |
| §2 `ALLOW_CUSTOM_SCRIPTS=false` | **Agent `handleExec` (`daemon.go:564-603`) bu env'i okumuyor**; server-side check (`alerting.ts:359`). Agent her komutu çalıştırır. Server güvenliği `x-api-key`'e bağlı; compromise → RCE. | by design, call out |

### 3.8 Stale TODOs

`grep "TODO|FIXME|XXX|HACK" agent/**/*.go agent/Makefile` → **0 sonuç**. Temiz.

---

## 4. Cross-Tier Sözleşme Bulguları

### 4.1 Proto ↔ Server/Agent (3 drift)

Yukarıda §3.2'de detaylandırıldı. Tekrar:
- `Heartbeat.IpAddresses` missing
- `ServerMessage.register` malformed wire message
- `VpsSettingsMessage` 5 alan agent'a gönderilip okunmuyor (partial semantic)

### 4.2 WebSocket Event Drift

| Event | Durum |
|---|---|
| `error` (per-socket, `socket.ts:112,118`) | Server emit ediyor, client dinlemiyor. Defensive orphan. |
| Diğer tüm event'ler | ✅ live, server↔client symmetric. |
| `vps_status_update` (per-vps) vs `vps_event.STATUS_CHANGED` (global) | İkisi de aynı `vps_status:*` payload'ını forward ediyor; iki event, bir kanal. AGENTS.md §2 design. | OK (by design) |

### 4.3 REST API Drift (8 bulgu)

| Bulgu | Severity |
|---|---|
| `POST /api/auth/refresh` — client çağırmıyor | düşük (orphan) |
| `POST /api/auth/logout-all` — client çağırmıyor | düşük (orphan) |
| `GET /api/debug/agent-status/:id` — client çağırmıyor | düşük (orphan) |
| `POST /api/auth/login` — response body `token` field cookie'nin yanında legacy/fallback. Client cookie kullanıyor, token'ı ignore ediyor. AGENTS.md "Authorization header legacy fallback olarak korundu" diyor. | kozmetik |
| `PUT /api/vps/:id` — Zod `updateVps` schema `customOsName` içermiyor (`validation.ts:162-167`). Client da göndermiyor. `customOsName` post-creation değiştirilemiyor. | orta (feature gap) |
| `POST /api/vps` — response `apiKey` içeriyor (intentional, install command için). AGENTS.md "F2-1: apiKey strip" sadece GET'i kapsıyor. Dokümante, OK. | OK (intentional) |
| `GET /api/vps/:id/settings` — `visibleCharts` STRING olarak dönüyor (JSON). Client `JSON.parse` ediyor. Wire contract açık. | OK (dokümante) |
| `PUT /api/rules/:id` — server full body re-validasyonu (`createRule` schema, `vpsId` zorunlu). Client `alerts/page.tsx:94-102` her zaman full payload gönderiyor. | OK |

### 4.4 Prisma ↔ Response Drift (5 intentional, 0 mismatch)

Tüm "drift" olarak görünen şeyler intentional:
- `Vps.apiKey` POST response'da exposed (install command için)
- `VpsSettings.visibleCharts` string (dokümante)
- `User.tokenVersion` hiç expose edilmiyor (security)
- `User.refreshTokens` hiç expose edilmiyor
- `User.telegramBotToken` plain text (F2-3 bilinen borç)
- `VpsSettings.{ramDiskVisible,networkVisible,telegramEnabled,customAlertMessage,visibleCharts}` heartbeat response'unda yok (F0-19/T5.10 intentional)

1 minor: Zod `AlertRule.action` `NOTIFY_ONLY` kabul ediyor; proje.md §4.4 listelemiyor; schema permissive String.

### 4.5 Env Var Drift (4 bulgu)

| Var | Durum |
|---|---|
| `NEXT_PUBLIC_RUSTDESK_URL` | `.example.env:47` declared, `client/src/app/remote/page.tsx:5` reads; `docker-compose.yml:64-67` build args'a **eklenmemiş**. Prod imajı `localhost:8080` fallback. | yüksek |
| `REFRESH_TOKEN_SECRET` | `.example.env` + proje.md M1 + task.md M1 declared; **kod hiç okumuyor**. | orta |
| `SENTRY_DSN` | proje.md M7 declared; **kod hiç okumuyor** (M7 bloklama). | orta (M-bağımlı) |
| `AGENT_API_KEY` | proje.md M1 declared; **kod hiç okumuyor** (per-VPS `apiKey` kullanılıyor). | düşük |

Tüm `JWT_SECRET`, `CORS_ORIGIN`, `ALLOW_CUSTOM_SCRIPTS`, `LOG_LEVEL`, `NODE_ENV`, `PORT`, `GRPC_PORT`, `DATABASE_URL`, `REDIS_*`, `POSTGRES_*` declared & read ✅

### 4.6 Feature Claim Drift (2 bulgu)

| İddia | Gerçek | Severity |
|---|---|---|
| proje.md §6 "Vps.telegramBotToken encryption M6 sonra" | Schema'da `Vps.telegramBotToken` **yok**; `User.telegramBotToken` var (`schema.prisma:23`). Code doğru (per-User), doc yanlış (per-VPS). | orta (doc fix) |
| `RefreshToken.replacedById` — proje.md §4.2 + AGENTS.md F2-1 | Schema'da field yok (`schema.prisma:157-168`); `auth.ts:181-193` set etmiyor. | orta (schema + code fix) |
| "GitHub Actions CI ✅" — task.md:152, AGENTS.md F3-4 | `.github/` sadece `CODEOWNERS` içeriyor. **Workflow dosyası yok.** | yüksek |
| `RefreshAck.message` semantic (`agent_offline`) | `daemon.go:915-919` branch "wrong vps" için — gerçekten unreachable. `RefreshButton.tsx:21` message'ı ignore ediyor. | düşük (cosmetic) |

### 4.7 Build / CI Drift (4 bulgu)

| Bulgu | Severity |
|---|---|
| `.github/workflows/` dizininde **hiç `.yml` yok** — sadece `CODEOWNERS`. | yüksek |
| `client/Dockerfile` build args: `NEXT_PUBLIC_RUSTDESK_URL` eksik. | yüksek |
| `server/Dockerfile` env: `ALLOW_CUSTOM_SCRIPTS`, `LOG_LEVEL`, `NODE_ENV` eksik. | orta |
| `.goreleaser.yaml` — AGENTS.md "hâlâ açık" (open ticket) | OK (dokümante) |
| `protoc/` repo root'ta var; amacı doğrulanmadı (düşük öncelik) | info |

---

## 5. Önceliklendirilmiş Aksiyon Listesi

### P0 — Acil (Prod Etkisi Olan Gerçek Bug / Bozuk Sözleşme)

| # | Sorun | Etki | Düzeltme |
|---|---|---|---|
| 1 | `.github/workflows/` CI workflow dosyası yok | task.md ve AGENTS.md CI var diyor; CI yok. PR gate boş. | Workflow dosyası yaz + commit. |
| 2 | Server `grpcServer.ts:212-215` `register` body yazıyor (proto'da yok) | Mesaj aslında wire'a malformed olarak GİTMİYOR: Go protobuf encoder `ServerMessage` oneof'unda tanımlı olmayan bir alanı serialize ederken sessizce drop eder. Yani "broken wire" değil, **dead write** — `registerAgentStream()` zaten başarıyla döndükten sonra anlamsız bir no-op yazma. Agent zaten register response beklemiyor. | Düşük (dead code) | `call.write`'tan kaldır. |
| 3 | `NEXT_PUBLIC_RUSTDESK_URL` compose build args'a eklenmemiş | `/remote` sayfası prod'da `localhost:8080` fallback'inde. | `docker-compose.yml:64-67`'ye `NEXT_PUBLIC_RUSTDESK_URL` ekle. |
| 4 | Server compose env: `ALLOW_CUSTOM_SCRIPTS`, `LOG_LEVEL`, `NODE_ENV` eksik | Custom script feature çalışmaz; logger default modda. | `docker-compose.yml:46-53`'e ekle. |

### P1 — Yüksek (Feature Claim vs. Implementation Tutarsızlığı)

| # | Sorun | Etki | Düzeltme |
|---|---|---|---|
| 5 | `Heartbeat.IpAddresses` multi-NIC field proto'da yok | AGENTS.md §4.3 feature claim var, implementation yok. | Proto'ya `repeated string ip_addresses` ekle + agent `getOutboundIP` enumeration loop'u + server `grpcServer.ts:112` reader. VEYA dokümanı düzelt. |
| 6 | TUI Monitor: nested `tea.NewProgram.Run()` parent içinde | TUI kilitlenir / alt-screen bozulur. | `RunMonitor`'u `Update` handler'dan çıkar; `tea.Program`'ı dış scope'a taşı veya subprocess kullan. |
| 7 | `Makefile:29` LDFLAGS `-X main.version` / `-X main.commit` no-op | `var version`/`commit` declared değil, linker sessizce drop ediyor. **`main.go`'da `--version` flag'i yok** (sadece `--api-key`, `--vps-id`, `--backend-ip`); yani gözlemlenebilir semptom "build metadata yok", "`--version` empty" değil. | düşük (kozmetik build metadata) | `agent/main.go`'ya `var (version = "dev"; commit = "unknown"; buildTime = "unknown")` ekle + `--version` flag'i ile yazdır. |
| 8 | `VpsSettingsMessage`'in 5 alanı (`ram_disk_visible`, `network_visible`, `telegram_enabled`, `custom_alert_message`, `visible_charts`) wire'da gönderiliyor ama agent okumuyor | Bant genişliği israfı + sözleşme kafa karışıklığı. | Yorumda ("server-driven; agent does not filter locally") zaten kabul edilmiş: ya proto'dan kaldır ya da `SettingsUpdate` oneof'undan çıkar. |
| 9 | `PUT /api/vps/:id` `customOsName` güncelleyemiyor (schema + client) | Diğer OS seçenekli VPS'leri sonradan değiştirmek imkansız. | `validation.ts:162-167` Zod `updateVps`'e `customOsName` ekle + client edit form'dan expose et. |

### P2 — Orta (Drift — Doküman vs. Kod)

| # | Sorun | Düzeltme |
|---|---|---|
| 10 | `RefreshToken.replacedById` schema + code'da yok, proje.md ve AGENTS.md F2-1 diyor | Schema'ya `replacedById String?` + `auth.ts:181-193` set et. VEYA dokümandan kaldır. |
| 11 | `Vps.telegramBotToken` proje.md/AGENTS.md diyor; schema `User.telegramBotToken` diyor | Dokümanı `User.telegramBotToken`'a çevir. |
| 12 | `vps_event.RENAMED` tipi union'da var ama hiç publish edilmiyor | `vps.ts:12`'den kaldır. VEYA PUT'ta publish ekle. |
| 13 | `VpsState.MAINTENANCE` enum değeri forward-declared ama UI yok | Admin UI'a "Maintenance mode" toggle ekle. VEYA enum'dan kaldır. |
| 14 | `REFRESH_TOKEN_SECRET` declared ama kod okumuyor | `auth.ts:35-42`'yi `process.env.REFRESH_TOKEN_SECRET ?? JWT_SECRET` yap. VEYA dokümandan kaldır. |
| 15 | `AGENT_API_KEY` declared ama kod okumuyor (per-VPS `apiKey` kullanılıyor) | Dokümandan kaldır (M1 listesinden). |
| 16 | `app/error.tsx` Next.js route convention'ı yok, sadece deprecated class component | Yeni `app/error.tsx` yaz. VEYA `@deprecated` comment'i kaldır. |
| 17 | Server compose env eksikleri (P0#4 ile örtüşüyor) | Yukarıda. |
| 18 | `app/remote/page.tsx` orphan route (Sidebar/CommandPalette'ta yok) | Sidebar'a ekle VEYA route'u kaldır. |

### P3 — Düşük (Kozmetik / Dead Export / Orphan Route)

| # | Sorun |
|---|---|
| 19 | `client/src/lib/api.ts` dead exports: `apiDownload`, `clearCsrfCache`, `clearStoredUser` |
| 20 | Client icon imports: 7 dead import (`vps/[id]/page.tsx`, `vps/page.tsx`, `alerts/page.tsx`). Ek: `Sidebar.tsx:7` `LogOut` da dead — listede yok. |
| 21 | Client util import: `setStoredUser` in `app/page.tsx:15` |
| 22 | Hardcoded gRPC IP `45.198.68.109:50051` in `AddVpsModal.tsx:151,159` |
| 23 | Orphan routes: `POST /api/auth/refresh`, `POST /api/auth/logout-all`, `GET /api/debug/agent-status/:id` — UI yok |
| 24 | Orphan WS event: `error` (per-socket) emitted by server, never listened |
| 25 | Orphan `vps_event.RENAMED` client handler (server never publishes) |
| 26 | Dead exports in `agent/config.go`: `loadConfigFrom`, `saveConfigTo` test seams (no tests) |
| 27 | Standalone CLI scripts in `server/src/`: `create_admin.ts`, `list_users.ts`, `db_metrics_count.ts`, `test_serialize.ts` — should move to `server/scripts/` |
| 28 | Dead Zod schemas in `server/src/middlewares/validation.ts:237-244`: `approveUser`, `updateUserRole` |
| 29 | Dead `unsubscribe_vps_list` server handler (no client emitter) |
| 30 | TUI `r` key (`refreshStatus()`) no-op stub |
| 31 | `UPTIME` metric supported in server, not in client rules UI dropdown |
| 32 | Server `error` WS event orphan |

---

## 6. Sıfır Etkili Onaylanan Maddeler (OK)

Aşağıdaki iddiaların hepsi kod + doküman ile uyumlu, değişiklik gerekmez:

- **Tüm REST endpoint'ler** (orphans hariç) client tarafından çağrılıyor; schema match.
- **Tüm WebSocket event'leri** (orphans hariç) symmetric olarak server↔client handle ediliyor.
- **Tüm gRPC inbound `ServerMessage` case'leri** (12 case) server tarafından dispatch ediliyor, agent handle ediyor.
- **Tüm `AgentMessage` body'leri** server tarafından consume ediliyor.
- **Tüm 5 telemetry metrik + uptime** toplanıyor, cross-platform stub yok.
- **Sidebar 5 öğe + 3 per-VPS alt sayfa + NotificationPanel + UserMenu** hepsi live.
- **AGENTS.md §4.3 context discipline** — tek `context.Background()` legitimate root; tüm diğer goroutine'ler `p.ctx`.
- **Tüm rate limit, audit log, CORS, helmet, pg_trgm, tier cap, RefreshToken rotation (revokedAt), settings cache, telemetry throttle 15s, prune jobs** — claimed + implemented.

---

## 7. Denetim Kapsamı ve Metodoloji

**İncelenen dosyalar:**

- **Client (32 dosya):** `client/src/app/**` (tüm page.tsx, layout.tsx, error.tsx yok), `client/src/components/**`, `client/src/lib/**`
- **Server (30+ dosya):** `server/src/{index,redis,logger,prisma,metrics,metrics-prom,alerting,grpcServer,socket,agentDispatcher,agentCommands}.ts`, `server/src/routes/**`, `server/src/middlewares/**`, `server/prisma/schema.prisma`, `server/scripts/sync-proto.js`
- **Agent (10 dosya):** `agent/{main,daemon,config}.go`, `agent/{shell_unix,shell_windows}.go`, `agent/telemetry/**`, `agent/tui/**`, `agent/Makefile`, `agent/config.json`, `agent/pb/vps.pb.go` (oneof cases only), `agent/pb/vps_grpc.pb.go` (decls only)
- **Repo root:** `proje.md`, `AGENTS.md`, `task.md`, `implementation_plan.md`, `docker-compose.yml`, `.example.env`, `proto/vps.proto`, `.github/CODEOWNERS`

**Atlanan:** `*/node_modules`, `*/dist`, `*/build`, `*/coverage`, `*/.next`, `*/bin`, `agent/pb/vps_grpc.pb.go` (generated, full), Prisma migration SQL dosyaları (schema grep ile doğrulandı).

**Kullanılan araçlar:** Glob (file tree), Read (full file), Grep (cross-references), her tier için 1 paralel `explore` ajanı (4 toplam) — toplam ~30 dakikalık denetim.

**Güven seviyeleri:**
- **Yüksek:** dosya:satır kanıtı + cross-reference doğrulanmış.
- **Orta:** dosya:satır kanıtı var ama runtime'da doğrulanmadı (UI davranışı).
- **Düşük:** dosya var/yok tespitine dayanıyor, davranış çıkarımı yapılmadı.

**Hiçbir kod değişikliği yapılmadı** (talep gereği read-only).
