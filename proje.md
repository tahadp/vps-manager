# VPS Yönetim Paneli - Proje Dokümantasyonu

## 1. Proje Özeti
Bu proje, birden fazla kullanıcının Windows ve Linux tabanlı VPS (Sanal Özel Sunucu) örneklerini tek bir merkezi web paneli üzerinden yönetmesini sağlayan modern, düşük gecikmeli ve modüler bir sistemdir. Kullanıcılar sunucularının anlık kaynak tüketimini görebilir, terminal erişimi sağlayabilir, dosya düzenleyebilir ve kural tabanlı alarmlar kurabilirler. Sistem, oyun farmlama gibi yoğun işlemler için genişletilebilir bir altyapıya sahip olacak şekilde optimize edilmiştir.

## 2. Teknoloji Yığını
- **İstemci Ajanı (Agent):** Go (Golang) - Hedef VPS'lerde çalışacak, sshe gerek duymadan işlemleri yürütecek, düşük kaynak tüketen servis.
- **Sunucu (Backend):** Node.js (TypeScript) - Merkezi API, gRPC köprüsü ve iş mantığı.
- **Web Paneli (Frontend / Client):** Next.js - Minimal, çok hızlı, karanlık/aydınlık mod destekli ve mobil uyumlu kullanıcı arayüzü.
- **Veritabanı (Kalıcı Veri):** PostgreSQL - Kullanıcılar, yetkiler, audit (denetim) logları ve sistem ayarları. Coolify üzerinden deploy edilecektir.
- **Önbellek & Anlık Veri (In-Memory):** Redis - Anlık telemetri (CPU, RAM, Ağ grafikleri), kural motoru (alerting engine) geçici durumları ve ekran görüntüsü önbelleği.
- **İletişim Protokolleri:** 
  - Agent - Backend arası: **gRPC** (Çift yönlü hızlı veri ve komut akışı)
  - Backend - Frontend arası: **WebSockets** veya gRPC-Web (Anlık metrik ve terminal akışı)
- **Altyapı ve Dağıtım:** Docker. Dağıtım işlemleri (Git push sonrası) **Coolify** ile otomatik yönetilecektir. Uygulama paneline `vps.tahatoprak.me` üzerinden erişilecektir.

## 3. Mimari Yapı ve Modülerlik
Proje kök dizininde her servisin ayrılmış bir modülü (klasörü) bulunacaktır:
- `/server`: Node.js (TypeScript) tabanlı backend API ve gRPC sunucusu.
- `/client`: Next.js tabanlı web paneli.
- `/agent`: Go tabanlı hedef VPS istemcisi.
- `/tests`: Sistem genelindeki test dosyaları (Unit, Integration, E2E).
- `/docs`: Proje dokümantasyonu.

## 4. Temel Özellikler

### 4.1. Kullanıcı Yönetimi ve Yetkilendirme
- **Ana Admin & Whitelist:** Sisteme kayıt olan kullanıcılar, ana yöneticinin (Admin) onayından (whitelist) geçtikten sonra aktif olur. Admin bu özelliği istediği zaman devre dışı bırakabilir. Kullanıcı ekleme/çıkarma işlemleri admin yetkisindedir.
- **Kullanıcı Katmanları (Tiers):** İleride entegre edilmek üzere Free, Pro vb. tier altyapısı düşünülerek tasarlanacaktır (ilk aşamada aktif değil).
- **İşlem Kayıtları (Audit Logging):** Sisteme eklenecek yeni kullanıcılar ve adminlerin yaptığı her türlü kritik işlem (sunucu yeniden başlatma, terminal komutları, dosya düzenleme vb.) detaylıca loglanacaktır.

### 4.2. VPS İzleme (Telemetry & Health Check)
- **Anlık Metrikler:** RAM, CPU, Disk kullanımı ve saniyelik Ağ (Upload/Download) kullanımı. Veriler HTTP polling yerine Go ajanı üzerinden gRPC ile akarak Redis'e işlenir ve web panelinde gecikmesiz/düşük gecikmeli grafikler olarak gösterilir.
- **Health Check & Heartbeat:** Go ajanı sürekli heartbeat gönderir. Belirli bir süre heartbeat alınamayan (offline olan) sunucular için Telegram üzerinden anında bildirim gönderilir. Panalde güncel durum her an izlenebilir, ayrıca manuel "Güncelle" butonu da bulunur.
- **Ekran Görüntüleri:** Belirli aralıklarla alınan VPS ekran görüntüleri ajan tarafından sıkıştırılarak gönderilir. Next.js panelinde Lazy Loading kullanılarak performans artırılır; önce VPS verileri yüklenir, ardından küçük resimler (thumbnails) getirilir. Ekran görüntüsü güncellendiğinde UI otomatik yenilenir, tıklandığında tam boyutlu hali görülür.

### 4.3. Uzaktan Yönetim ve Müdahale
- **Etkileşimli Web Terminali (Web PTY):** Go ajanı sunucuda sanal bir terminal (PTY) oluşturur. Bu terminal, gRPC üzerinden backend'e ve oradan da Next.js arayüzündeki **xterm.js**'e aktarılır. SSH kullanımına gerek kalmadan tam özellikli terminal deneyimi sunulur.
- **Toplu İşlemler:** Kullanıcının seçtiği bir veya birden fazla VPS üzerinde toplu yeniden başlatma, kapatma, açma işlemleri yapılabilir.
- **Rustdesk Entegrasyonu:** Görsel uzaktan kontrol için Rustdesk ve Rustdesk Web projeye entegre edilecek ve özel bir panel yapılacaktır.
- **Dosya Yöneticisi:** Web üzerinden hedef sunucunun dosya sisteminde gezinmeyi sağlayan "tree-view" tabanlı dosya yöneticisi. `.env`, `nginx.conf`, `docker-compose.yml` gibi yapılandırma dosyaları web arayüzünde **Monaco Editor (VSCode Web)** ile düzenlenip doğrudan ajan aracılığıyla kaydedilebilir.

### 4.4. Kural Tabanlı Alarm Motoru (Alerting Engine)
- Sadece standart "sunucu düştü mü?" kontrolünün ötesinde, Redis'e akan telemetri verisini gerçek zamanlı değerlendiren motor.
- **Örnek Kurallar:**
  - "Sunucu-A'nın disk kullanımı %95'i geçerse Telegram'dan bildir."
  - "Sunucu-B'nin CPU'su 10 dakika boyunca aralıksız %90'ın üzerinde seyrederse Discord/Telegram'a uyarı at ve nginx servisini restart et."

## 5. Güvenlik, Veri ve Git Prensipleri
- **Veri Yükü Dağılımı:** Karmaşayı ve veritabanı yükünü önlemek için anlık akan metrikler (grafikler, saniyelik veriler, log akışları) Redis üzerinde tutulacaktır. Sadece kalıcı olması gereken konfigürasyonlar, log kayıtları ve kullanıcı hesapları PostgreSQL'e yazılacaktır.
- **Git Entegrasyonu:** `tests` klasörü, `.env` dosyaları ve `.agent/skills` gibi AI becerileri hiçbir şekilde ana (remote) repoya push edilmeyecektir. `.gitignore` dosyası projenin durumuna göre sürekli güncel tutulacaktır.
- **Env Senkronizasyonu:** Geliştirme aşamasında `.env` dosyasına eklenen her yeni anahtar, değerleri boş/örnek olacak şekilde `.example.env` dosyasına da anında eklenecektir.

## 6. Proje Gelişimi
Bu dosya statik değildir. Projeye yeni bir özellik, kural veya teknoloji eklendiğinde AI ajanları ve geliştiriciler tarafından sürekli güncellenerek "Single Source of Truth" (Tek Doğru Kaynağı) olarak kalmaya devam etmelidir.
