# VPS Yönetim Paneli — Geliştirme Önerileri Raporu

**Tarih:** 2026-06-20
**Kapsam:** `client/` (Next.js), `server/` (Node + TS), `agent/` (Go), `proto/`
**Yöntem:** 3 paralel `explore` alt-ajanı tarafından read-only araştırma (kod değişikliği yapılmadı).
**Hedef:** Mevcut audit (`docs/AUDIT_UNUSED_AND_DRIFT.md`) üzerine, projeyi ölçeklenebilir / güvenli / kullanılabilir / sürdürülebilir hâle getirecek somut geliştirme önerileri.
**Oracle doğrulaması (5dk 35sn):** CONDITIONAL PASS — 1 false positive (F.C3 admin tier change örneği post-success refetch pattern, optimistic değil — düzeltildi) + 1 misprioritization (S.D4 apiKey cache Top 20'ye alındı, O.H10 PWA+Web Push düşürüldü) + audit leftovers Sprint 0 bölümüne eklendi. Diğer 80+ bulgu CONFIRMED.
**İlgili dokümanlar:** `proje.md`, `AGENTS.md`, `task.md`, `docs/AUDIT_UNUSED_AND_DRIFT.md`.

---

## 0. Yönetici Özeti

| Kategori | Bulgu Sayısı |
|---|---|
| **Kritik (acil harekete geçilmeli)** | 4 |
| **Yüksek (bu çeyrekte yapılmalı)** | 11 |
| **Orta (backlog)** | 22 |
| **Düşük (kozmetik / nice-to-have)** | 19 |

**Üç eksende en yüksek getirili 6 kazanç:**

1. **GitHub Actions CI/CD pipeline** — `docs/AUDIT_UNUSED_AND_DRIFT.md` P0-#1; PR gate tamamen boş, prod'a el ile push gidiyor.
2. **gRPC TLS + envelope-encrypted `Vps.apiKey`** — DB sızıntısı bugün RCE'ye eşdeğer; M6/M4 ticketları blokeli (research §A1, §E1).
3. **Multi-channel bildirim altyapısı (Email/Slack/Discord/Webhook)** — tek kanal (Telegram) M6 KMS blokajında; research §H5 paralel mimariyle çözer.
4. **Socket.io Redis adapter** — yatay ölçek için ön-koşul; bugün tek-node varsayımı `socket.ts:51-58` ile gömülü (research §E1).
5. **Sentry SDK + SLO tanımları** — alert engine hâricinde gözlemlenebilirlik yok (research §B1, §B2); M7 blokeli.
6. **VPS bakım pencereleri + clone + description + tag + audit export** — `VpsState.MAINTENANCE` enum'u dead (research §H7); audit'te dead-code olarak işaretli; ürün açısından haklı çıkar.

**Stratejik temalar:**
- **"1000 kullanıcı, 50 VPS / kullanıcı" ölçeği** → E (scaling) + D (caching) + B (observability) eksenleri.
- **"B2B satış"** → I (pricing) + H6 (2FA) + H9 (SSO) + H11 (viewer rolü) + H5 (multi-channel).
- **"Boring ops"** → A (CI/CD) + C (DB ops) + J (docs) — el ile yapılan son şeyleri kaldır.
- **"Tek güvenlik yüzeyini küçült"** → B (auth hardening) + C (input validation) + F (logging) + G (DR).

---

## 1. Frontend / UX / DX Ekseni

> Araştırma dosyası: 60+ bulgu, hepsi `client/src/**` dosyalarında file:line kanıtlı.

### 1.1 Erişilebilirlik (WCAG 2.1 AA)

| # | Bulgu | Yer | Öneri | Etki | Efor |
|---|---|---|---|---|---|
| F.A1 | Icon-only butonlarda `aria-label` yok (~20+ buton) | `client/src/app/page.tsx:30,137-159,485`; `vps/page.tsx:376-404`; `vps/[id]/page.tsx:453-485`; `NotificationPanel.tsx:62`; `ScreenView.tsx:62`; `FileManager.tsx:241,350-390`; `Topbar.tsx:28`; `RefreshButton.tsx:30-38` | Her butona anlamlı `aria-label`; durum-değişken ikonlarda `aria-busy` | a11y | S |
| F.A2 | Toast'lar `aria-live` değil, SR kullanıcıları duymuyor | `page.tsx:425-432`; `vps/page.tsx:296-303`; `vps/[id]/page.tsx:442-449`; `admin/page.tsx:140-144` | Wrapper'a `role="status" aria-live="polite"` | a11y (WCAG 4.1.3) | S |
| F.A3 | Drag handle div olarak, klavye ile reorder yapılamıyor | `app/page.tsx:30-32` | dnd-kit `KeyboardSensor` zaten tanımlı (L328-331); handle'a `tabIndex={0}` + `aria-label` | a11y + UX | S |
| F.A4 | Status dot SR'a duyurulmuyor | `page.tsx:51-62`; `vps/page.tsx:355`; `vps/[id]/page.tsx:460` | `<span aria-label="Online">` veya visually-hidden text | a11y | S |
| F.A5 | Modal focus trap + Esc sadece `AddVpsModal`'da var; 6 modal'da YOK | `page.tsx:434-444`, `vps/page.tsx:305-315`, `vps/[id]/page.tsx:400-440`, `alerts/page.tsx:389-400`, `vps/[id]/alerts/page.tsx:421-432`, `admin/page.tsx:146-163` (AGENTS.md §4.5 "tüm modal" diyor, sadece bir tanesinde var) | `<Modal>` wrapper'a extract et | a11y + tutarlılık | S |
| F.A6 | Form `<label>`'ları `htmlFor` ile input'a bağlı değil | `vps/[id]/page.tsx:412-440`; `vps/[id]/settings/page.tsx:114-184`; `settings/page.tsx:198-225`; `alerts/page.tsx:212-300` | `id`+`htmlFor`, `aria-describedby` hint, `aria-invalid` hata | a11y (WCAG 1.3.1, 3.3.2) | M |
| F.A7 | Skip-to-content linki yok | `app/layout.tsx:23-56` | `<a href="#main" className="sr-only focus:not-sr-only">` + `<main id="main" tabIndex={-1}>` | a11y | XS |
| F.A8 | Terminal/PTY a11y etiketsiz | `Terminal.tsx:162-184` | `role="application" aria-label="Terminal session for ${vpsId}"` + reconnect overlay `aria-live` | a11y | S |
| F.A9 | WS status değişimi SR'a duyurulmuyor | `socket.tsx:59-80`; `AppShell.tsx` | `AppShell`'de `aria-live` region: "Connection lost, retrying…", "Reconnected" | a11y | S |
| F.A10 | Renk kontrastı + heading sırası + alt text | `globals.css:105`; `ScreenView.tsx:25,69`; `vps/[id]/page.tsx:457-462,542-678` | `--text-muted` AA'ya getir; her sayfada `<h1>`→`<h2>` sırası; anlamlı `alt` | Lighthouse a11y +10-15 | S |

### 1.2 Performans

| # | Bulgu | Yer | Öneri | Etki | Efor |
|---|---|---|---|---|---|
| F.B1 | Dashboard grid 50 VPS için sanallaştırılmamış (PRO tier cliff) | `app/page.tsx:453-479` (her kart telemetry tick'inde re-render; 50 base64 JPEG = 1.5MB RAM) | `react-window` + per-card state + `loading="lazy" decoding="async"` | Render 600ms→80ms, TTI -2-3s | M |
| F.B2 | VPS Inventory table virtualization yok | `vps/page.tsx:340-412` (her keystroke 50 satırı re-render) | Sayfalama (10/25/50) veya `react-window` + `React.memo` row | Smooth scroll | S |
| F.B3 | Chart 15s polling full range (5760 satır / 24h) | `vps/[id]/page.tsx:180-200,326-336` | Server'a `?since=<ts>&interval=<sec>` ekle + client LTTB downsample + visibility-pause | Payload -95%, CPU -70% | M |
| F.B4 | Screenshot data-URL React state'te | `page.tsx:78-90,247-249`; `ScreenView.tsx:22-28,67-71` | base64→Blob→`URL.createObjectURL` + LRU cache + ayrı `GET /api/vps/:id/screenshot` | RAM -80%, render -50% | M |
| F.B5 | Bundle: framer-motion + recharts her sayfada | `client/package.json:14-32` | Performance tab `next/dynamic`; `lucide-react` per-icon import; basit fade için CSS replace | LCP -200-400ms | M |
| F.B6 | 1 saniyelik interval tüm detail sayfasını re-render ediyor | `vps/[id]/page.tsx:154-159,205-207` | `<TimeAgo />` extracted component (kendi interval'ı ile) | CPU -90% | S |
| F.B7 | 6+ ayrı `useEffect` zinciri | `vps/[id]/page.tsx:154-336` | SWR veya React Query katmanı | Daha az istek + optimistic UI temeli | M |

### 1.3 Real-time UX

| # | Bulgu | Yer | Öneri | Etki | Efor |
|---|---|---|---|---|---|
| F.C1 | Global WS status göstergesi sadece Dashboard'da (proje §5 "global" diyor) | `Topbar.tsx:1-41`; `page.tsx:378-385` | Topbar'a dot + tooltip; disconnected'ta topbar kırmızı border | Evrensel feedback | S |
| F.C2 | Non-terminal sayfalar WS kesildiğinde sessiz | `socket.tsx:46-53` | `AppShell`'de "Real-time data paused" banner (>3s disconnected) | Kafa karışıklığı çözümü | S |
| F.C3 | Optimistic update yok (her refetch 200-500ms); admin tier change de optimistic DEĞİL (`admin/page.tsx:57-70` post-success refetch pattern) | `alerts/page.tsx:103-118`; `vps/[id]/settings/page.tsx:71-84`; `RefreshButton.tsx:21`; `admin/page.tsx:57-70` | TanStack Query `useMutation` + `onMutate` rollback (yeni pattern tanıt) | Sub-100ms perceived latency | M |
| F.C4 | ETag/version ile concurrent edit kontrolü yok | `vps/[id]/page.tsx:244-258,353-360`; `vps/[id]/settings/page.tsx:38-84` | `If-Match` + 412 dialog ile "Reload/Override" | Yanlışlıkla overwrite önleme | M |
| F.C5 | WS `subscribe_vps` N+1 burst rate-limit tetikliyor | `page.tsx:230-235` | `subscribe_vps_batch` server event veya 25ms stagger | Multi-VPS reconnect bug sınıfı çözümü | S |

### 1.4 Mobile & Responsive

| # | Bulgu | Yer | Öneri | Etki | Efor |
|---|---|---|---|---|---|
| F.D1 | Touch targets < 44×44 px WCAG 2.5.5 (Tailwind'de `min-h-touch` tanımlı ama hiç kullanılmıyor) | `page.tsx:136-159`; `vps/page.tsx:376-404`; `vps/[id]/page.tsx:453-485`; `NotificationPanel.tsx:62`; `Topbar.tsx:28-33` | Global `.icon-btn { @apply min-w-11 min-h-11; }` veya Tailwind utility | Mobile a11y | S |
| F.D2 | Topbar 320px viewport'ta overflow | `Topbar.tsx:27-38` | `<md`'de search gizle → CommandPalette launcher | Edge-case fit | S |
| F.D3 | Charts 4'lü grid 375px'te sıkışıyor | `vps/[id]/page.tsx:706-740` | `<md`'de carousel veya single column + expand | Mobile okunabilirlik | M |
| F.D4 | Safe-area padding (notch) yok | `AppShell.tsx:51-114` (Tailwind `safe-top` tanımlı, kullanılmıyor) | `pt-[env(safe-area-inset-top)]` | iOS notç uyumu | XS |
| F.D5 | `/remote` orphan route, mobile'da keşfedilemez | `app/remote/page.tsx:3-7` (audit §1.1) | Sidebar'a ekle VEYA route sil | Keşfedilebilirlik | XS |

### 1.5 i18n

| # | Bulgu | Yer | Öneri | Etki | Efor |
|---|---|---|---|---|---|
| F.E1 | Hiç i18n altyapısı yok; ~200 İngilizce hardcoded string | tüm `client/src/app/**`; `client/src/components/**` | `next-intl` (Next 16 uyumlu); `messages/en.json` + `messages/tr.json` (proje §'larından alınmış kanonik Türkçe); `Accept-Language` + localStorage | Tam Türkçe desteği | L |
| F.E2 | Client `formatUptime` karışık dil (Türkçe `gün`/`saat` + İngilizce) | `vps/[id]/page.tsx:55-69` | `Intl.RelativeTimeFormat` + `Intl.NumberFormat` | Bug fix + i18n-ready | S |
| F.E3 | Alert template variable'ları client/server arası duplicate | `alerts/page.tsx:26-31`; `vps/[id]/alerts/page.tsx:29-34`; server `alerting.ts` | `client/src/lib/templateVars.ts` (single source of truth) + `/docs/template-vars.md` | Senkronizasyon kolaylığı | S |

### 1.6 Hata Yönetimi & Loading

| # | Bulgu | Yer | Öneri | Etki | Efor |
|---|---|---|---|---|---|
| F.F1 | Next.js 16 `error.tsx`/`global-error.tsx`/`not-found.tsx`/`loading.tsx` YOK | (audit §1.7) | 4 dosya oluştur; ErrorBoundary class `@deprecated` kaldır | White-screen ortadan kalkar | M |
| F.F2 | Shared toast sistemi yok; 4 sayfada 4 kopya div | `page.tsx:186,425-432`; `vps/page.tsx:33,296-303`; `vps/[id]/page.tsx:171,442-449`; `admin/page.tsx:17,140-144` | `Toast.tsx` + `lib/toast.ts` (queue) + `AppShell`'e mount; `api()`'den auto-route | Tutarlı UX | M |
| F.F3 | 18 boş `catch {}` hataları yutuyor | `settings/page.tsx:69,77,153`; `page.tsx:217,325`; `audit/page.tsx:28`; `admin/page.tsx:38`; `vps/[id]/page.tsx:199,231`; `CommandPalette.tsx:22`; `NotificationPanel.tsx:29`; `Sidebar.tsx:34`; (`Terminal.tsx`'deki 6 xterm disposal meşru) | F2 ile bağla: her catch → `toast.error()` | Sessiz hata sınıfı çözümü | S (F2 sonrası) |
| F.F4 | Skeleton loader sadece `FileManager`'da | `FileManager.tsx:52-71,446-450`; diğer sayfalar spinner | `Skeleton.tsx` + her sayfada kullan | Algılanan performans | S |
| F.F5 | 5 native `confirm()` + 1 `alert()` stillenmemiş | `page.tsx:166`; `vps/page.tsx:185,198`; `FileManager.tsx:135`; `settings/page.tsx:142,149` | `<ConfirmDialog>` + `useConfirm()` hook | Görsel + a11y tutarlılığı | S |
| F.F6 | Bulk action'larda per-item hata durumu kayboluyor | `vps/page.tsx:153-175` | "47 ok, 3 failed (auth/permission)" per-target reporting | Partial failure feedback | S |

### 1.7 Geliştirici Deneyimi

| # | Bulgu | Yer | Öneri | Etki | Efor |
|---|---|---|---|---|---|
| F.G1 | Component storybook yok | tüm `client/src/components/**` | Storybook 8 + Vite builder (top 8: `OsSelect`, `RefreshButton`, `AddVpsModal`, `NotificationPanel`, `UserMenu`, `ChartPanel`, `ScreenView`, `CommandPalette`); Chromatic ile visual regression | Iteration hızı | L |
| F.G2 | Sadece 1 E2E test yok, unit test sadece `login` | `login/page.test.tsx:1-55` | Playwright matris: auth/vps-crud/alert-rule/terminal/file-manager/dashboard/theme-a11y | Regresyon güvencesi | L |
| F.G3 | Client'ta server type'ları yok; `any[]` cast'leri | `api.ts:1-152`; `vps/page.tsx:50`; `alerts/page.tsx:64` (vs.) | (a) `openapi-typescript-codegen` veya (b) **tRPC rewrite** veya (c) `zod-to-typescript` | Compile-time API contract | M-L |
| F.G4 | Client tarafında request-id korelasyonu yok | `api.ts:83-141` | `x-request-id` response header'ını `ApiError`'a ekle, toast'a include | 10× hızlı destek triage | S |
| F.G5 | `TierSelect` component'i yok, `Toggle` için ARIA yok | `admin/page.tsx:206-215`; `vps/[id]/settings/page.tsx:133-219` | `Toggle.tsx` (`role="switch" aria-checked"`) + `TierSelect.tsx` | A11y + reuse | S |
| F.G6 | CI'da Playwright + axe + Lighthouse yok | (audit P0-#1 ile örtüşüyor) | Workflow'a `playwright test` + `@axe-core/cli` + `lhci autorun` | PR gate | M |

### 1.8 Frontend — Top 10 Öncelikli Kazanç

| Sıra | Başlık | Etki | Efor | Risk |
|---|---|---|---|---|
| 1 | **F.B1 Dashboard grid virtualization (PRO 50 VPS)** | UX+Perf: 600ms→80ms | M | Med |
| 2 | **F.F1 error.tsx + global-error + not-found + loading** | UX+a11y: white-screen yok | M | Low |
| 3 | **F.F2 + F.F3 Shared toast + 18 empty catch fix** | UX: her hata görünür | M | Low |
| 4 | **F.B3 Chart 15s polling downsample + visibility pause** | Perf: payload -95% | M | Med |
| 5 | **F.C1 + F.C2 Global WS indicator + real-time paused banner** | UX: her sayfada WS feedback | S | None |
| 6 | **F.A5 Centralized `<Modal>` (6 inline modal replace)** | a11y+UX tutarlılığı | S | Low |
| 7 | **F.D1 Touch targets ≥ 44×44 (.icon-btn global)** | Mobile a11y (WCAG 2.5.5) | S | Low |
| 8 | **F.B4 Screenshot blob URL + LRU cache** | Perf: RAM -80% | M | Low |
| 9 | **F.C3 Optimistic updates (rules/settings/refresh/VPS edit)** — yeni pattern, admin tier change örnek değil | UX: sub-100ms | M | Med |
| 10 | **F.A1 aria-label to all ~20+ icon-only buttons** | a11y: SR navigation | S | Low |

---

## 2. Güvenlik / Güvenilirlik / Gözlemlenebilirlik Ekseni

> Audit Batch 2'nin kapattığı yerlerin üstüne ekler; duplicate yok.

### 2.1 Kimlik Bilgisi & Sır Yönetimi

| # | Bulgu | Yer | Risk | Öneri | Efor |
|---|---|---|---|---|---|
| S.A1 | `Vps.apiKey` plaintext DB'de | `schema.prisma:42` | **Kritik**: DB sızıntısı → tüm VPS'lerde RCE (`agent/daemon.go:585` `sh -c`) | Envelope encryption (KMS primary, libsodium sealed-box fallback) — M6 ticket; T7.3 design pattern'ı uygulanabilir | M |
| S.A2 | `User.telegramBotToken` plaintext | `schema.prisma:23` | **Yüksek**: Bot ele geçirme, özel alert'leri okuma | A1 ile aynı envelope encryption, lazy re-encrypt on next POST | M |
| S.A3 | Tek `JWT_SECRET`, dönüşüm yok | `auth.ts:12` | **Yüksek**: Sızıntı → tüm token'lar geçersiz, zorunlu logout | `JWT_SECRET_CURRENT` + `JWT_SECRET_PREVIOUS` grace (7-14 gün); `verify()` her ikisini de kabul eder | S |
| S.A4 | Refresh-token device binding yok (SHA-256 yeterli değil) | `auth.ts:49-51` | **Orta**: Cookie theft → uzun ömürlü session yenileme | `(userId, uaHash, ipPrefix24)` bind; `familyId` for theft detection; A3 ile `replacedById` chain (audit §2.4) | M |
| S.A5 | `REFRESH_TOKEN_SECRET` declared ama kod okumuyor | `.example.env:29-30`; `auth.ts:35-42` (audit §2.5) | **Orta** (drift) | S.A3 ile çöz VEYA env + dokümandan kaldır | S |

### 2.2 Auth Hardening

| # | Bulgu | Yer | Risk | Öneri | Efor |
|---|---|---|---|---|---|
| S.B1 | Cookie `__Host-` prefix yok, `path: '/'` | `auth.ts:46,77-80`; `secure: isProd ? isSecure : false` (L28) | **Yüksek**: Subdomain takeover cookie injection | `__Host-auth-token` + `__Secure-refresh-token`; `Secure: true` whenever TLS (`req.secure \|\| xfp=https`) | S |
| S.B2 | CSRF token rotasyonu yok (sadece ilk fetch cache'lenir) | `api.ts:23-24`; `auth.ts:69-83`; `csrf.ts:14-19` | **Orta**: 24h XSS → 24h CSRF | Yüksek-değerli aksiyonlarda (`change-password`, `logout-all`, telegram config) per-action rotate; `tokenVersion` bump CSRF cookie'yi de silmeli | M |
| S.B3 | Login timing-side-channel (banned user hızlı 403) | `auth.ts:138-140` (T6.5 dummy bcrypt on missing user; status !== APPROVED branch'te bcrypt atlanıyor) | **Düşük**: "Bu email kayıtlı mı" bilgisi sızdırır | Status check'i bcrypt sonrasına taşı; her zaman dummy bcrypt | S |
| S.B4 | WS auth via cookie without CSRF ticket | `socket.ts:60-95`; `csrf.ts` (HTTP-only) | **Düşük**: Sub-domain abuse | `GET /api/ws-ticket` ile kısa-ömürlü bilet, `Sec-WebSocket-Protocol` echo | M |
| S.B5 | `apiLimiter` per-IP only (NAT arkasında 60-rpm paylaşımı) | `rateLimit.ts:82-86` (L13-15 defaultKeyGenerator) | **Yüksek**: Corp-NAT + IP rotation bypass | `api:${req.user?.id \|\| ip}:${path}` kompozit key; write path'lerde per-user limit | S |

### 2.3 Input Validation

| # | Bulgu | Yer | Risk | Öneri | Efor |
|---|---|---|---|---|---|
| S.C1 | `safeFilePathSchema` symlink çözmüyor (regex + `path.posix.normalize` yeterli değil) | `validation.ts:116-129`; agent `daemon.go:656,684,874` (`os.ReadFile`/`WriteFile`/`Remove`) | **Yüksek**: `/home/user/link → /etc/shadow` okuma, `/etc/cron.d/evil` yazma | Server: `.` ile başlayan dosya reject + null byte + min 2 char; agent: `os.Lstat` symlink reject VEYA `filepath.EvalSymlinks` + root prefix check | S |
| S.C2 | `customOsName` whitelist yok (herhangi string) | `vps.ts:151-161` | **Düşük** (fonksiyonel) | `ALLOWED_CUSTOM_OS = ['FreeBSD','OpenBSD','Alpine','macOS','Solaris']` | S |
| S.C3 | `ipAddress` IPv6 yok, format validation yok | `validation.ts:155,164`; `grpcServer.ts:100-111` | **Orta**: Garbage IP persist; alerting yanlış hedefe gider | `z.string().ip({ version: 'v4' })` VEYA v4+v6; UI placeholder güncelle | S |
| S.C4 | `bulk/refresh` & `bulk/command` `.max()` yok (DOS vektörü) | `validation.ts:174,179`; `vps.ts:266-282,377-395` | **Yüksek**: 50k UUID tek istek → connection pool exhaustion, 50k `sh -c` | `.max(50)` + `bulkLimiter 1m/5` + per-user concurrent semaphore | S |
| S.C5 | Custom script `sh -c req.Command` raw (audit C6 ile aynı) | `agent/daemon.go:583-586`; `alerting.ts:357-369` | **Yüksek**: Kural oluşturabilen herkes VPS'te RCE | `ALLOWED_SCRIPT_BINARIES` env allowlist (e.g. `["docker","systemctl","curl"]`); `shell-quote` ile escape; `ALLOW_CUSTOM_SCRIPTS=false` default | S |
| S.C6 | `sanitizeObject` over-escape (`condition` skip, diğerleri HTML escape) | `validation.ts:5-12,25-30,41` | **Düşük** (UX): `Smith & Co` → `Smith &amp; Co` | Render-time `escapeHtml` helper; request body mutate etme | S |
| S.C7 | `schemas.approveUser` / `updateUserRole` declared ama unused | `validation.ts:237-244` (audit §2.1) | **Düşük** (drift) | `admin.ts:21-43,46-57`'e `validate()` ekle | S |

### 2.4 Rate Limiting & gRPC

| # | Bulgu | Yer | Risk | Öneri | Efor |
|---|---|---|---|---|---|
| S.D1 | gRPC rate limit yok; agent telemetri frame'leri sınırsız | `grpcServer.ts:51-253`; `StreamTelemetry` (L52-80) | **Orta**: Sızan apiKey → OOM (Redis pub/sub doldurur) | Per-`authenticatedVpsId` token bucket: 10/s telemetry, 1/s screenshot, 1/2s heartbeat | S |
| S.D2 | Plaintext gRPC: `createInsecure()` + `RequireTransportSecurity()=false` | `grpcServer.ts:259`; `daemon.go:182-185,120-122` | **Kritik**: MITM → apiKey capture → RCE (M4 manuel) | (a) gRPC server'ı `127.0.0.1`'e bind, Traefik TLS terminate; (b) agent `RequireTransportSecurity()=true` + `tls.Config{ServerName}`; (c) `GRPC_TLS_CERT` yoksa prod'da fail-fast | S-M |
| S.D3 | gRPC stream backpressure: Redis publish await yok | `grpcServer.ts:60-72` (`call.on('data', request => { redisPublisher.publish(...) })`) | **Orta**: Redis stall → memory pressure → agent stream error → reconnect storm | Bounded `chan *pb.TelemetryRequest` ile sample-and-drop; await publish (queue bounded) | M |
| S.D4 | Per-VPS apiKey DB lookup her telemetry frame'inde | `grpcServer.ts:40` (StreamTelemetry L58-72, Heartbeat L99-156) | **Orta**: PRO 50 VPS × 1/s = 1500 lookup/min → Prisma pool saturated | 2-tier cache: in-process LRU + Redis `vps:apikey:<hash>` (60s TTL); `settingsCache` pattern'ı (`grpcServer.ts:24`) | S |
| S.D5 | `vps_latest_screenshots` HSET TTL yok | `grpcServer.ts:90` | **Düşük** (DoS) | `EX 60` ekle VEYA `vps:screenshot:<vpsId>` namespace | XS |

### 2.5 Logging, Audit, Observability

| # | Bulgu | Yer | Risk | Öneri | Efor |
|---|---|---|---|---|---|
| S.F1 | Audit log tamper-evident değil | `middlewares/audit.ts:11-23`; `prisma.auditLog.create` | **Orta**: DB-write access ile row delete/update tespit edilemez | `prevHash` + `hash` (SHA-256 of `prevHash + canonicalize(row)`) kolonları; periodic verifier cron | S-M |
| S.F2 | PII (`target` field'da file path, IP, command) 90 gün tutuluyor | `audit.ts:17,25`; `vps.ts:245,388,439,454,474,489` | **Düşük** (GDPR/CCPA) | `details` 200 char truncate; `(?i)password\|token\|secret` redact; GDPR Art. 17 "legitimate interest" dokümante | S |
| S.F3 | Cross-tier reqId korelasyonu yok (server reqId → gRPC → agent) | `index.ts:56-60`; gRPC metadata boş; agent log'unda reqId yok | **Yüksek**: Agent hatası → hangi HTTP request'ten geldi bulunamıyor | (a) **OpenTelemetry SDK** (server+agent, OTLP → Tempo) — L; (b) **gRPC metadata `x-req-id`** (server inject, agent log) — S; (c) wrap `stream.write` ile UUID inject | S-L |
| S.F4 | `pino` stdout-only; shipper yok | `logger.ts` (import `index.ts:24`); `.example.env:40` `LOG_LEVEL=info` | **Orta**: Disk full → log kayıp; host crash → log kayıp | `pino-pretty` dev / `pino/file` prod → Vector/Promtail sidecar → Loki | M |
| S.F5 | Sentry SDK hook hazır ama DSN yok (M7 blokaj) | `proje.md M7`; audit | **Orta** (M-bağımlı) | SDK init `index.ts` ve `client/src/app/layout.tsx` + `instrumentation.ts`; M7 sağlanınca aktif | M |

### 2.6 Backup & DR

| # | Bulgu | Yer | Risk | Öneri | Efor |
|---|---|---|---|---|---|
| S.G1 | Backup var, off-site yok, restore drill yok, PITR yok | `server/scripts/backup.sh:1-84`; M10 task | **Yüksek**: Single-host failure = total loss | (a) `rclone` ile S3/B2; (b) WAL-G veya `pg_basebackup` PITR (WAL archive); (c) `restore_test.sh` cron ile 2×/yıl drill | M |
| S.G2 | `backup.sh` cron'a wire değil (comment-only) | `backup.sh:3`; compose'da service yok | **Düşük** | `docker-compose.yml`'a `backup` service ekle VEYA host crontab dokümante | S |

### 2.7 Reliability Patterns

| # | Bulgu | Yer | Risk | Öneri | Efor |
|---|---|---|---|---|---|
| S.H1 | `process.on('SIGTERM')` YOK | `index.ts:1-124` (0 matches) | **Yüksek**: Coolify/K8s SIGTERM → in-flight `bulk/command`, gRPC stream, WS connection severed; `pendingRequests` Map leak (30s) | `server.close()` + `grpcServer.tryShutdown()` + `prisma.$disconnect()` + `redisPublisher.quit()`; 30s grace force-exit | S |
| S.H2 | gRPC client circuit breaker yok (server → agent) | `agentDispatcher.ts:92-103,105-137`; `pendingRequests` Map unbounded | **Orta**: Flapping agent → request queue büyür; attacker 60×/min + 30s timeout ile DoS | Per-VPS semaphore (max 5 in-flight + 10 queue); N consecutive timeout → "circuit-open" 60s, 503 immediate | M |
| S.H3 | Socket.io single-instance (Redis adapter yok) | `socket.ts:51-58` (audit §8) | **Orta**: Multi-instance deploy'da `vps_event` / `notification` bir node'da kalıyor | `import { createAdapter } from '@socket.io/redis-adapter'`; `io.adapter(createAdapter(redisPub, redisSub))` | S |
| S.H4 | Redis tek instance (Sentinel/Cluster yok) | `docker-compose.yml:22-35`; `redis:7-alpine` | **Düşük** | AOF + `appendfsync everysec`; ileride Sentinel 3-node | S |
| S.H5 | Agent reconnect storm (jitter eksik) | `daemon.go:238-275,314-404,406-428,451-521` (4 loop, exp backoff var, jitter yok) | **Düşük**: Server restart → tüm agent'lar 1-2s içinde reconnect | Backoff'a 1-30s random jitter ekle | XS |

### 2.8 Dependency Hygiene

| # | Bulgu | Yer | Risk | Öneri | Efor |
|---|---|---|---|---|---|
| S.I1 | `^x.y.z` permissive versions; `npm audit` yok | `server/package.json:23-44`; `client/package.json:14-33` (audit §3.7 + research) | **Yüksek** (CVE gate yok) | Prod = `~x.y.z`; CI'da `npm ci` (not install) + `npm audit --audit-level=high` | S |
| S.I2 | `protoc` version pin yok | `agent/Makefile:25`; `protoc/` dizini | **Düşük** (drift) | `PROTOC_VERSION ?= 25.1` + CI'da `protoc --version \| grep` | XS |
| S.I3 | `typescript: ^6.0.3` (pre-release) | `server/package.json:44` | **Orta** (build break) | `~5.6.0` pin | XS |
| S.I4 | `govulncheck` CI'da yok | agent build | **Orta** | `go vet` job'ına `govulncheck ./...` ekle | S |

### 2.9 Compliance (Bilgilendirme)

| # | Bulgu | Yer | Risk | Öneri | Efor |
|---|---|---|---|---|---|
| S.J1 | User silme AuditLog'u cascade siliyor | `schema.prisma:86` `onDelete: Cascade` | **Orta** (SOC2/ISO27001 audit retention) | `onDelete: Restrict` + `User.deletedAt` soft-delete + 30d hard-delete job | M |
| S.J2 | IP adresi PII olarak audit'te 90 gün | `schema.prisma:38`; `audit.ts:17` | **Düşük** (GDPR Recital 30) | Audit'te son oktet mask (`192.168.1.xxx`); privacy policy dokümante | S |
| S.J3 | Data residency kontrolü yok | `.example.env:8-14` tek `DATABASE_URL` | **Düşük** | Çoklu bölgeye geçişte `data_region` field | XS |

### 2.10 Security — Top 10 Öncelikli Kazanç

| Sıra | Başlık | Risk | Etki | Efor |
|---|---|---|---|---|
| 1 | **S.A1** Envelope-encrypt `Vps.apiKey` (KMS / libsodium) | Kritik | DB leak → RCE | M |
| 2 | **S.D2** gRPC TLS — insecure bind yok, `RequireTransportSecurity=true` | Kritik | MITM → RCE | S-M |
| 3 | **S.C5** Custom script allowlist + shell-quote | Yüksek | RCE on any VPS | S |
| 4 | **S.A3** JWT dual-secret rotation grace | Yüksek | Tek dönüşüm = full outage | S |
| 5 | **S.B1** `__Host-` / `__Secure-` cookie prefix + force Secure on TLS | Yüksek | Subdomain cookie injection | S |
| 6 | **S.C4** `bulk/refresh` & `bulk/command` `.max(50)` + per-user quota | Yüksek | DoS via 50k UUID body | S |
| 7 | **S.H1** SIGTERM handler (`server.close` + `grpc tryShutdown`) | Yüksek | Mid-flight loss on deploy | S |
| 8 | **S.G1** Off-site backup + PITR + restore drill | Yüksek | Total data loss | M |
| 9 | **S.C1** Symlink resolution in `safeFilePathSchema` (server + agent Lstat) | Yüksek | /etc/shadow read, cron write | S |
| 10 | **S.F3** Cross-tier reqId (gRPC `x-req-id` metadata) | Orta | Untraceable agent errors | S |

---

## 3. Operasyonlar, Ölçekleme & Ürün Ekseni

### 3.1 Deployment & CI/CD

| # | Bulgu | Yer | Öneri | Efor |
|---|---|---|---|---|
| O.A1 | `.github/workflows/` dosyası YOK (audit P0-#1) | `.github/CODEOWNERS` only | `ci.yml` (PR gate: typecheck/test/build, matrix Node 22, postgres+redis service containers), `release.yml` (`goreleaser/goreleaser-action@v6` v\* tag), `deploy.yml` (Coolify webhook) | M |
| O.A2 | Dockerfiles: distroless değil, multi-stage yok, healthcheck yok | `server/Dockerfile:1-23`; `client/Dockerfile:1-30`; `node:22-alpine` runtime | distroless `nodejs22-debian12` veya `npm prune --omit=dev`; `HEALTHCHECK` ile `/health/ready`; `.dockerignore` (`node_modules`, `.next`, `coverage`, `.env*`) | S |
| O.A3 | Prisma migration step CI'da yok | `server/Dockerfile:23` `npx prisma migrate deploy`; 8 migration | `prisma migrate diff` CI step + pre-deploy backup (pgdump → `pgbackups` volume) | S |
| O.A4 | `agent/bin/` `.gitignore` (verify) | `agent/Makefile:67` | `agent/bin/`, `agent/cover.out`, `agent/dist/` | XS |

### 3.2 Observability & SLOs

| # | Bulgu | Yer | Öneri | Efor |
|---|---|---|---|---|
| O.B1 | Metric var, SLO tanımı yok | `server/src/metrics-prom.ts:6-40` (`http_requests_total`, `grpc_calls_total`, `telemetry_frames_total`, `alert_firings_total`); `/metrics` (`index.ts:90`); `/health/ready` (`index.ts:106-114`) | SLO tablosu: HTTP 99.9% / gRPC Heartbeat 99.5% / Telemetry lag P95 < 5s / WS reconnect < 0.1/h / Metric write > 99%; `prometheus/rules/slo.yml` recording rules (burn_rate) | M |
| O.B2 | Sentry SDK hazır, DSN yok (M7) | `proje.md M7` | Server: `Sentry.init({ tracesSampleRate: 0.1 })` `index.ts`; Client: `@sentry/nextjs` `layout.tsx` + `instrumentation.ts`; M7 sağlanınca aktif | M |
| O.B3 | Distributed tracing yok (request→gRPC→agent) | bütün stack | `@opentelemetry/sdk-node` (server) + `@grpc/grpc-js` + `ioredis` + `pino` + Prisma (preview) instrumentation; OTLP → Tempo/Jaeger | L |
| O.B4 | Pino stdout-only | `logger.ts`; `index.ts:24,58` | Dev: `pino-pretty`; Prod: `pino/file` destination + Vector/Fluent-Bit sidecar → Loki | M |
| O.B5 | Grafana dashboard JSON committed değil | n/a | `dashboards/vps-manager.json` (provisioned) — VPS list, alert firings, gRPC errors, WS connections, latency P95 | S |

### 3.3 Database Operations

| # | Bulgu | Yer | Öneri | Efor |
|---|---|---|---|---|
| O.C1 | Postgres default config | `docker-compose.yml:5` `postgres:15-alpine` | `shared_buffers` 25% RAM, `work_mem` 64MB, `effective_cache_size` 75%, `maintenance_work_mem` 512MB, `random_page_cost` 1.1, `max_connections` 200, `log_min_duration_statement` 250ms | S |
| O.C2 | Prisma pool & prune | `server/src/prisma.ts:1-3` singleton, `.example.env:14` `connection_limit=20`; `metrics.ts:84-86` `pruneOldMetrics` no-tx; `authMiddleware.ts:31-34` her request DB hit | `transaction_max_wait=5s`; read-only path'lerde `$extends` ile replica route; `pool_timeout=10` env; hourly prune'i tx + batch limit | M |
| O.C3 | `HistoricalMetric` linear prune | 50 VPS × 4/min × 1440 = 288k satır/gün; `metrics.ts:67-81` hourly `deleteMany` | Postgres native range partitioning by day; drop whole partition nightly (migration: `LIKE` + `PARTITION BY RANGE (timestamp)`) | L |
| O.C4 | `AuditLog.action` index eksik | `schema.prisma:82,89` | `@@index([action, createdAt(sort: Desc)])` migration (CSV export için) | S |
| O.C5 | Backup retention + restore drill (M10) | `proje.md M10`; `server/scripts/backup.README.md` | 30 daily + 12 monthly Postgres; haftalık `restore_test.sh`; RTO ≤ 30m, RPO ≤ 24h; off-site `rclone` B2/S3 | M |
| O.C6 | `VpsState.MAINTENANCE` dead value (audit P2-#13) | `schema.prisma:117`; `client/src/app/page.tsx:57-61` | Aşağıda O.H7 ile productize | S |

### 3.4 Caching

| # | Bulgu | Yer | Öneri | Efor |
|---|---|---|---|---|
| O.D1 | `GET /api/vps` 50× HGET (`vps.ts:90-95`) | `redisCache.hget('vps_latest_screenshots', vps.id)` per item | `hmget('vps_latest_screenshots', ...vpsIds)` 1 RTT | S |
| O.D2 | `RefreshAck` outcome cache | `vps.ts:253-263`; `client/src/components/vps/RefreshButton.tsx` | `refresh_ack:<vpsId>` Redis 60s TTL; UI poll edebilir, gRPC stream thrash etmez | S |
| O.D3 | `vpsList` server-side cache (assembled response) | `vps_latest_screenshots` HASH hot key | 2s write-through Redis cache (real-time trade-off) | M |
| O.D4 | `rule_state` keys leak on rule delete | `alerting.ts:271,282-303`; `rules.ts:117-137` | TTL 24h VEYA `DELETE /api/rules/:id` ile `del rule_state:<ruleId>:*` | XS |
| O.D5 | Multi-node alerting duplicate risk | `alerting.ts:66-74` `setInterval(refreshRules, 30000)`; multi-node her biri ayrı array tutar | E1 (redis-adapter) + Redis-backed rule state semaphore VEYA telemetry sticky routing | M |
| O.D6 | Cache not yet present: `/api/admin/users`, `/api/rules`, FREE/PRO limits | `admin.ts:10-19`; `rules.ts:23-34`; `vps.ts:127-141` (hardcoded) | 10s/30s Redis cache; tier limits'i env/config'e taşı | S |

### 3.5 Horizontal Scaling

| # | Bulgu | Yer | Öneri | Efor |
|---|---|---|---|---|
| O.E1 | Socket.io Redis adapter YOK (multi-node prerequisite) | `socket.ts:51-58`; `io.to('vps_list').emit(...)` (L197,200) | `@socket.io/redis-adapter` `io.adapter(createAdapter(redisPub, redisSub))`; dedicated channel prefix (existing `psubscribe` patterns L181 ile çakışmaz) | M |
| O.E2 | WS sticky sessions | Traefik/Nginx config | Traefik `sticky.cookie.name: auth-token` VEYA Nginx `ip_hash`; `docs/OPERATIONS.md`'da belgelendir | M |
| O.E3 | Server stateless (cookie + Redis + Postgres) | `auth.ts:46,63`; `rateLimit.ts:36-40`; `schema.prisma:157-168` | HPA ready (E1 sonrası) | S |
| O.E4 | Read replica strategy | Read-heavy: `vps.ts:53-100,359-374`; `audit.ts:9-60` | `DATABASE_REPLICA_URL` + `prisma.$extends` ile findMany/count → replica, write → primary | M |
| O.E5 | Agent single-VPS-per-process (uzatılabilir mi?) | `agent/config.go:23`; `daemon.go:248`; `validateVpsId` L99-110 | Şu an yeterli, product demand olursa refactor | XS (dokümantasyon) |

### 3.6 Multi-tenant Isolation

| # | Bulgu | Yer | Öneri | Efor |
|---|---|---|---|---|
| O.F1 | VPS reassignment endpoint yok | `schema.prisma:48`; sadece direct SQL `UPDATE` | Admin-only `POST /api/vps/:id/transfer` { toUserId }; audit-log `VPS_TRANSFER`; `vps_event.TRANSFERRED`; agent stream etkilenmez (apiKey immutable) | M |
| O.F2 | User cascade-delete | `schema.prisma:48` `onDelete: Cascade`; admin "Delete" tüm VPS'leri siler | `User.deletedAt` soft-delete + 30d hard-delete job; `findMany/findUnique` `{ deletedAt: null }` filter | M |
| O.F3 | Admin shell access audit-logged değil | `socket.ts:140-151`; `vps.ts:23-27` admin bypass | `audit.ts`'a `action: 'SHELL_OPEN_ADMIN'` `target: vpsId` ekle | S |
| O.F4 | API key per-VPS immutable ✅ | `schema.prisma:42` `apiKey @unique @default(uuid())`; `vps.ts:86,108` strip; `vps.ts:171-186` POST only | No change | — |

### 3.7 Agent Distribution

| # | Bulgu | Yer | Öneri | Efor |
|---|---|---|---|---|
| O.G1 | `.goreleaser.yaml` YOK; Makefile'da build var ama release pipeline yok | `agent/Makefile:50-58`; (audit §3.6 + P1-#7) | `.goreleaser.yaml` skeleton: linux/windows/darwin × amd64/arm64, `goos:[linux,windows,darwin]`, `ldflags: -X main.version/commit/buildTime` (önce audit P1-#7 fix — `var (version,commit,buildTime string)` in `agent/main.go`); checksum + GitHub Release | M |
| O.G2 | Agent auto-update | n/a | Server `GET /api/agent/latest?channel=stable` (auth by `x-api-key`); agent 6h poll; SHA256 verify; kardianos restart; 2 önceki binary rollback | M |
| O.G3 | macOS service install (launchd) | `agent/main.go:12` kardianos service | GHA'da macOS runner matrix; "untested on darwin" README notu | M |
| O.G4 | `Heartbeat` proto `agent_version` field eksik | `proto/vps.proto` (HeartbeatRequest) | `string agent_version = 4` ekle; `Vps.agentVersion` field (fleet visibility) | S |
| O.G5 | Audit-confirmed dead code fixes | (audit P0-#2, P1-#5, P1-#6) | `grpcServer.ts:211-218` `register` write kaldır; `Heartbeat.IpAddresses` proto'ya ekle VEYA AGENTS.md düzelt; TUI nested `RunMonitor` → goroutine + `tea.Program.Send` VEYA menü öğesini kaldır | S |

### 3.8 Ürün Açığı (Eksik Özellikler)

| # | Bulgu | Öneri | Efor |
|---|---|---|---|
| O.H1 | `Vps.description TEXT` field yok (audit-confirmed) | `schema.prisma`'ya `description String?`; UI textarea `vps/[id]/page.tsx`; `PUT /api/vps/:id/description` | S |
| O.H2 | VPS template (clone) | `POST /api/vps/:id/clone` admin → cloned `VpsSettings` + `AlertRule[]` (vpsId repointed); UI "Clone" 3-dot menü | M |
| O.H3 | Tag / group model | `Tag { id, userId, name, color }`; `VpsTag { vpsId, tagId }` m2m; `GET /api/vps?tag=prod`; UI "Tags" alt-tab + bulk apply | M |
| O.H4 | Audit log CSV/JSON export | `GET /api/audit/export?format=csv&from=&to=` stream via `res.write()` Prisma cursor; C4 index | S |
| O.H5 | Multi-channel notifications (Email/Slack/Discord/Webhook) | `NotificationChannel { id, userId, type, config:JSON, enabled }`; refactor `sendTelegramAlert` → `sendAlert(userId, msg, channelIds[])` pluggable (Nodemailer email; webhook axios) | M |
| O.H6 | 2FA (TOTP) | `User.totpSecret String?` (encrypted, M6 KMS); `User.totpEnabled Boolean`; `POST /api/auth/2fa/{setup,verify,challenge}`; `BackupCode` table | L |
| O.H7 | Maintenance windows (justify `VpsState.MAINTENANCE`) | `POST /api/vps/:id/maintenance` admin { until }; `alerting.ts:147-227` MAINTENANCE'ta OFFLINE skip; UI toggle; `vps_event.STATUS_CHANGED` | S |
| O.H8 | Time-series anomaly detection | Z-score: per (userId, vpsId, metric) rolling 24h mean+stddev Redis HASH (`metric_stats:*`); new rule type `ANOMALY` (z > 3, sustained 10min); `AlertRule.kind` enum | M |
| O.H9 | SSO / SAML (M8) | `SSOProvider { id, userId\|orgId, type:'saml'\|'oidc', config:JSON }`; `@node-saml/passport-saml` or `openid-client`; `POST /api/auth/sso/<id>/callback`; audit every SSO login | L |
| O.H10 | PWA + Web Push | `next-pwa` plugin (`next.config.mjs` for Next 16); `manifest.json`; VAPID `POST /api/push/subscribe` → `PushSubscription` model; `web-push` npm on `alerting.ts:45-64`; background sync for offline dnd | L |
| O.H11 | Read-only role (Viewer) | `User.role: 'VIEWER'`; `requireWrite` middleware 403; UI hide action buttons, read-only settings | M |
| O.H12 | Saved views / filters | `{ statusFilter, tagFilter, searchQuery }` → `User.preferences` extend (`settings.ts:68-100`); "Saved view" CRUD | S |
| O.H13 | proje.md'deki var-olan açıklar | FREE/PRO kullanım sayacı UI; `UPTIME` metric dropdown (audit P3-#31); `RENAMED` vps_event publish (audit P2-#12); "Critical/Warning/Offline/Recovery" template API | S |

### 3.9 Pricing & Tiers

| # | Bulgu | Öneri | Efor |
|---|---|---|---|
| O.I1 | Self-serve tier upgrade (admin-only bugün) | `POST /api/billing/upgrade` → Stripe Checkout session (env `STRIPE_SECRET_KEY`); webhook `POST /api/billing/webhook` flip tier; `User.tierExpiresAt` | M |
| O.I2 | ENTERPRISE tier (200+ VPS) | `enum Tier { FREE PRO ENTERPRISE }`; `TIER_LIMITS = { FREE:2, PRO:50, ENTERPRISE:1000 }`; ENTERPRISE-only: SSO (H9), audit 365d override, custom domain CNAME, SLA support | M |
| O.I3 | Tier UI usage meter | UserMenu + dashboard "X / Y VPS used" progress bar | S |

### 3.10 Dokümantasyon

| # | Bulgu | Öneri | Efor |
|---|---|---|---|
| O.J1 | `README.md` tek satır (`# vps-manager`) | Hero, features, arch diagram, quick-start, env ref, deploy (Coolify), contributing, license/security/support | S |
| O.J2 | `docs/OPERATIONS.md` | Backup/restore drill, deploy runbook, incident playbook (DB down, Redis down, gRPC port unreachable, WS storm), capacity planning | M |
| O.J3 | `docs/SECURITY.md` | Threat model, disclosure policy, supported versions, CWE coverage (CWE-22/79/200 mitigated by file refs) | S |
| O.J4 | `docs/API.md` (auto-generated) | `@asteasolutions/zod-to-openapi` → OpenAPI spec → Redoc static HTML (mevcut Zod schema'larından) | M |
| O.J5 | `CONTRIBUTING.md` güncelle | Üstte AGENTS.md'ye pointer; required skills list | S |
| O.J6 | `docs/ARCHITECTURE.md` | Mermaid: component overview, telemetry flow, alert flow, WS room topology | S |

---

## 4. Birleşik Top-20 Öncelik Tablosu (Tüm Eksenler)

| Sıra | Eksen | Başlık | Etki | Efor | Bağımlılık |
|---|---|---|---|---|---|
| 1 | O.A1 | **GitHub Actions CI workflow** (ci.yml + release.yml + deploy.yml) | Yüksek | M | O.G1 release job |
| 2 | S.A1 | **Envelope-encrypt `Vps.apiKey`** (KMS / libsodium sealed box) | Kritik | M | M6 / T7.3 |
| 3 | S.D2 | **gRPC TLS** — insecure bind yok, `RequireTransportSecurity=true` | Kritik | S-M | M4 (Traefik) in flight |
| 4 | O.E1 | **Socket.io Redis adapter** (multi-node prerequisite) | Yüksek | M | O.D5 rule state decision |
| 5 | F.B1 | **Dashboard grid virtualization** (PRO 50 VPS) | Yüksek | M | — |
| 6 | F.F1 | **error.tsx + global-error + not-found + loading** | Yüksek | M | — |
| 7 | O.H5 | **Multi-channel notifications** (Email/Slack/Discord/Webhook) | Yüksek | M | M6 KMS optional |
| 8 | O.H6 | **2FA TOTP** | Yüksek | L | M6 KMS for totpSecret |
| 9 | O.G1 | **`.goreleaser.yaml`** + `var version/commit/buildTime` in `agent/main.go` | Yüksek | M | O.A1 (CI release job) |
| 10 | O.B1 + O.B2 | **SLOs + Sentry SDK** | Yüksek | M | M7 DSN |
| 11 | S.C5 | **Custom script allowlist + shell-quote** | Yüksek | S | — |
| 12 | S.A3 | **JWT dual-secret rotation grace** | Yüksek | S | — |
| 13 | O.H10 | **PWA + Web Push** | Yüksek | L | O.H5 channel infra |
| 14 | S.D4 | **`apiKey` 2-tier cache** (in-process LRU + Redis `vps:apikey:<sha256>` 60s TTL) — 50 qps/1000 user DB yükünü engeller | Yüksek | S | O.E1 redis-adapter ile uyumlu |
| 15 | S.B1 | **`__Host-` / `__Secure-` cookie prefix** + force Secure on TLS | Yüksek | S | — |
| 15 | O.I2 | **ENTERPRISE tier** (unlimited VPS, SSO, 365d audit) | Yüksek | M | O.H6 (2FA), O.H9 (SSO) |
| 16 | O.I1 | **Self-serve tier upgrade (Stripe)** | Yüksek | M | O.I2 (tier enum) |
| 17 | S.H1 | **SIGTERM handler** (`server.close` + `grpc tryShutdown`) | Yüksek | S | — |
| 18 | S.G1 | **Off-site backup + PITR + restore drill** | Yüksek | M | task.md M10 (open) |
| 19 | S.C1 | **Symlink resolution in `safeFilePathSchema`** (server regex + agent Lstat) | Yüksek | S | — |
| 20 | S.C4 | **`bulk/refresh` & `bulk/command` `.max(50)`** + per-user quota | Yüksek | S | — |

### Sıralama Mantığı
- **#1-#4** platform hardening (CI + secrets + transport + scale-readiness).
- **#5-#6** en çok hissedilen kullanıcı tarafı kazançlar.
- **#7-#10** revenue unlocker (multi-channel + 2FA + release pipeline + observability).
- **#11-#20** mevcut güvenlik ve operasyon açıklarını kapatma + B2B features.

### 4A. Sprint 0 — Audit Kalanları (Quick Wins, ~S effort total)

Audit Batch'lerinde (P0-#1, P0-#2, P0-#3, P0-#4, P1-#5, P1-#7) tespit edilen ama Top 20'ye girmeyen prod-etkili öğeler. Tek-çekirdek PR'larla hızlıca kapatılmalı; O.A1 (#1) P0-#1'i ve O.G1 (#9) P1-#7'yi zaten kapsıyor, geri kalan 4 ayrı quick-fix:

| # | Kaynak | Bulgu | Yer | Effort |
|---|---|---|---|---|
| QW.1 | Audit P0-#2 | Server `register` body yazıyor (proto'da yok) — Go protobuf sessizce drop eder, dead write | `grpcServer.ts:211-218` (try-call.write bloğu kaldır) | XS |
| QW.2 | Audit P0-#3 | `NEXT_PUBLIC_RUSTDESK_URL` compose build args'a eklenmemiş — prod imajı `localhost:8080` fallback | `docker-compose.yml:64-67` `args:` bloğu | XS |
| QW.3 | Audit P0-#4 | Server compose env eksikleri: `ALLOW_CUSTOM_SCRIPTS`, `LOG_LEVEL`, `NODE_ENV` | `docker-compose.yml:46-53` `environment:` bloğu | XS |
| QW.4 | Audit P1-#5 | `Heartbeat.IpAddresses` proto'da yok (AGENTS.md §4.3 F4.3 feature claim) — proto'ya `repeated string ip_addresses` ekle VEYA dokümanı düzelt | `proto/vps.proto` HeartbeatRequest | S |
| QW.5 | Audit P1-#7 | `Makefile LDFLAGS -X main.version` no-op (var yok) — `agent/main.go`'ya `var (version="dev"; commit="unknown"; buildTime="unknown")` + `--version` flag | `agent/main.go` + `Makefile:29` | S |

Bu 5 madde tek sprint içinde tek-tek PR olarak kapatılabilir; prod etkisi yüksek, efor S/XS.

### M-Bağımlı (Bloke Olan) Maddeler
Aşağıdaki iyileştirmeler, kullanıcı tarafından M6/M7/M8/M10 aksiyonları tamamlanmadan uygulanamaz:

| Madde | Eksen | M-Blokaj |
|---|---|---|
| S.A1 Vps.apiKey envelope encryption | Security | **M6** (KMS vs libsodium kararı) |
| S.A2 telegramBotToken envelope encryption | Security | **M6** |
| S.A3 JWT dual-secret + S.B1 __Host- | Security | (opsiyonel) M6 |
| O.B2 Sentry SDK | Ops | **M7** (Sentry DSN) |
| O.H6 2FA TOTP | Product | **M6** (KMS for totpSecret) |
| O.H9 SSO/SAML | Product | **M8** (OAuth credentials) |
| S.G1 Off-site backup | Ops/DR | **M10** (CI secrets + runbook) |
| O.A1 deploy.yml Coolify webhook | Ops | **M4** (Traefik reverse proxy + TLS) |

---

## 5. Üç Aylık Yol Haritası Önerisi

### Q3 2026 — Platform Hardening (Sıra #1-#20)
- Sprint 1-2: O.A1 (CI), S.A1 (apiKey), S.D2 (gRPC TLS), O.E1 (redis-adapter), S.C5 (script allowlist), S.A3 (JWT rotation)
- Sprint 3-4: F.B1 (virtualization), F.F1 (error pages), O.H5 (multi-channel), O.H6 (2FA), O.G1 (goreleaser)
- Sprint 5-6: O.B1+B2 (SLO+Sentry), S.H1 (SIGTERM), S.G1 (backup+DR), S.C1 (symlink), S.C4 (bulk cap)

### Q4 2026 — B2B Features & Scale
- O.I1+I2 (Stripe + ENTERPRISE tier)
- O.H10 (PWA + Web Push)
- O.E4 (read replicas)
- O.C3 (HistoricalMetric partitioning)
- O.H8 (anomaly detection)

### Q1 2027 — Polish & B2B+SSO
- O.H9 (SSO/SAML)
- O.H2+H3 (clone + tags)
- O.B3 (OpenTelemetry)
- E2E + visual regression (F.G1, F.G2)
- O.J1-J6 (docs pass)

---

## 6. Kapsam ve Metodoloji

**3 paralel `explore` ajanı** (frontend/UX, security/reliability, ops/scaling) ile ~17 dakikalık read-only araştırma. Toplam ~80 bulgu, hepsi `file:line` kanıtlı.

**İncelenen dosyalar:**
- **Client (32 dosya)**: tüm `app/**`, `components/**`, `lib/**`
- **Server (30+ dosya)**: `src/index.ts`, `src/{redis,logger,prisma,metrics,metrics-prom,alerting,grpcServer,socket,agentDispatcher,agentCommands}.ts`, tüm `routes/**`, `middlewares/**`, `prisma/schema.prisma`
- **Agent (10 dosya)**: `main.go`, `daemon.go`, `config.go`, `Makefile`, `telemetry/**`, `tui/**`, `pb/vps.pb.go` (oneof cases only)
- **Repo root**: `proje.md`, `AGENTS.md`, `task.md`, `docker-compose.yml`, `.example.env`, `proto/vps.proto`, `.github/CODEOWNERS`

**Atlanan:** `*/node_modules`, `*/dist`, `*/coverage`, `*/.next`, `agent/pb/vps_grpc.pb.go` (generated, full)

**Güven seviyeleri (üç eksen için):**
- **Yüksek**: file:line kanıt + cross-reference doğrulandı.
- **Orta**: file:line var ama davranış/runtime test edilmedi (örn. Lighthouse tahminleri, WS cross-site browser behavior).
- **Düşük**: dosya varlık tespiti (örn. `.gitignore` check, jurisdiction-specific hukuki risk).

**Hiçbir kod, dosya veya git state değiştirilmedi** (talep gereği read-only). Audit (`docs/AUDIT_UNUSED_AND_DRIFT.md`) ile birlikte okunmalı — buradaki öneriler onun üzerine inşa edildi, duplicate yok.
