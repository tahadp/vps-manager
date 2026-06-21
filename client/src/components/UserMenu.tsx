"use client";
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Settings, LogOut, Mail } from 'lucide-react';
import { api, getStoredUser, setStoredUser } from '@/lib/api';

export default function UserMenu() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setUser(getStoredUser());
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const logout = async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore — clear locally regardless
    }
    setStoredUser(null);
    window.location.href = '/login';
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="h-9 w-9 rounded-full bg-brand text-text-inverse inline-flex items-center justify-center font-medium text-sm transition-opacity hover:opacity-90"
        title="User menu"
        aria-label="Open user menu"
      >
        {user?.username ? user.username.charAt(0).toUpperCase() : <User className="w-4 h-4" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
            className="absolute right-0 mt-2 w-64 bg-bg-raised border border-border rounded-lg shadow-raise z-50 py-1.5"
          >
            <div className="px-3 py-2.5 border-b border-border-subtle">
              <div className="text-sm font-medium text-text-primary truncate">
                {user?.username || user?.email || 'User'}
              </div>
              {user?.email && (
                <div className="text-xs text-text-muted flex items-center gap-1.5 mt-0.5 truncate">
                  <Mail className="w-3 h-3 shrink-0" />
                  <span className="truncate">{user.email}</span>
                </div>
              )}
              {user?.role && (
                <div className="mt-2 inline-block px-1.5 py-0.5 text-[10px] font-medium bg-brand-soft text-brand rounded">
                  {user.role}
                </div>
              )}
            </div>
            <button
              onClick={() => { router.push('/settings'); setOpen(false); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-text-primary hover:bg-bg-elevated transition-colors"
            >
              <Settings className="w-4 h-4 text-text-muted" />
              Settings
            </button>
            <button
              onClick={logout}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-status-error hover:bg-status-error/10 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
