"use client";

import React, { ReactNode, useEffect, useState } from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { CommandPalette } from '../CommandPalette';
import { motion, AnimatePresence } from 'framer-motion';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { SocketProvider } from '@/lib/socket';
import { api } from '@/lib/api';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    if (pathname === '/login') {
      setAuthenticated(false);
      return;
    }
    if (authenticated === true) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        await api('/api/vps', { method: 'GET' });
        if (!cancelled) setAuthenticated(true);
      } catch {
        if (!cancelled) {
          setAuthenticated(false);
          router.replace('/login');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [pathname, router, authenticated]);

  useEffect(() => {
    if (sidebarOpen) setSidebarOpen(false);
  }, [pathname]);

  const content = (
    <div className="flex h-screen w-full bg-bg-base overflow-hidden">
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSidebarOpen(false)}
              className="fixed inset-0 z-40 bg-black/55 backdrop-blur-sm lg:hidden"
            />
            <motion.div
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              className="fixed inset-y-0 left-0 z-50 lg:hidden"
            >
              <div className="relative">
                <Sidebar />
                <button
                  onClick={() => setSidebarOpen(false)}
                  className="absolute top-3 right-[-44px] h-9 w-9 inline-flex items-center justify-center bg-bg-raised border border-border rounded-md text-text-secondary hover:text-text-primary transition-colors"
                  aria-label="Close sidebar"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden relative">
        <div className="flex items-center lg:hidden h-16 px-3 border-b border-border-subtle">
          <button
            onClick={() => setSidebarOpen(true)}
            className="h-9 w-9 inline-flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-bg-elevated rounded-md transition-colors"
            aria-label="Open sidebar"
          >
            <Menu className="w-4 h-4" />
          </button>
        </div>

        <Topbar />
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 lg:p-6 relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="h-full"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <CommandPalette />
    </div>
  );

  if (pathname === '/login') {
    return <>{children}</>;
  }

  if (authenticated === null) {
    return (
      <div className="h-full flex items-center justify-center bg-bg-base text-text-muted">
        <div className="h-6 w-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return <SocketProvider authenticated={authenticated}>{content}</SocketProvider>;
}
