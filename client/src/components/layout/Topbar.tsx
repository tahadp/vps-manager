"use client";
import React from 'react';
import { Search, Sun, Moon } from 'lucide-react';
import { useTheme } from 'next-themes';
import NotificationPanel from '../NotificationPanel';
import UserMenu from '../UserMenu';

export function Topbar() {
  const { theme, setTheme } = useTheme();

  return (
    <header className="h-16 glass border-b border-border-subtle flex items-center justify-between px-4 lg:px-6 shrink-0 z-30 sticky top-0">
      <div className="flex-1 max-w-md relative flex items-center">
        <Search className="absolute left-3 w-4 h-4 text-text-muted pointer-events-none" />
        <input
          type="text"
          placeholder="Search resources…"
          readOnly
          onClick={() =>
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))
          }
          className="w-full glass-input pl-9 pr-14 h-9 rounded-md text-sm text-text-primary placeholder:text-text-muted outline-none cursor-pointer"
        />
        <kbd className="absolute right-2.5 hidden sm:inline-flex items-center px-1.5 h-5 text-[10px] font-mono text-text-muted border border-border rounded pointer-events-none">
          ⌘K
        </kbd>
      </div>

      <div className="flex items-center gap-1 ml-4">
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="h-9 w-9 inline-flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-bg-elevated rounded-md transition-colors"
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        <NotificationPanel />
        <UserMenu />
      </div>
    </header>
  );
}
