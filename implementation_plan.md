# Uygulama Planı: VPS Yönetim Paneli - Ana Geliştirme

## 1. Amaç (Goal Description)
Bu plan, verilen detaylı yönergeler doğrultusunda Linux ve Windows VPS'leri tek bir web panelinden yönetecek; Go (Ajan), Node.js (Sunucu) ve Next.js (Web İstemci) yığınını kullanan sistemin uçtan uca mimari kurgusunu ve geliştirme aşamalarını (fazları) tanımlamaktadır. Amaç, düşük gecikmeli, modüler, gerçek zamanlı (Redis+gRPC) ve genişletilebilir (oyun farmlama vb. eklentilere uygun) bir altyapı oturtmaktır.

## 2. Kullanıcı Onayı Gerekenler (User Review Required)
> [!IMPORTANT]
> Projenin boyutu ve bileşen sayısı çok büyük olduğu için, geliştirmenin faz faz (adım adım) ilerlemesi gerekmektedir. İlk fazda yalnızca kök altyapının (klasörleme, Docker kurgusu, iletişim protokollerinin iskeleti) kurulması planlanmaktadır. Tüm fazları tek seferde inşa etmeye çalışmak `spagetti kod` ve karmaşaya yol açar. Lütfen bu planı ve fazlandırmayı inceleyip, ilk aşama olan **Faz 1** ile başlamayı onaylayın.

## 3. Açık Sorular (Open Questions)
> [!WARNING]
> - Frontend tarafında minimal ve modern tasarım için UI kütüphanesi olarak **TailwindCSS + shadcn/ui** kullanımı sizin için uygun mudur?
> - İlk aşamada Rustdesk entegrasyonu yerine kendi sistemimiz olan **xterm.js tabanlı Web PTY (Terminal)** işlevine öncelik vermemiz mantıklı olur mu?
> - Hızlı metrik güncellemeleri için Next.js tarafında WebSockets mi yoksa gRPC-Web mi tercih edilmelidir? (Ekosistem kolaylığı açısından Socket.io / Native WebSockets önerilir)

## 4. Önerilen Değişiklikler (Proposed Changes)

Mevcut boş repoda aşağıdaki modüler altyapı inşa edilecektir.

### Faz 1: Altyapı ve Konfigürasyon (Infrastructure & Scaffolding)
- Kök dizinde katı kurallı `.gitignore`, `.example.env` ve `.env` (lokal) oluşturulması.
- [NEW] `/client`: Next.js 14+ (App Router) iskeletinin oluşturulması.
- [NEW] `/server`: Node.js, Express/Fastify ve TypeScript backend iskeletinin kurulması.
- [NEW] `/agent`: Go modülünün (`go mod init`) başlatılması.
- [NEW] `docker-compose.yml`: Redis, PostgreSQL ve Server servisleri için yerel geliştirme ortamının kurgulanması.

### Faz 2: Veritabanı ve gRPC İletişimi (Core Backend)
- **PostgreSQL**: ORM (Örn: Drizzle veya Prisma) ile `User`, `VPS`, `AuditLog` şemalarının oluşturulması.
- **Redis**: Telemetri ve Kural Motoru (Alerting Engine) için Hash/Stream/PubSub veri yapılarının kurgulanması.
- **gRPC**: `proto/vps.proto` dosyasının yazılıp Agent ve Server tarafında protoc ile derlenmesi (Heartbeat, Telemetry stream, Shell stream).

### Faz 3: İstemci ve Ajan Temel Özellikleri (Core Features)
- **Agent (Go)**: Hedef sunucuda CPU, RAM, Network (saniyelik Upload/Download) verilerini okuyup gRPC ile Server'a akıtacak döngünün yazılması.
- **Server (Node.js)**: Ajan'dan gelen verileri anlık olarak Redis'e yazma, Client tarafına WebSocket ile broadcast etme.
- **Client (Next.js)**: Karanlık/aydınlık mod destekli, login (Admin onayı dahil) mekanizması ve VPS listesini canlı grafiklerle gösteren ana panelin kodlanması.

### Faz 4: Gelişmiş Özellikler (Advanced Features)
- **Web PTY**: Go ajanında sanal PTY açılması ve xterm.js ile web üzerinden SSH gerektirmeyen tam terminal bağlantısı.
- **Dosya Yöneticisi**: Monaco Editor (VSCode Web) entegrasyonu ile panelden uzak sunucu (.env vb.) düzenleme/kaydetme işlevleri.
- **Alerting Engine**: Redis verilerini dinleyen, eşikler aşıldığında (Disk %95 vb.) Telegram bot üzerinden bildirim gönderen kural motorunun kodlanması.
- **Ekran Görüntüleri**: Go ajanının periyodik screenshot alıp sıkıştırması, Next.js'de lazy-loading ve anlık yenileme kurgusu.

## 5. Doğrulama Planı (Verification Plan)
- **Otomatik Testler**: `/tests` altında gRPC mesajlaşma testleri ve Redis stream okuma/yazma hız (latency) ölçümleri.
- **Manuel Doğrulama**: 
  1. Geliştirme ortamında Go Ajanının çalıştırılıp Next.js panelinde saniyelik CPU/RAM grafiğinin `<50ms` gecikmeyle aktığı görülecek.
  2. Web terminalinde `htop` komutu çalıştırılıp xterm.js ekranında bozulma olmadan gösterildiği doğrulanacak.
