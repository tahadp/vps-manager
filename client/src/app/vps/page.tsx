"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Server, Search, PowerOff, RefreshCw, Trash2, Eye, Filter, ArrowUpDown, X, Check } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import { AddVpsModal } from '@/components/vps/AddVpsModal';
import RefreshButton from '@/components/vps/RefreshButton';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Status' },
  { value: 'ONLINE', label: 'Online' },
  { value: 'OFFLINE', label: 'Offline' },
  { value: 'MAINTENANCE', label: 'Maintenance' }
];

type SortKey = 'name' | 'status' | 'createdAt';

export default function VpsListPage() {
  const router = useRouter();
  const [vpsList, setVpsList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [osFilter, setOsFilter] = useState('all');
  const [sortBy, setSortBy] = useState<SortKey>('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmBulk, setConfirmBulk] = useState<{ action: 'restart' | 'stop' | 'refresh' | 'delete'; message: string } | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { router.push('/login'); return; }
    setUser(JSON.parse(localStorage.getItem('user') || '{}'));
    const socket = io(API, { auth: { token }, transports: ['websocket', 'polling'] });
    socket.emit('subscribe_vps_list');
    socket.on('vps_event', (e: any) => {
      // Refresh list when VPS added/deleted/status changed
      if (e.type === 'ADDED' || e.type === 'DELETED' || e.type === 'STATUS_CHANGED') {
        fetchList(token);
      }
    });
    fetchList(token);
    return () => { socket.disconnect(); };
  }, [router]);

  const fetchList = async (token: string) => {
    try {
      const res = await fetch(`${API}/api/vps`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (Array.isArray(data)) setVpsList(data);
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  // Available OS (sadece mevcut olanlar)
  const availableOs = useMemo(() => {
    const set = new Set<string>();
    vpsList.forEach(v => {
      const label = v.os === 'OTHER' && v.customOsName ? v.customOsName : v.os;
      if (label) set.add(label);
    });
    return Array.from(set).sort();
  }, [vpsList]);

  const filtered = useMemo(() => {
    let list = [...vpsList];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(v =>
        v.name.toLowerCase().includes(q) ||
        v.ipAddress?.includes(q) ||
        v.os?.toLowerCase().includes(q) ||
        v.customOsName?.toLowerCase().includes(q)
      );
    }
    if (statusFilter !== 'all') list = list.filter(v => v.status === statusFilter);
    if (osFilter !== 'all') {
      list = list.filter(v => v.os === osFilter || v.customOsName === osFilter);
    }
    list.sort((a, b) => {
      let av = a[sortBy], bv = b[sortBy];
      if (sortBy === 'createdAt') {
        av = new Date(av).getTime(); bv = new Date(bv).getTime();
      } else {
        av = String(av || '').toLowerCase(); bv = String(bv || '').toLowerCase();
      }
      return sortAsc ? (av < bv ? -1 : 1) : (av > bv ? -1 : 1);
    });
    return list;
  }, [vpsList, searchQuery, statusFilter, osFilter, sortBy, sortAsc]);

  const toggleSelect = (id: string) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    if (selected.length === filtered.length) setSelected([]);
    else setSelected(filtered.map(v => v.id));
  };

  const handleBulkAction = async () => {
    if (!confirmBulk) return;
    const token = localStorage.getItem('token');
    const { action, message } = confirmBulk;
    setConfirmBulk(null);
    setToast({ type: 'success', message: `Bulk ${action} started for ${selected.length} VPS` });
    setSelected([]);
    setTimeout(() => setToast(null), 3000);

    try {
      if (action === 'delete') {
        if (user?.role !== 'ADMIN') {
          setToast({ type: 'error', message: 'Only admins can delete VPS' });
          return;
        }
        for (const id of selected) {
          await fetch(`${API}/api/vps/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
        }
      } else if (action === 'refresh') {
        await fetch(`${API}/api/vps/bulk/refresh`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ vpsIds: selected, command: 'refresh' })
        });
      } else {
        await fetch(`${API}/api/vps/bulk/command`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ vpsIds: selected, command: action })
        });
      }
    } catch (err) {
      setToast({ type: 'error', message: `Bulk ${action} failed` });
    }
  };

  const executeSingleAction = async (id: string, command: string) => {
    const token = localStorage.getItem('token');
    if (command === 'refresh') {
      setToast({ type: 'success', message: 'Refresh triggered' });
      setTimeout(() => setToast(null), 3000);
      await fetch(`${API}/api/vps/${id}/refresh`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      return;
    }
    if (!confirm(`Execute '${command}' on this VPS?`)) return;
    await fetch(`${API}/api/vps/${id}/command`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ command })
    });
  };

  const handleDelete = async (id: string) => {
    if (user?.role !== 'ADMIN') {
      setToast({ type: 'error', message: 'Only admins can delete' });
      setTimeout(() => setToast(null), 3000);
      return;
    }
    if (!confirm('Delete this VPS permanently?')) return;
    const token = localStorage.getItem('token');
    await fetch(`${API}/api/vps/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    setVpsList(vpsList.filter(v => v.id !== id));
  };

  if (loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-text-muted">
        <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin mb-4" />
        Loading Servers...
      </div>
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto pb-12">
      <header className="mb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-text-primary mb-2 flex items-center gap-3">
            <Server className="w-7 h-7 text-brand" /> VPS Inventory
          </h1>
          <p className="text-text-secondary text-sm">Manage all your virtual private servers.</p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              placeholder="Search name, IP, OS..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-neutral-bg2 border border-border-subtle rounded-xl text-text-primary focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-all text-sm"
            />
          </div>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 bg-brand hover:bg-brand-hover text-white px-4 py-2 rounded-xl transition-all shadow-glow text-sm font-medium whitespace-nowrap"
          >
            <Server className="w-4 h-4" /> Add VPS
          </button>
        </div>
      </header>

      {/* Filters */}
      <div className="bg-neutral-bg2/40 border border-border-subtle rounded-2xl p-3 mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 text-text-muted text-xs uppercase font-bold px-2">
          <Filter className="w-3.5 h-3.5" /> Filters
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-3 py-1.5 text-xs bg-neutral-bg1 border border-border-subtle rounded-lg text-text-primary">
          {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={osFilter} onChange={e => setOsFilter(e.target.value)} className="px-3 py-1.5 text-xs bg-neutral-bg1 border border-border-subtle rounded-lg text-text-primary">
          <option value="all">All OS</option>
          {availableOs.map(os => <option key={os} value={os}>{os} ({vpsList.filter(v => v.os === os || v.customOsName === os).length})</option>)}
        </select>
        <div className="ml-auto flex items-center gap-2">
          <select value={sortBy} onChange={e => setSortBy(e.target.value as SortKey)} className="px-3 py-1.5 text-xs bg-neutral-bg1 border border-border-subtle rounded-lg text-text-primary">
            <option value="name">Sort by Name</option>
            <option value="status">Sort by Status</option>
            <option value="createdAt">Sort by Created</option>
          </select>
          <button onClick={() => setSortAsc(!sortAsc)} className="p-1.5 bg-neutral-bg1 border border-border-subtle rounded-lg text-text-secondary hover:text-text-primary">
            <ArrowUpDown className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Bulk actions */}
      <AnimatePresence>
        {selected.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mb-4 flex items-center gap-2 bg-brand-subtle px-4 py-2 rounded-xl border border-brand/30"
          >
            <span className="text-xs font-semibold text-brand-light">{selected.length} selected</span>
            <button onClick={() => setConfirmBulk({ action: 'restart', message: `Restart ${selected.length} VPS?` })} className="flex items-center gap-1.5 text-xs bg-neutral-bg2 hover:bg-neutral-bg3 text-text-primary px-3 py-1.5 rounded-lg transition-colors border border-border-subtle">
              <RefreshCw className="w-3 h-3" /> Restart
            </button>
            <button onClick={() => setConfirmBulk({ action: 'stop', message: `Stop ${selected.length} VPS?` })} className="flex items-center gap-1.5 text-xs bg-status-error/20 hover:bg-status-error/30 text-status-error px-3 py-1.5 rounded-lg transition-colors border border-status-error/30">
              <PowerOff className="w-3 h-3" /> Stop
            </button>
            <button onClick={() => setConfirmBulk({ action: 'refresh', message: `Refresh ${selected.length} VPS?` })} className="flex items-center gap-1.5 text-xs bg-status-info/15 hover:bg-status-info/25 text-status-info px-3 py-1.5 rounded-lg transition-colors border border-status-info/30">
              <RefreshCw className="w-3 h-3" /> Refresh All
            </button>
            {user?.role === 'ADMIN' && (
              <button onClick={() => setConfirmBulk({ action: 'delete', message: `Permanently delete ${selected.length} VPS?` })} className="flex items-center gap-1.5 text-xs bg-status-error/20 hover:bg-status-error/30 text-status-error px-3 py-1.5 rounded-lg transition-colors border border-status-error/30">
                <Trash2 className="w-3 h-3" /> Delete
              </button>
            )}
            <button onClick={() => setSelected([])} className="ml-auto p-1 text-text-muted hover:text-text-primary">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-lg border ${toast.type === 'success' ? 'bg-status-success/10 border-status-success/30 text-status-success' : 'bg-status-error/10 border-status-error/30 text-status-error'}`}>
          {toast.message}
        </div>
      )}

      {confirmBulk && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setConfirmBulk(null)}>
          <div className="bg-neutral-bg2 border border-border-DEFAULT rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <p className="text-text-primary text-sm mb-6">{confirmBulk.message}</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirmBulk(null)} className="px-4 py-2 text-sm bg-neutral-bg3 text-text-primary rounded-xl">Cancel</button>
              <button onClick={handleBulkAction} className="px-4 py-2 text-sm bg-brand hover:bg-brand-hover text-white rounded-xl">Confirm</button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-neutral-bg1 border border-border-DEFAULT rounded-2xl shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-text-secondary">
            <thead className="bg-neutral-bg2 border-b border-border-subtle text-xs uppercase text-text-muted">
              <tr>
                <th className="px-3 py-4 w-10">
                  <input type="checkbox" checked={selected.length === filtered.length && filtered.length > 0} onChange={toggleSelectAll} className="w-4 h-4 rounded border-border-strong bg-neutral-bg1 text-brand" />
                </th>
                <th className="px-6 py-4 font-semibold">Name</th>
                <th className="px-6 py-4 font-semibold">IP Address</th>
                <th className="px-6 py-4 font-semibold">OS</th>
                <th className="px-6 py-4 font-semibold">Status</th>
                <th className="px-6 py-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-text-muted">
                    No servers found matching your criteria.
                  </td>
                </tr>
              ) : (
                filtered.map((vps) => (
                  <motion.tr
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    key={vps.id}
                    className="border-b border-border-subtle hover:bg-white/5 transition-colors"
                  >
                    <td className="px-3 py-4">
                      <input type="checkbox" checked={selected.includes(vps.id)} onChange={() => toggleSelect(vps.id)} className="w-4 h-4 rounded border-border-strong bg-neutral-bg1 text-brand" />
                    </td>
                    <td className="px-6 py-4 font-medium text-text-primary">
                      <button
                        onClick={() => router.push(`/vps/${vps.id}`)}
                        className="flex items-center gap-3 text-left hover:text-brand-light transition-colors"
                      >
                        <div className={`w-2 h-2 rounded-full ${vps.status === 'ONLINE' ? 'bg-status-success shadow-[0_0_8px_rgba(16,185,129,0.5)]' : vps.status === 'MAINTENANCE' ? 'bg-status-warning' : 'bg-status-error'}`} />
                        {vps.name}
                      </button>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs">{vps.ipAddress}</td>
                    <td className="px-6 py-4">
                      {vps.os === 'OTHER' && vps.customOsName ? vps.customOsName : vps.os}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-md text-[10px] font-bold tracking-wider uppercase ${
                        vps.status === 'ONLINE'
                          ? 'bg-status-success/10 text-status-success border border-status-success/20'
                          : vps.status === 'MAINTENANCE'
                          ? 'bg-status-warning/10 text-status-warning border border-status-warning/20'
                          : 'bg-status-error/10 text-status-error border border-status-error/20'
                      }`}>
                        {vps.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <RefreshButton vpsId={vps.id} className="p-1.5 text-status-info hover:bg-status-info/10 rounded-lg transition-colors" />
                        <button
                          onClick={() => executeSingleAction(vps.id, 'restart')}
                          className="p-1.5 text-text-primary hover:bg-neutral-bg3 rounded-lg transition-colors"
                          title="Restart VPS"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => executeSingleAction(vps.id, 'stop')}
                          className="p-1.5 text-status-error hover:bg-status-error/10 rounded-lg transition-colors"
                          title="Stop VPS"
                        >
                          <PowerOff className="w-4 h-4" />
                        </button>
                        {user?.role === 'ADMIN' && (
                          <button
                            onClick={() => handleDelete(vps.id)}
                            className="p-1.5 text-status-error hover:bg-status-error/10 rounded-lg transition-colors"
                            title="Delete VPS"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => router.push(`/vps/${vps.id}`)}
                          className="p-1.5 text-brand hover:bg-brand/10 rounded-lg transition-colors"
                          title="Open Detail"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AddVpsModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={(newVps) => setVpsList([newVps, ...vpsList])}
      />
    </div>
  );
}
