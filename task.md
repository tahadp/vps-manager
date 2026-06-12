# Görev Takip (Task Tracker) - VPS Yönetim Paneli

*(Bu dosya `implementation_plan.md` dokümanındaki fazlara dayanarak projeyi adım adım kodlamak için oluşturulmuştur.)*

- `[ ]` Bekleyen görev
- `[/]` Devam eden görev
- `[x]` Tamamlanmış görev

## Faz 1: Altyapı ve Konfigürasyon
- [x] Kök dizinde `.gitignore` ve `.example.env` dosyalarının hazırlanması.
- [x] `/client` dizininde Next.js projesinin başlatılması (TailwindCSS, vb. kurulumları).
- [x] `/server` dizininde Node.js + TypeScript iskeletinin kurulması.
- [x] `/agent` dizininde Go projesinin (`go mod init agent`) başlatılması.
- [x] Yerel geliştirme için `docker-compose.yml` (Postgres, Redis) yazılması.

## Faz 2: Veritabanı ve İletişim (gRPC & ORM)
- [x] `proto/vps.proto` dosyasında iletişim protokollerinin (Heartbeat, Telemetry, Shell) tanımlanması.
- [x] `/server` için ORM kurulumu ve şemaların (User, VPS, AuditLog) yazılması.
- [x] Go ajanında ve Node.js sunucusunda gRPC endpointlerinin ayağa kaldırılması (İskelet kuruldu).
- [x] Server'da Redis Pub/Sub ve önbellek kurgusunun oluşturulması.

## Faz 3: Temel İşlevler ve Arayüz
- [x] Admin giriş/kayıt sistemi ve whitelist onayı (Next.js & Server).
- [x] Go ajanının CPU, RAM, Network (Tx/Rx) verilerini okuyup gRPC üzerinden aktarması.
- [x] Next.js arayüzünde canlı metriklerin WebSockets üzerinden gösterilmesi.
- [x] VPS sunucularının listelendiği ana dashboard'un tasarlanması.

## Faz 4: Etkileşim ve Alarmlar (İleri Seviye)
- [x] xterm.js ile Web PTY entegrasyonunun kodlanması (Go PTY -> gRPC -> Server -> WebSocket -> Client).
- [x] Monaco Editor entegre edilerek Uzak Dosya Yöneticisi arayüzünün yapılması.
- [x] Ekran görüntüsü alma işlevinin (Go) yazılması ve arayüzde lazy-loading kurgusuyla gösterilmesi.
- [x] Alerting Engine (Kural Motoru) geliştirilmesi.
- [x] Telegram Bot bildirimlerinin entegre edilmesi (VPS online/offline, Alerting durumları).
- [x] Toplu veya tekil VPS işlemlerinin (Restart/Stop/Start) arayüze bağlanması ve manuel health check "Güncelle" butonu.
- [x] Rustdesk ve Rustdesk Web projeye dahil edilerek görsel uzak kontrol arayüzünün oluşturulması.
## Doğrulama (Verification)
- [x] Tüm iletişim (Agent <-> Server <-> Client) gecikme testleri.
- [x] Test VPS üzerinde manuel xterm.js ve metrik akışı denetimi.
