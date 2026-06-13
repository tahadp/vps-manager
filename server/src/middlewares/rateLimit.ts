import { Request, Response, NextFunction } from 'express';

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

const store: RateLimitStore = {};

// Periyodik temizleme (her 5 dakikada bir)
setInterval(() => {
  const now = Date.now();
  for (const key in store) {
    if (store[key].resetTime < now) {
      delete store[key];
    }
  }
}, 5 * 60 * 1000);

interface RateLimitOptions {
  windowMs: number;      // Zaman penceresi (ms)
  max: number;           // Maksimum istek sayısı
  message?: string;      // Hata mesajı
  keyGenerator?: (req: Request) => string; // Key oluşturucu fonksiyon
}

export function rateLimit(options: RateLimitOptions) {
  const {
    windowMs = 15 * 60 * 1000, // Varsayılan: 15 dakika
    max = 100,                  // Varsayılan: 100 istek
    message = 'Too many requests, please try again later.',
    keyGenerator = (req: Request) => {
      // IP adresi veya user ID kullan
      return req.ip || req.socket.remoteAddress || 'unknown';
    }
  } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    const key = keyGenerator(req);
    const now = Date.now();

    // Store'da yoksa veya süre dolmuşsa sıfırla
    if (!store[key] || store[key].resetTime < now) {
      store[key] = {
        count: 0,
        resetTime: now + windowMs
      };
    }

    // İstek sayısını artır
    store[key].count++;

    // Rate limit header'ları ekle
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - store[key].count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(store[key].resetTime / 1000));

    // Limit aşıldıysa hata döndür
    if (store[key].count > max) {
      res.setHeader('Retry-After', Math.ceil((store[key].resetTime - now) / 1000));
      return res.status(429).json({ error: message });
    }

    next();
  };
}

// Auth endpointleri için sıkı limit
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 dakika
  max: 10,                    // 10 istek
  message: 'Too many login attempts. Please try again in 15 minutes.',
  keyGenerator: (req: Request) => {
    // Login/Register için IP + endpoint kombinasyonu
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    return `${ip}:${req.path}`;
  }
});

// Genel API için normal limit
export const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,  // 1 dakika
  max: 60,                    // 60 istek
  message: 'Too many requests. Please slow down.'
});