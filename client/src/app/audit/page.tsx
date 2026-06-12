"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AuditLogs() {
  const router = useRouter();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/");
      return;
    }
    fetchLogs(token);
  }, [router]);

  const fetchLogs = async (token: string) => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/audit`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setLogs(await res.json());
      }
    } catch (err) {}
    setLoading(false);
  };

  if (loading) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-white">Loading...</div>;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-8 font-sans">
      <div className="max-w-6xl mx-auto">
        <header className="flex justify-between items-center mb-10">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Audit Logs</h1>
            <p className="text-zinc-400 text-sm">Track all actions performed on your servers.</p>
          </div>
          <button onClick={() => router.push('/')} className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl transition-colors text-sm font-medium">
            Back to Dashboard
          </button>
        </header>

        <div className="bg-zinc-900/50 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-xl">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/5 border-b border-white/10 text-xs uppercase text-zinc-400">
              <tr>
                <th className="px-6 py-4 font-medium">Time</th>
                <th className="px-6 py-4 font-medium">Action</th>
                <th className="px-6 py-4 font-medium">Target</th>
                <th className="px-6 py-4 font-medium">User</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {logs.length === 0 ? (
                <tr><td colSpan={4} className="px-6 py-8 text-center text-zinc-500">No logs found</td></tr>
              ) : logs.map(log => (
                <tr key={log.id} className="hover:bg-white/5 transition-colors">
                  <td className="px-6 py-4 text-zinc-400">{new Date(log.createdAt).toLocaleString()}</td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 bg-zinc-800 text-zinc-300 rounded text-xs font-mono border border-white/5">
                      {log.action}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-medium text-white">{log.target}</td>
                  <td className="px-6 py-4 text-zinc-400">{log.user?.email || log.userId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
