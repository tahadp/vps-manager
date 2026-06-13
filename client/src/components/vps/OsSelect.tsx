"use client";
import { useState, useEffect } from 'react';
import { Server, Terminal } from 'lucide-react';

const PRESET_OS = ['Windows Server 2022', 'Ubuntu 22.04', 'Ubuntu 20.04', 'Debian 12', 'CentOS 9'];

interface OsSelectProps {
  value: string;
  customValue: string;
  onChange: (preset: string, custom: string) => void;
}

export default function OsSelect({ value, customValue, onChange }: OsSelectProps) {
  const [mode, setMode] = useState<'preset' | 'custom'>(PRESET_OS.includes(value) ? 'preset' : 'custom');

  useEffect(() => {
    setMode(PRESET_OS.includes(value) ? 'preset' : 'custom');
  }, [value]);

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => { setMode('preset'); onChange('Windows Server 2022', ''); }}
          className={`px-3 py-1 text-xs rounded-lg border transition-colors ${mode === 'preset' ? 'bg-brand/15 border-brand/40 text-brand-light' : 'bg-neutral-bg2 border-border-subtle text-text-secondary'}`}
        >Preset</button>
        <button
          type="button"
          onClick={() => { setMode('custom'); onChange('Other', customValue || ''); }}
          className={`px-3 py-1 text-xs rounded-lg border transition-colors ${mode === 'custom' ? 'bg-brand/15 border-brand/40 text-brand-light' : 'bg-neutral-bg2 border-border-subtle text-text-secondary'}`}
        >Other / Custom</button>
      </div>
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
          <Terminal className="w-4 h-4 text-text-muted" />
        </div>
        {mode === 'preset' ? (
          <select
            value={value}
            onChange={e => onChange(e.target.value, '')}
            className="w-full pl-10 p-2.5 bg-neutral-bg2 border border-border-subtle rounded-xl text-text-primary focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-all text-sm appearance-none"
          >
            {PRESET_OS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : (
          <input
            type="text"
            value={customValue}
            onChange={e => onChange('Other', e.target.value)}
            placeholder="e.g. Atlas OS, FreeBSD 14, Rocky Linux 9"
            className="w-full pl-10 p-2.5 bg-neutral-bg2 border border-border-subtle rounded-xl text-text-primary focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-all text-sm"
          />
        )}
      </div>
    </div>
  );
}
