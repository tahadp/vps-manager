"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { use } from 'react';
import { ArrowLeft, History } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString();
}

export default function VpsAuditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { router.push('/login'); return; }
    fetch(`${API}/api/audit?vpsId=${id}&take=100`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { if (d.data) setLogs(d.data.filter((l: any) => l.target?.includes(id))); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id, router]);

  return (
    <div className="max-w-5xl mx-auto pb-12">
      <header className="mb-6 flex items-center gap-4">
        <button onClick={() => router.push(`/vps/${id}`)} className="w-10 h-10 rounded-xl bg-neutral-bg2 border border-border-DEFAULT flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-neutral-bg3 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary flex items-center gap-3">
            <History className="w-6 h-6 text-brand" /> Audit Log
          </h1>
          <p className="text-text-secondary text-sm">Activity history for this VPS.</p>
        </div>
      </header>

      {loading ? (
        <div className="h-full flex items-center justify-center text-text-muted py-12">Loading…</div>
      ) : logs.length === 0 ? (
        <div className="bg-neutral-bg2/40 border border-dashed border-border-strong rounded-2xl p-12 text-center text-text-muted">
          <History className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No activity yet for this VPS.</p>
        </div>
      ) : (
        <div className="bg-neutral-bg2/40 border border-border-subtle rounded-2xl overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-bg3 border-b border-border-subtle text-xs uppercase text-text-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">Time</th>
                <th className="px-4 py-3 font-semibold">Action</th>
                <th className="px-4 py-3 font-semibold">Details</th>
                <th className="px-4 py-3 font-semibold">User</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {logs.map(log => (
                <tr key={log.id} className="hover:bg-neutral-bg3 transition-colors">
                  <td className="px-4 py-3 text-text-secondary whitespace-nowrap">{formatTime(log.createdAt)}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 bg-neutral-bg4 text-text-primary rounded text-xs font-mono border border-border-subtle inline-block">
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-text-primary truncate max-w-xs">{log.target}</td>
                  <td className="px-4 py-3 text-text-secondary">{log.user?.email || log.userId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
