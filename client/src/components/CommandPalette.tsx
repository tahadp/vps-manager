"use client";
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Command } from 'cmdk';
import * as Dialog from '@radix-ui/react-dialog';
import { Server, Search, LayoutDashboard, Settings, X, Bell, Shield, ShieldAlert, LogIn } from 'lucide-react';
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

  // Toggle on ⌘K / Ctrl-K
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [open]);

  // Fetch VPS list on first open
  useEffect(() => {
    if (open && vpsList.length === 0) {
      if (getStoredUser()) {
        api<any[]>('/api/vps')
          .then((data) => { if (Array.isArray(data)) setVpsList(data); })
          .catch(() => {});
      }
    }
  }, [open, vpsList.length]);

  const close = () => setOpen(false);

  return (
    <AnimatePresence>
      {open && (
        <Command.Dialog
          open={open}
          onOpenChange={setOpen}
          label="Command palette"
          overlayClassName="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm"
          contentClassName="fixed left-1/2 top-[15vh] z-50 w-full max-w-xl -translate-x-1/2 outline-none"
        >
          {/* Radix requires a DialogTitle for screen readers. cmdk 1.1
              only sets aria-labelledby, which leaves Radix to warn.
              Provide a visually hidden title to silence the warning
              without changing the visible UI. */}
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            // bg-bg-raised is the same token used by modals — in dark
            // theme it is hsl(240 5% 12%), in light theme #ffffff.
            // Slash opacity on bg-elevated/40 composes correctly with
            // the CSS variable via color-mix() in both themes.
            className="overflow-hidden rounded-xl border border-border bg-bg-raised shadow-raise"
          >
            <div className="flex items-center gap-3 px-4 border-b border-border-subtle bg-bg-elevated/40">
              <Search className="w-4 h-4 text-text-muted shrink-0" />
              <Command.Input
                autoFocus
                placeholder="Search servers, settings, or actions…"
                className="flex-1 bg-transparent border-0 outline-none text-sm text-text-primary placeholder:text-text-muted h-12"
              />
              <kbd className="hidden sm:inline-flex items-center px-1.5 h-5 text-[10px] font-mono text-text-muted border border-border rounded">
                ESC
              </kbd>
              <button
                onClick={close}
                className="p-1 text-text-muted hover:text-text-primary hover:bg-bg-elevated rounded transition-colors"
                aria-label="Close command palette"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <Command.List className="max-h-[340px] overflow-y-auto p-2">
              <Command.Empty className="py-10 text-center text-sm text-text-muted">
                No results found.
              </Command.Empty>

              <Command.Group
                heading={
                  <div className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                    Servers
                  </div>
                }
              >
                {vpsList.map((vps) => (
                  <Command.Item
                    key={vps.id}
                    value={`${vps.name} ${vps.ipAddress}`}
                    onSelect={() => {
                      router.push(`/vps/${vps.id}`);
                      setOpen(false);
                    }}
                    className="flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer text-sm text-text-secondary aria-selected:bg-brand-soft aria-selected:text-text-primary data-[selected=true]:bg-brand-soft data-[selected=true]:text-text-primary"
                  >
                    <span className="w-6 h-6 rounded bg-bg-elevated border border-border-subtle flex items-center justify-center shrink-0">
                      <Server className="w-3.5 h-3.5" />
                    </span>
                    <span className="font-medium text-text-primary truncate">{vps.name}</span>
                    <span className="ml-auto text-[11px] text-text-muted font-mono tabular-nums">
                      {vps.ipAddress}
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>

              <Command.Group
                heading={
                  <div className="px-2 pt-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                    Navigation
                  </div>
                }
              >
                {[
                  { label: 'Dashboard', href: '/', icon: LayoutDashboard },
                  { label: 'VPS list',  href: '/vps', icon: Server },
                  { label: 'Alerts',    href: '/alerts', icon: Bell },
                  { label: 'Audit logs', href: '/audit', icon: ShieldAlert },
                  { label: 'Settings',  href: '/settings', icon: Settings },
                ].map(({ label, href, icon: Icon }) => (
                  <Command.Item
                    key={href}
                    value={label}
                    onSelect={() => { router.push(href); setOpen(false); }}
                    className="flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer text-sm text-text-secondary aria-selected:bg-brand-soft aria-selected:text-text-primary data-[selected=true]:bg-brand-soft data-[selected=true]:text-text-primary"
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </Command.Item>
                ))}

                {isAdmin && (
                  <Command.Item
                    value="Admin"
                    onSelect={() => { router.push('/admin'); setOpen(false); }}
                    className="flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer text-sm text-text-secondary aria-selected:bg-brand-soft aria-selected:text-text-primary data-[selected=true]:bg-brand-soft data-[selected=true]:text-text-primary"
                  >
                    <Shield className="w-4 h-4" />
                    Admin
                  </Command.Item>
                )}

                <Command.Item
                  value="Sign out"
                  onSelect={() => { router.push('/login'); setOpen(false); }}
                  className="flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer text-sm text-text-secondary aria-selected:bg-status-error/15 aria-selected:text-status-error data-[selected=true]:bg-status-error/15 data-[selected=true]:text-status-error"
                >
                  <LogIn className="w-4 h-4" />
                  Switch account
                </Command.Item>
              </Command.Group>
            </Command.List>

            <div className="flex items-center justify-between px-4 py-2 border-t border-border-subtle text-[11px] text-text-muted">
              <span>Type a command or search</span>
              <span className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <kbd className="font-mono">↑</kbd>
                  <kbd className="font-mono">↓</kbd>
                  navigate
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="font-mono">↵</kbd>
                  select
                </span>
              </span>
            </div>
          </motion.div>
        </Command.Dialog>
      )}
    </AnimatePresence>
  );
}
