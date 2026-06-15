"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { LayoutDashboard, Server, Settings, ShieldAlert, LogOut, Bell, Shield } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

const navItems = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'VPS List', href: '/vps', icon: Server },
  { name: 'Alerts', href: '/alerts', icon: Bell },
  { name: 'Audit Logs', href: '/audit', icon: ShieldAlert },
  { name: 'Settings', href: '/settings', icon: Settings },
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

  return (
    <aside className="glass-panel w-64 h-full flex flex-col justify-between p-4 flex-shrink-0">
      <div>
        <div className="flex items-center gap-3 px-2 mb-8">
          <div className="w-8 h-8 rounded-lg bg-brand flex items-center justify-center shadow-glow">
            <Server className="w-5 h-5 text-white" />
          </div>
          <span className="text-lg font-bold text-text-primary tracking-wide">
            VPS Manager
          </span>
        </div>

        <nav className="space-y-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
            const Icon = item.icon;

            return (
              <Link
                key={item.name}
                href={item.href}
                className="relative block"
              >
                {isActive && (
                  <motion.div
                    layoutId="active-nav"
                    className="absolute inset-0 bg-brand-subtle rounded-lg border border-brand/20"
                    initial={false}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  />
                )}
                <div className={cn(
                  "relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  isActive ? "text-brand-light" : "text-text-secondary hover:text-text-primary hover:bg-white/5"
                )}>
                  <Icon className="w-5 h-5" />
                  {item.name}
                </div>
              </Link>
            );
          })}

          {isAdmin && (
            <Link href="/admin" className="relative block">
              {(pathname === '/admin' || pathname.startsWith('/admin')) && (
                <motion.div
                  layoutId="active-nav"
                  className="absolute inset-0 bg-brand-subtle rounded-lg border border-brand/20"
                  initial={false}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                />
              )}
              <div className={cn(
                "relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                (pathname === '/admin' || pathname.startsWith('/admin'))
                  ? "text-brand-light"
                  : "text-text-secondary hover:text-text-primary hover:bg-white/5"
              )}>
                <Shield className="w-5 h-5" />
                Admin
              </div>
            </Link>
          )}
        </nav>
      </div>


    </aside>
  );
}
