"use client";
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, Check } from 'lucide-react';
import { useSocket } from '@/lib/socket';
import { api } from '@/lib/api';

const TYPE_COLOR: Record<string, string> = {
  ALERT: 'text-status-warning',
  OFFLINE: 'text-status-error',
  RECOVERY: 'text-status-success',
  RESTART: 'text-status-info',
};

const TYPE_LABEL: Record<string, string> = {
  ALERT: 'Alert',
  OFFLINE: 'Offline',
  RECOVERY: 'Recovered',
  RESTART: 'Restarted',
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
    try {
      const d = await api<{ items?: any[] }>('/api/notifications');
      setItems(d.items || []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    if (!socket) return;
    const handler = (n: any) => {
      setItems((prev) => [n, ...prev].slice(0, 50));
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
    await api('/api/notifications/mark-read', { method: 'POST' });
    setItems([]);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="h-9 w-9 inline-flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-bg-elevated rounded-md transition-colors relative"
        aria-label="Notifications"
        title="Notifications"
      >
        <Bell className="w-4 h-4" />
        {items.length > 0 && (
          <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-status-error text-text-inverse text-[10px] flex items-center justify-center font-medium tabular-nums">
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
            transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
            className="absolute right-0 mt-2 w-96 max-h-[500px] bg-bg-raised border border-border rounded-lg shadow-raise z-50 flex flex-col"
          >
            <div className="flex items-center justify-between px-4 h-12 border-b border-border-subtle">
              <h3 className="text-sm font-medium text-text-primary flex items-center gap-2">
                <Bell className="w-4 h-4 text-text-muted" />
                Notifications
              </h3>
              {items.length > 0 && (
                <button
                  onClick={markRead}
                  className="text-xs text-text-muted hover:text-text-primary flex items-center gap-1"
                >
                  <Check className="w-3 h-3" />
                  Mark all read
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto max-h-[400px]">
              {loading ? (
                <div className="p-6 text-center text-text-muted text-sm">Loading…</div>
              ) : items.length === 0 ? (
                <div className="p-10 text-center text-text-muted text-sm">
                  <Bell className="w-6 h-6 mx-auto mb-2 opacity-40" />
                  No notifications yet.
                </div>
              ) : (
                items.map((n, i) => (
                  <button
                    key={i}
                    onClick={() => { if (n.vpsId) router.push(`/vps/${n.vpsId}`); setOpen(false); }}
                    className="w-full text-left px-4 py-3 border-b border-border-subtle last:border-0 hover:bg-bg-elevated transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`text-[11px] font-medium ${TYPE_COLOR[n.type] || 'text-text-muted'}`}>
                        {TYPE_LABEL[n.type] || n.type}
                      </span>
                      <span className="text-[11px] text-text-muted ml-auto tabular-nums">
                        {new Date(n.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm text-text-primary mt-1 whitespace-pre-wrap break-words">
                      {n.message}
                    </p>
                    {n.vpsName && (
                      <p className="text-xs text-text-muted mt-1">VPS: {n.vpsName}</p>
                    )}
                  </button>
                ))
              )}
            </div>
            <div className="px-4 h-10 border-t border-border-subtle flex items-center justify-center">
              <button
                onClick={() => { router.push('/alerts'); setOpen(false); }}
                className="text-xs text-text-secondary hover:text-text-primary"
              >
                View all alerts →
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
