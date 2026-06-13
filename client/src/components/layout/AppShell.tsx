"use client";

import React, { ReactNode, useState } from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { CommandPalette } from '../CommandPalette';
import { motion, AnimatePresence } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // If login page, don't show the shell
  if (pathname === '/login') {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen w-full bg-neutral-bg1 overflow-hidden">
      {/* Desktop Sidebar */}
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSidebarOpen(false)}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
            />
            <motion.div
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="fixed inset-y-0 left-0 z-50 lg:hidden"
            >
              <div className="relative">
                <Sidebar />
                <button
                  onClick={() => setSidebarOpen(false)}
                  className="absolute top-4 right-[-48px] p-2 bg-neutral-bg2/80 border border-border-subtle rounded-lg text-text-secondary hover:text-text-primary transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden relative">
        {/* Mobile menu button in Topbar area */}
        <div className="flex items-center lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 ml-2 text-text-secondary hover:text-text-primary hover:bg-white/5 rounded-lg transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
        
        <Topbar />
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-6 relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
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
}
