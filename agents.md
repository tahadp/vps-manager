# AI Ajanları ve LLM'ler İçin Proje Çalışma Kuralları (Agent Instructions)

Bu belge, bu repo üzerinde çalışacak tüm otonom ajanlar (Claude, Codex, Antigravity vb.) ve dil modelleri için **ana anayasa** niteliğindedir. Kod yazmadan, komut çalıştırmadan veya bir sorunu çözmeye başlamadan önce bu belgedeki kuralların bağlamınıza tam olarak yüklendiğinden emin olun.

## 1. Geliştirme ve Planlama İş Akışı (Brainstorming & Planning)
Bu projede "Bu iş çok basit, direkt kodu yazayım" demek (Anti-Pattern) kesinlikle **yasaktır**.
- Herhangi bir özellik oluşturmadan, mimari bir karar almadan veya önemli bir davranış değişikliği yapmadan önce `.agent/skills/brainstorming` becerisi veya benzeri planlama akışlarını çalıştırın.
- Kod yazmadan önce **mutlaka**:
  1. Projenin mevcut durumunu inceleyin (`proje.md`, klasör yapıları, son commitler).
  2. Kullanıcıya (varsa) eksik veya belirsiz noktalar için **tek seferde bir adet** olacak şekilde net (tercihen çoktan seçmeli) sorular sorun.
  3. Uygulama için 2 veya 3 farklı yaklaşım sunun, trade-off'ları (artıları/eksileri) belirtip kendi önerinizi sunun.
  4. Tasarım onaylandıktan sonra bir implementasyon planı (writing-plans) çıkartın ve adım adım ilerleyin.
- **Görev İşleme Kuralı (Zorunlu):** Yeni bir görev/istek aldığınızda **ilk olarak** `implementation_plan.md` dosyasını oluşturun veya güncelleyin. Tasarımı ve yaklaşımı bu dosyada netleştirin.
- Ardından, hazırladığınız plana uygun olarak `task.md` dosyasını (to-do listesi şeklinde) oluşturun veya güncelleyin. Yapılacakları adım adım (Örn: `[ ]`, `[/]`, `[x]`) bu dosyadan takip edin.

## 2. Teknoloji Standartları ve Prensipleri
- **Modülerlik:** Her bileşen kendi klasöründe olmalıdır (`/server`, `/client`, `/agent`, `/tests`). Karmaşık ve birbirine giren (spagetti) bağımlılıklara izin verilmez.
- **Backend (`/server`):** Node.js ve TypeScript. Temiz bir mimari (Clean Architecture/Layered Architecture) kullanılmalı.
- **Frontend (`/client`):** Next.js. Arayüz **minimal, mobil uyumlu ve gecikmesiz** olmalıdır. Gereksiz kütüphanelerden kaçınılmalı, UI gecikmesi (latency) sıfıra indirilmelidir. Gece/Gündüz modu native olarak desteklenmelidir.
- **Agent (`/agent`):** Go (Golang). VPS içinde çalışacağı için *olabildiğince düşük RAM ve CPU tüketen* saf bir yazılım olmalıdır. PTY ve telemetri işlemleri kaynakları sömürmemelidir.
- **Haberleşme:** Sunucu-Agent arası zorunlu olarak **gRPC** (HTTP request yasaktır). Sunucu-Client arası metrikler **WebSockets / gRPC-Web** üzerinden akar.
- **Veritabanı Yükü:** Saniyelik işlemler (telemetri, cpu/ram vb.) ve kural motoru geçici belleği **Redis** üzerinde tutulmalıdır. **PostgreSQL** sadece kalıcı ve ilişkisel veriler (Kullanıcılar, Audit Loglar, VPS Listesi) için kullanılmalıdır. Redis'i "çöplük" haline getirmeyin, veri yapılarını (Hashes, Streams vb.) baştan doğru kurgulayın.

## 3. Güvenlik, Dosya İzleme ve Git Kuralları
- **`git push` ve `.gitignore`:**
  - Test dosyaları (`/tests`), AI skill klasörleri (`.agent/skills`), ortam değişkenleri (`.env` vb.) **KATI BİR ŞEKİLDE** `.gitignore` içinde olmalıdır. Bunların repoya pushlanması güvenlik ihlalidir.
  - `.gitignore` dosyası yeni araçlar ve klasörler eklendikçe sizin tarafınızdan sürekli güncel tutulmalıdır.
- **`.env` Senkronizasyonu:** Koda yeni bir çevresel değişken (environment variable) eklediğinizde, değerini boş veya örnek bir formatta bırakarak derhal `.example.env` dosyasına da ekleyin.
- **Yetkilendirme ve Denetim (Audit):** Kullanıcıların tetiklediği tüm sunucu durum değişiklikleri (kapatma, komut yollama, dosya değiştirme vb.) veritabanına loglanmalıdır.

## 4. UI / UX ve Performans Kuralları
- **Lazy Loading ve Sıkıştırma:** Agent'tan gelen ekran görüntüleri sıkıştırılmalı ve UI'da mutlaka lazy-loading ile yüklenmelidir. Panele ilk girildiğinde sayfayı kilitlememelidir.
- **Etkileşimli Terminaller (xterm.js):** PTY streamlerini işlerken UI'ın donmamasına dikkat edin.

## 5. Sürekli Güncelleme ve Evrim
Bu `agents.md` ve `proje.md` dosyaları projenin kalbidir. 
- Projeye yeni bir teknoloji eklendiğinde,
- Yeni bir mimari kural koyulduğunda,
- Kullanıcı sistemle ilgili köklü bir karar verdiğinde,
**İlk işiniz bu dosyaları güncellemek olmalıdır.** Aksi takdirde sonraki AI oturumları bağlamı kaybedecektir.
