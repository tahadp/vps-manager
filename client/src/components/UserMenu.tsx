"use client";
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Settings, LogOut, Mail, Calendar } from 'lucide-react';

export default function UserMenu() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem('user');
    if (stored) {
      try { setUser(JSON.parse(stored)); } catch {}
    }
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="h-8 w-8 rounded-full bg-gradient-to-br from-brand to-dataviz-purple border border-border flex items-center justify-center cursor-pointer hover:scale-105 transition-transform"
        title="User menu"
      >
        {user?.username ? (
          <span className="text-xs font-bold text-white uppercase">{user.username.charAt(0)}</span>
        ) : (
          <User className="w-4 h-4 text-white" />
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="absolute right-0 mt-2 w-64 bg-neutral-bg2 border border-border-DEFAULT rounded-2xl shadow-2xl z-50 py-2"
          >
            <div className="px-4 py-3 border-b border-border-subtle">
              <div className="text-sm font-semibold text-text-primary">{user?.username || user?.email || 'User'}</div>
              <div className="text-xs text-text-muted flex items-center gap-1 mt-0.5">
                <Mail className="w-3 h-3" /> {user?.email || ''}
              </div>
              {user?.role && (
                <div className="mt-2 inline-block px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider bg-brand/15 text-brand-light rounded-md">
                  {user.role}
                </div>
              )}
            </div>
            <button onClick={() => { router.push('/settings'); setOpen(false); }} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-text-primary hover:bg-neutral-bg3 transition-colors">
              <Settings className="w-4 h-4" /> Settings
            </button>
            <button onClick={logout} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-status-error hover:bg-status-error/10 transition-colors">
              <LogOut className="w-4 h-4" /> Logout
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
