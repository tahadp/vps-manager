"use client";
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Command } from 'cmdk';
import { Server, Search, TerminalSquare, ShieldAlert, LayoutDashboard, Settings, X, Bell, Shield } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { api, getStoredUser } from '@/lib/api';

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [vpsList, setVpsList] = useState<any[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const router = useRouter();

  useEffect(() => {
    try {
      const stored = localStorage.getItem('user');
      if (stored) {
        const u = JSON.parse(stored);
        if (u?.role === 'ADMIN') setIsAdmin(true);
      }
    } catch {}
  }, []);

  // Toggle the menu when ⌘K is pressed
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  // Fetch servers to populate the palette
  useEffect(() => {
    if (open && vpsList.length === 0) {
      if (getStoredUser()) {
        api<any[]>('/api/vps')
          .then(data => { if (Array.isArray(data)) setVpsList(data); })
          .catch(() => {});
      }
    }
  }, [open, vpsList.length]);

  return (
    <AnimatePresence>
      {open && (
        <Command.Dialog
          open={open}
          onOpenChange={setOpen}
          label="Command palette"
          className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/60 backdrop-blur-sm"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="w-full max-w-xl bg-neutral-bg1 border border-border-subtle rounded-2xl shadow-2xl overflow-hidden"
          >
            <div className="flex items-center px-4 py-3 border-b border-border-subtle bg-neutral-bg2/50">
              <Search className="w-5 h-5 text-text-muted mr-3" />
              <Command.Input 
                autoFocus 
                placeholder="Search servers, settings, or actions..." 
                className="flex-1 bg-transparent border-none outline-none text-text-primary placeholder:text-text-muted text-sm"
              />
              <div className="hidden sm:block px-1.5 py-0.5 rounded border border-border-DEFAULT text-[10px] text-text-muted bg-neutral-bg2 ml-3">
                ESC
              </div>
              <button 
                onClick={() => setOpen(false)}
                className="p-1 hover:bg-white/10 rounded-lg text-text-muted hover:text-text-primary transition-colors ml-2"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <Command.List className="max-h-[300px] overflow-y-auto p-2 scrollbar-thin">
              <Command.Empty className="py-6 text-center text-sm text-text-muted">
                No results found.
              </Command.Empty>

              <Command.Group heading={<div className="px-2 py-1.5 text-xs font-semibold text-text-muted uppercase tracking-wider">Servers</div>}>
                {vpsList.map((vps) => (
                  <Command.Item
                    key={vps.id}
                    onSelect={() => {
                      router.push(`/vps/${vps.id}`);
                      setOpen(false);
                    }}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-sm text-text-secondary aria-selected:bg-brand/10 aria-selected:text-brand-light transition-colors"
                  >
                    <div className="w-6 h-6 rounded-md bg-neutral-bg2 border border-border-subtle flex items-center justify-center">
                      <Server className="w-3.5 h-3.5" />
                    </div>
                    <span className="font-medium text-text-primary">{vps.name}</span>
                    <span className="text-xs text-text-muted font-mono ml-auto">{vps.ipAddress}</span>
                  </Command.Item>
                ))}
              </Command.Group>

              <Command.Group heading={<div className="px-2 py-1.5 text-xs font-semibold text-text-muted uppercase tracking-wider mt-2">Navigation</div>}>
                <Command.Item
                  onSelect={() => { router.push('/'); setOpen(false); }}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-sm text-text-secondary aria-selected:bg-neutral-bg3 aria-selected:text-text-primary transition-colors"
                >
                  <LayoutDashboard className="w-4 h-4" /> Dashboard
                </Command.Item>
                <Command.Item
                  onSelect={() => { router.push('/vps'); setOpen(false); }}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-sm text-text-secondary aria-selected:bg-neutral-bg3 aria-selected:text-text-primary transition-colors"
                >
                  <Server className="w-4 h-4" /> VPS List
                </Command.Item>
                <Command.Item
                  onSelect={() => { router.push('/alerts'); setOpen(false); }}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-sm text-text-secondary aria-selected:bg-neutral-bg3 aria-selected:text-text-primary transition-colors"
                >
                  <Bell className="w-4 h-4" /> Alerts
                </Command.Item>
                <Command.Item
                  onSelect={() => { router.push('/audit'); setOpen(false); }}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-sm text-text-secondary aria-selected:bg-neutral-bg3 aria-selected:text-text-primary transition-colors"
                >
                  <ShieldAlert className="w-4 h-4" /> Audit Logs
                </Command.Item>
                <Command.Item
                  onSelect={() => { router.push('/settings'); setOpen(false); }}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-sm text-text-secondary aria-selected:bg-neutral-bg3 aria-selected:text-text-primary transition-colors"
                >
                  <Settings className="w-4 h-4" /> Settings
                </Command.Item>
                {isAdmin && (
                  <Command.Item
                    onSelect={() => { router.push('/admin'); setOpen(false); }}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-sm text-text-secondary aria-selected:bg-neutral-bg3 aria-selected:text-text-primary transition-colors"
                  >
                    <Shield className="w-4 h-4" /> Admin
                  </Command.Item>
                )}
              </Command.Group>

            </Command.List>
          </motion.div>
        </Command.Dialog>
      )}
    </AnimatePresence>
  );
}
