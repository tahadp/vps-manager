"use client";

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Server, Activity, TerminalSquare, Search, PowerOff, RefreshCw, Trash2, ShieldAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { AddVpsModal } from '@/components/vps/AddVpsModal';

export default function VpsListPage() {
  const router = useRouter();
  const [vpsList, setVpsList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }

    fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/vps`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setVpsList(data);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error("Failed to load VPS list", err);
        setLoading(false);
      });
  }, [router]);

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this VPS? This action cannot be undone.')) return;
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/vps/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setVpsList(vpsList.filter(v => v.id !== id));
      } else {
        alert('Failed to delete VPS. You may not have permission.');
      }
    } catch (err) {
      alert('Error deleting VPS');
    }
  };

  const executeCommand = async (id: string, command: string) => {
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/vps/${id}/command`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ command })
      });
      if (!res.ok) throw new Error('Command failed');
    } catch (err) {
      console.error(err);
      alert(`Failed to execute ${command} on VPS.`);
    }
  };

  const filteredList = vpsList.filter(vps => 
    vps.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    vps.ipAddress.includes(searchQuery)
  );

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
      <header className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-text-primary mb-2 flex items-center gap-3">
            <Server className="w-8 h-8 text-brand" />
            VPS Inventory
          </h1>
          <p className="text-text-secondary text-sm">
            Detailed list of all your virtual private servers.
          </p>
        </div>

        <div className="flex items-center gap-4 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input 
              type="text"
              placeholder="Search by name or IP..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-neutral-bg2 border border-border-subtle rounded-xl text-text-primary focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-all text-sm"
            />
          </div>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 bg-brand hover:bg-brand-hover text-white px-4 py-2 rounded-xl transition-all shadow-glow text-sm font-medium whitespace-nowrap"
          >
            <Server className="w-4 h-4" />
            Add VPS
          </button>
        </div>
      </header>

      <div className="bg-neutral-bg1 border border-border-DEFAULT rounded-2xl shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-text-secondary">
            <thead className="bg-neutral-bg2 border-b border-border-subtle text-xs uppercase text-text-muted">
              <tr>
                <th className="px-6 py-4 font-semibold">Name</th>
                <th className="px-6 py-4 font-semibold">IP Address</th>
                <th className="px-6 py-4 font-semibold">OS</th>
                <th className="px-6 py-4 font-semibold">Status</th>
                <th className="px-6 py-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredList.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-text-muted">
                    No servers found matching your criteria.
                  </td>
                </tr>
              ) : (
                filteredList.map((vps, idx) => (
                  <motion.tr 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    key={vps.id} 
                    className="border-b border-border-subtle hover:bg-white/5 transition-colors"
                  >
                    <td className="px-6 py-4 font-medium text-text-primary">
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${vps.status === 'ONLINE' ? 'bg-status-success shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-status-error'}`} />
                        {vps.name}
                      </div>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs">{vps.ipAddress}</td>
                    <td className="px-6 py-4">{vps.os}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-md text-[10px] font-bold tracking-wider uppercase ${
                        vps.status === 'ONLINE' 
                          ? 'bg-status-success/10 text-status-success border border-status-success/20' 
                          : 'bg-status-error/10 text-status-error border border-status-error/20'
                      }`}>
                        {vps.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button 
                          onClick={() => router.push(`/vps/${vps.id}`)}
                          className="p-1.5 text-brand hover:bg-brand/10 rounded-lg transition-colors"
                          title="Open Console"
                        >
                          <TerminalSquare className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => executeCommand(vps.id, 'restart')}
                          className="p-1.5 text-text-primary hover:bg-neutral-bg3 rounded-lg transition-colors"
                          title="Restart VPS"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => executeCommand(vps.id, 'stop')}
                          className="p-1.5 text-status-error hover:bg-status-error/10 rounded-lg transition-colors"
                          title="Stop VPS"
                        >
                          <PowerOff className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleDelete(vps.id)}
                          className="p-1.5 text-status-error hover:bg-status-error/10 rounded-lg transition-colors"
                          title="Delete VPS"
                        >
                          <Trash2 className="w-4 h-4" />
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
