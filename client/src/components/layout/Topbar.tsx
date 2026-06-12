import React from 'react';
import { Bell, Search, User } from 'lucide-react';

export function Topbar() {
  return (
    <header className="h-16 glass border-b border-white/5 flex items-center justify-between px-6 shrink-0 z-10 sticky top-0">
      <div className="flex-1 max-w-md relative flex items-center">
        <Search className="absolute left-3 w-4 h-4 text-text-muted" />
        <input
          type="text"
          placeholder="Search resources..."
          className="w-full glass-input pl-10 pr-12 py-2 rounded-lg text-sm text-text-primary placeholder:text-text-muted transition-colors outline-none"
          readOnly
          onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
        />
        <div className="absolute right-3 px-1.5 py-0.5 rounded border border-border-DEFAULT text-[10px] text-text-muted bg-neutral-bg2 pointer-events-none">
          ⌘K
        </div>
      </div>

      <div className="flex items-center gap-4 ml-4">
        <button className="p-2 text-text-secondary hover:text-text-primary hover:bg-white/5 rounded-full transition-colors relative">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-brand shadow-glow" />
        </button>
        
        <div className="h-8 w-8 rounded-full bg-neutral-bg3 border border-border flex items-center justify-center cursor-pointer hover:border-brand-light transition-colors">
          <User className="w-4 h-4 text-text-secondary" />
        </div>
      </div>
    </header>
  );
}
