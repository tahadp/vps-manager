"use client";
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, Check, X } from 'lucide-react';
import { useSocket } from '@/lib/socket';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

const TYPE_COLOR: Record<string, string> = {
  ALERT: 'text-status-warning',
  OFFLINE: 'text-status-error',
  RECOVERY: 'text-status-success',
  RESTART: 'text-status-info'
};

export default function NotificationPanel() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { socket } = useSocket();

  const fetchItems = async () => {
    setLoading(true);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API}/api/notifications`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const d = await res.json();
        setItems(d.items || []);
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    if (!socket) return;
    const handler = (n: any) => {
      setItems(prev => [n, ...prev].slice(0, 50));
    };
    socket.on('notification', handler);
    return () => { socket.off('notification', handler); };
  }, [socket]);

  useEffect(() => {
    if (open) fetchItems();
  }, [open]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const markRead = async () => {
    const token = localStorage.getItem('token');
    await fetch(`${API}/api/notifications/mark-read`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    setItems([]);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="p-2 text-text-secondary hover:text-text-primary hover:bg-white/5 rounded-full transition-colors relative"
        title="Notifications"
      >
        <Bell className="w-5 h-5" />
        {items.length > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-status-error text-white text-[10px] flex items-center justify-center font-bold">
            {items.length > 9 ? '9+' : items.length}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="absolute right-0 mt-2 w-96 max-h-[500px] bg-neutral-bg2 border border-border-DEFAULT rounded-2xl shadow-2xl z-50 flex flex-col"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
              <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                <Bell className="w-4 h-4" /> Notifications
              </h3>
              {items.length > 0 && (
                <button onClick={markRead} className="text-xs text-text-muted hover:text-text-primary flex items-center gap-1">
                  <Check className="w-3 h-3" /> Mark all read
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto max-h-[400px]">
              {loading ? (
                <div className="p-6 text-center text-text-muted text-sm">Loading…</div>
              ) : items.length === 0 ? (
                <div className="p-8 text-center text-text-muted text-sm">
                  <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  No notifications yet.
                </div>
              ) : (
                items.map((n, i) => (
                  <button
                    key={i}
                    onClick={() => { if (n.vpsId) router.push(`/vps/${n.vpsId}`); setOpen(false); }}
                    className="w-full text-left p-3 border-b border-border-subtle hover:bg-neutral-bg3 transition-colors"
                  >
                    <div className="flex items-start gap-2">
                      <span className={`text-[10px] uppercase font-bold tracking-wider mt-0.5 ${TYPE_COLOR[n.type] || 'text-text-muted'}`}>
                        {n.type}
                      </span>
                      <span className="text-[10px] text-text-muted ml-auto whitespace-nowrap">
                        {new Date(n.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm text-text-primary mt-1 whitespace-pre-wrap break-words">{n.message}</p>
                    {n.vpsName && (
                      <p className="text-xs text-text-muted mt-1">VPS: {n.vpsName}</p>
                    )}
                  </button>
                ))
              )}
            </div>
            <div className="px-4 py-2 border-t border-border-subtle text-center">
              <button onClick={() => { router.push('/alerts'); setOpen(false); }} className="text-xs text-brand-light hover:text-brand">
                View all alerts →
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
