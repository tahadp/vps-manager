"use client";
import { useState } from 'react';
import { RefreshCw } from 'lucide-react';

interface RefreshButtonProps {
  vpsId: string;
  onResult?: (ok: boolean, message: string) => void;
  className?: string;
}

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export default function RefreshButton({ vpsId, onResult, className }: RefreshButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleRefresh = async () => {
    setLoading(true);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API}/api/vps/${vpsId}/refresh`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        onResult?.(true, 'Refresh triggered — new screenshot and telemetry incoming');
      } else {
        const data = await res.json().catch(() => ({}));
        onResult?.(false, data.error || 'Refresh failed');
      }
    } catch (err: any) {
      onResult?.(false, err.message || 'Network error');
    }
    setLoading(false);
    setTimeout(() => onResult?.(false, ''), 4000);
  };

  return (
    <button
      onClick={handleRefresh}
      disabled={loading}
      className={className || "flex items-center gap-1.5 px-3 py-2 text-xs bg-neutral-bg2 hover:bg-neutral-bg3 text-text-secondary rounded-xl border border-border-DEFAULT transition-colors disabled:opacity-50"}
      title="Manually refresh telemetry & screenshot"
    >
      <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
      {loading ? 'Refreshing…' : 'Refresh'}
    </button>
  );
}
