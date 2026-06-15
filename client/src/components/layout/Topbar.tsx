"use client";
import React from 'react';
import { Search, Sun, Moon } from 'lucide-react';
import { useTheme } from 'next-themes';
import NotificationPanel from '../NotificationPanel';
import UserMenu from '../UserMenu';

export function Topbar() {
  const { theme, setTheme } = useTheme();

  return (
    <header className="h-16 glass border-b border-white/5 flex items-center justify-between px-6 shrink-0 z-30 sticky top-0">
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

      <div className="flex items-center gap-3 ml-4">
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="p-2 text-text-secondary hover:text-text-primary hover:bg-white/5 rounded-full transition-colors"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>

        <NotificationPanel />
        <UserMenu />
      </div>
    </header>
  );
}
