"use client";
import React, { useState } from 'react';

export default function ScreenView({ vpsId }: { vpsId: string }) {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchScreenshot = async () => {
    setLoading(true);
    // API Call simülasyonu -> Lazy Loading kurgusu
    setTimeout(() => {
      setImgSrc('https://via.placeholder.com/800x600.png?text=VPS+Live+Screen');
      setLoading(false);
    }, 800);
  };

  return (
    <div className="mt-4 border border-gray-700 rounded p-4 bg-gray-800 shadow">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold text-white">Canlı Ekran (Lazy Loading)</h3>
        <button 
          className="bg-blue-600 hover:bg-blue-500 px-4 py-2 text-sm rounded font-bold text-white transition disabled:opacity-50" 
          onClick={fetchScreenshot} 
          disabled={loading}
        >
          {loading ? 'İndiriliyor...' : 'Ekranı Getir'}
        </button>
      </div>
      <div className="w-full h-64 bg-black rounded flex items-center justify-center overflow-hidden border border-gray-700 relative">
        {imgSrc ? (
          <img 
            src={imgSrc} 
            alt="VPS Screen" 
            className="w-full h-full object-contain" 
            loading="lazy" 
          />
        ) : (
          <span className="text-gray-500 text-sm">Görüntülemek için tıklayın. (Performans için otomatik yüklenmez)</span>
        )}
      </div>
    </div>
  );
}
