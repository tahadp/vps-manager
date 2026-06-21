"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { LayoutDashboard, Server, Settings, ShieldAlert, Bell, Shield } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

const navItems = [
  { name: 'Dashboard',  href: '/',         icon: LayoutDashboard },
  { name: 'VPS list',   href: '/vps',      icon: Server },
  { name: 'Alerts',     href: '/alerts',   icon: Bell },
  { name: 'Audit logs', href: '/audit',    icon: ShieldAlert },
  { name: 'Settings',   href: '/settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = React.useState(false);

  React.useEffect(() => {
    try {
      const stored = localStorage.getItem('user');
      if (stored) {
        const u = JSON.parse(stored);
        if (u?.role === 'ADMIN') setIsAdmin(true);
      }
    } catch {}
  }, []);

  const isItemActive = (href: string) =>
    pathname === href || (href !== '/' && pathname.startsWith(href));

  return (
    <aside className="glass-panel w-64 h-full flex flex-col p-3 flex-shrink-0">
      <div className="flex items-center gap-2.5 px-2.5 py-2 mb-4">
        <span className="h-7 w-7 rounded-md bg-brand inline-flex items-center justify-center">
          <Server className="w-3.5 h-3.5 text-text-inverse" />
        </span>
        <span className="text-[15px] font-semibold text-text-primary tracking-tight">
          VPS Manager
        </span>
      </div>

      <nav className="space-y-0.5 flex-1">
        {navItems.map((item) => {
          const isActive = isItemActive(item.href);
          const Icon = item.icon;

          return (
            <Link key={item.name} href={item.href} className="relative block">
              {isActive && (
                <motion.div
                  layoutId="active-nav"
                  className="absolute inset-0 bg-brand-soft rounded-md border border-brand/30"
                  initial={false}
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
              <div
                className={cn(
                  'relative flex items-center gap-2.5 px-3 h-9 rounded-md text-sm transition-colors',
                  isActive
                    ? 'text-text-primary font-medium'
                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated font-normal'
                )}
              >
                <Icon className="w-4 h-4" />
                {item.name}
              </div>
            </Link>
          );
        })}

        {isAdmin && (
          <Link href="/admin" className="relative block">
            {isItemActive('/admin') && (
              <motion.div
                layoutId="active-nav"
                className="absolute inset-0 bg-brand-soft rounded-md border border-brand/30"
                initial={false}
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              />
            )}
            <div
              className={cn(
                'relative flex items-center gap-2.5 px-3 h-9 rounded-md text-sm transition-colors',
                isItemActive('/admin')
                  ? 'text-text-primary font-medium'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated font-normal'
              )}
            >
              <Shield className="w-4 h-4" />
              Admin
            </div>
          </Link>
        )}
      </nav>

      <div className="px-2.5 py-2 text-[11px] text-text-muted">
        End-to-end encrypted
      </div>
    </aside>
  );
}
