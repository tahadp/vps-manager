"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Shield, Search, Filter, CheckCircle2, Ban, Server as ServerIcon, Mail, Calendar, AlertTriangle } from "lucide-react";
import { api, getStoredUser } from "@/lib/api";

export default function AdminUsers() {
  const router = useRouter();
  const [users, setUsers] = useState<any[]>([]);
  const [vpsCount, setVpsCount] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'PENDING' | 'APPROVED' | 'BANNED'>('all');
  const [confirm, setConfirm] = useState<{ id: string; status: string; name: string } | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    const storedUser = getStoredUser();
    if (!storedUser || storedUser.role !== 'ADMIN') {
      router.push("/");
      return;
    }
    setUser(storedUser);
    fetchUsers();
  }, [router]);

  const fetchUsers = async () => {
    try {
      const data = await api<any[]>('/api/admin/users');
      setUsers(data);

      const vps = await api<any[]>('/api/vps');
      const counts: Record<string, number> = {};
      vps.forEach((v: any) => { counts[v.userId] = (counts[v.userId] || 0) + 1; });
      setVpsCount(counts);
    } catch (err) {}
    setLoading(false);
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      await api(`/api/admin/users/${id}/status`, {
        method: 'PUT',
        json: { status }
      });
      setToast({ type: 'success', message: `User ${status === 'APPROVED' ? 'approved' : status === 'BANNED' ? 'banned' : 'updated'}` });
      setTimeout(() => setToast(null), 3000);
      fetchUsers();
    } catch {
      setToast({ type: 'error', message: 'Update failed' });
      setTimeout(() => setToast(null), 3000);
    }
  };

  const updateTier = async (id: string, tier: 'FREE' | 'PRO') => {
    try {
      await api(`/api/admin/users/${id}/tier`, {
        method: 'PUT',
        json: { tier }
      });
      setUsers(prev => prev.map(u => (u.id === id ? { ...u, tier } : u)));
      setToast({ type: 'success', message: `Tier set to ${tier}` });
      setTimeout(() => setToast(null), 3000);
    } catch {
      setToast({ type: 'error', message: 'Tier update failed' });
      setTimeout(() => setToast(null), 3000);
    }
  };

  const filtered = users.filter(u => {
    if (statusFilter !== 'all' && u.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return u.email.toLowerCase().includes(q) || (u.username || '').toLowerCase().includes(q);
    }
    return true;
  });

  const counts = {
    total: users.length,
    pending: users.filter(u => u.status === 'PENDING').length,
    approved: users.filter(u => u.status === 'APPROVED').length,
    banned: users.filter(u => u.status === 'BANNED').length
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-text-muted">Loading…</div>;

  return (
    <div className="max-w-6xl mx-auto pb-12">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-text-primary mb-2 flex items-center gap-3">
          <Shield className="w-7 h-7 text-brand" /> User Management
        </h1>
        <p className="text-text-secondary text-sm">Approve, ban, or audit users on the platform.</p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-neutral-bg2/80 border border-border-DEFAULT rounded-2xl p-4">
          <div className="text-xs uppercase font-bold text-text-muted tracking-wider">Total</div>
          <div className="text-2xl font-bold text-text-primary mt-1">{counts.total}</div>
        </div>
        <div className="bg-status-warning/10 border border-status-warning/20 rounded-2xl p-4">
          <div className="text-xs uppercase font-bold text-status-warning tracking-wider">Pending</div>
          <div className="text-2xl font-bold text-status-warning mt-1">{counts.pending}</div>
        </div>
        <div className="bg-status-success/10 border border-status-success/20 rounded-2xl p-4">
          <div className="text-xs uppercase font-bold text-status-success tracking-wider">Approved</div>
          <div className="text-2xl font-bold text-status-success mt-1">{counts.approved}</div>
        </div>
        <div className="bg-status-error/10 border border-status-error/20 rounded-2xl p-4">
          <div className="text-xs uppercase font-bold text-status-error tracking-wider">Banned</div>
          <div className="text-2xl font-bold text-status-error mt-1">{counts.banned}</div>
        </div>
      </div>

      <div className="bg-neutral-bg2/40 border border-border-subtle rounded-2xl p-3 mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 text-text-muted text-xs uppercase font-bold px-2">
          <Filter className="w-3.5 h-3.5" /> Filters
        </div>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Search email or username…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-sm bg-neutral-bg1 border border-border-subtle rounded-lg text-text-primary focus:outline-none focus:border-brand"
          />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} className="px-3 py-1.5 text-xs bg-neutral-bg1 border border-border-subtle rounded-lg text-text-primary">
          <option value="all">All Status</option>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="BANNED">Banned</option>
        </select>
      </div>

      {toast && (
        <div className={`mb-4 p-3 rounded-xl border text-sm ${toast.type === 'success' ? 'bg-status-success/10 border-status-success/30 text-status-success' : 'bg-status-error/10 border-status-error/30 text-status-error'}`}>
          {toast.message}
        </div>
      )}

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setConfirm(null)}>
          <div className="bg-neutral-bg2 border border-border-DEFAULT rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <p className="text-text-primary text-sm mb-6">
              {confirm.status === 'BANNED' ? `Ban ${confirm.name}? They won't be able to log in.` : `Approve ${confirm.name}?`}
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirm(null)} className="px-4 py-2 text-sm bg-neutral-bg3 text-text-primary rounded-xl">Cancel</button>
              <button
                onClick={() => { updateStatus(confirm.id, confirm.status); setConfirm(null); }}
                className={`px-4 py-2 text-sm text-white rounded-xl ${confirm.status === 'BANNED' ? 'bg-status-error hover:bg-status-error/80' : 'bg-status-success hover:bg-status-success/80'}`}
              >
                {confirm.status === 'BANNED' ? 'Ban' : 'Approve'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-neutral-bg2/40 border border-border-subtle rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-bg3 border-b border-border-subtle text-xs uppercase text-text-muted">
              <tr>
                <th className="px-6 py-4 font-semibold">User</th>
                <th className="px-6 py-4 font-semibold">Role</th>
                <th className="px-6 py-4 font-semibold">Status</th>
                <th className="px-6 py-4 font-semibold">Tier</th>
                <th className="px-6 py-4 font-semibold">VPS</th>
                <th className="px-6 py-4 font-semibold">Joined</th>
                <th className="px-6 py-4 font-semibold">Last Login</th>
                <th className="px-6 py-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-text-muted">No users found.</td>
                </tr>
              ) : filtered.map(u => (
                <tr key={u.id} className="hover:bg-neutral-bg3 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-medium text-text-primary">{u.username || u.email.split('@')[0]}</div>
                    <div className="text-xs text-text-muted flex items-center gap-1 mt-0.5"><Mail className="w-3 h-3" /> {u.email}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-md text-[10px] uppercase font-bold tracking-wider ${u.role === 'ADMIN' ? 'bg-brand/15 text-brand-light' : 'bg-neutral-bg4 text-text-secondary'}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-md text-[10px] uppercase font-bold tracking-wider ${
                      u.status === 'APPROVED' ? 'bg-status-success/10 text-status-success border border-status-success/20' :
                      u.status === 'BANNED' ? 'bg-status-error/10 text-status-error border border-status-error/20' :
                      'bg-status-warning/10 text-status-warning border border-status-warning/20'
                    }`}>
                      {u.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <select
                      value={u.tier || 'FREE'}
                      onChange={e => updateTier(u.id, e.target.value as 'FREE' | 'PRO')}
                      disabled={u.id === user.id}
                      className="px-2 py-1 text-xs bg-neutral-bg1 border border-border-subtle rounded-lg text-text-primary focus:outline-none focus:border-brand disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <option value="FREE">FREE</option>
                      <option value="PRO">PRO</option>
                    </select>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-xs text-text-secondary flex items-center gap-1"><ServerIcon className="w-3 h-3" /> {vpsCount[u.id] || 0}</span>
                  </td>
                  <td className="px-6 py-4 text-xs text-text-secondary">
                    {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-6 py-4 text-xs text-text-secondary">
                    {u.lastLogin ? new Date(u.lastLogin).toLocaleString() : <span className="text-text-muted">Never</span>}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {u.status !== 'APPROVED' && (
                        <button onClick={() => setConfirm({ id: u.id, status: 'APPROVED', name: u.email })} className="text-xs px-3 py-1.5 bg-status-success/10 text-status-success hover:bg-status-success/20 rounded-lg border border-status-success/20">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {u.status !== 'BANNED' && u.id !== user.id && (
                        <button onClick={() => setConfirm({ id: u.id, status: 'BANNED', name: u.email })} className="text-xs px-3 py-1.5 bg-status-error/10 text-status-error hover:bg-status-error/20 rounded-lg border border-status-error/20">
                          <Ban className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
