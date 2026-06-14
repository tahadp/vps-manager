"use client";
import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';

interface RefreshButtonProps {
  vpsId: string;
  onResult?: (ok: boolean, message: string) => void;
  className?: string;
}

export default function RefreshButton({ vpsId, onResult, className }: RefreshButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleRefresh = async () => {
    setLoading(true);
    try {
      await api(`/api/vps/${vpsId}/refresh`, { method: 'POST' });
      onResult?.(true, 'Refresh triggered — new screenshot and telemetry incoming');
    } catch (err: any) {
      onResult?.(false, err?.message || 'Refresh failed');
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
