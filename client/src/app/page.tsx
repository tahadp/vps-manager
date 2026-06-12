"use client";
import { useState, useEffect } from "react";
import io from "socket.io-client";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";

export default function Dashboard() {
  const router = useRouter();
  const [vpsList, setVpsList] = useState<any[]>([]);
  const [metricsMap, setMetricsMap] = useState<Record<string, any>>({});
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    const token = localStorage.getItem("token");
    const storedUser = localStorage.getItem("user");
    
    if (!token) {
      router.push("/login");
      return;
    }
    setUser(JSON.parse(storedUser || '{}'));

    fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/vps`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (!Array.isArray(data)) return;
        setVpsList(data);
        setLoading(false);

        const socket = io(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000', {
          auth: { token }
        });

        socket.on('connect', () => {
          data.forEach(vps => socket.emit('subscribe_vps', vps.id));
        });

        socket.on('telemetry_update', (update) => {
          setMetricsMap(prev => ({ ...prev, [update.vpsId]: update }));
        });

        return () => socket.disconnect();
      })
      .catch(() => {
        setLoading(false);
      });
  }, [router]);

  if (loading) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-white">Loading...</div>;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex font-sans selection:bg-indigo-500/30">
      {/* Sidebar */}
      <aside className="w-64 border-r border-white/10 bg-black/20 backdrop-blur-xl p-6 hidden md:flex flex-col">
        <div className="flex items-center gap-3 mb-10">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center font-bold">V</div>
          <h1 className="text-xl font-semibold tracking-tight text-white">VPS Manager</h1>
        </div>
        <nav className="flex-1 space-y-2">
          <a href="#" className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/10 text-white font-medium transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path></svg>
            Dashboard
          </a>
          {user?.role === 'ADMIN' && (
            <a href="/admin" className="flex items-center gap-3 px-3 py-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
              User Management
            </a>
          )}
          <a href="/audit" className="flex items-center gap-3 px-3 py-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"></path></svg>
            Audit Logs
          </a>
          <a href="/settings" className="flex items-center gap-3 px-3 py-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
            Settings
          </a>
        </nav>
        <div className="pt-4 border-t border-white/10">
          <button onClick={() => { localStorage.clear(); router.push('/login'); }} className="flex items-center gap-3 px-3 py-2 w-full rounded-lg text-red-400 hover:bg-red-400/10 transition-colors text-left">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
        {/* Subtle background glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[300px] bg-indigo-500/20 blur-[120px] rounded-full pointer-events-none"></div>

        <header className="h-16 flex items-center justify-between px-8 border-b border-white/5 z-10 bg-zinc-950/50 backdrop-blur-md">
          <h2 className="text-lg font-medium">Servers</h2>
          <div className="flex items-center gap-4">
            <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-colors" title="Toggle Theme">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path></svg>
            </button>
            <div className="text-sm text-zinc-400">{user?.email}</div>
            <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700"></div>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-8 z-10">
          {vpsList.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-zinc-500">
              <svg className="w-16 h-16 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01"></path></svg>
              <p>No servers assigned to your account.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-6">
              {vpsList.map(vps => {
                const m = metricsMap[vps.id] || { CPUUsage: 0, RAMUsage: 0, NetTx: 0, NetRx: 0 };
                return (
                  <div key={vps.id} className="group relative bg-zinc-900/50 backdrop-blur-xl border border-white/10 p-5 rounded-2xl overflow-hidden hover:border-indigo-500/50 transition-colors">
                    {/* Glassmorphism reflection */}
                    <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
                    
                    <div className="flex justify-between items-start mb-6">
                      <div>
                        <h3 className="text-lg font-medium text-white flex items-center gap-2">
                          {vps.name}
                          <span className="flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                          </span>
                        </h3>
                        <p className="text-xs text-zinc-400 mt-1">{vps.ipAddress} • {vps.os}</p>
                      </div>
                      <button onClick={() => router.push(`/vps/${vps.id}`)} className="bg-white/5 hover:bg-white/10 text-white text-xs px-3 py-1.5 rounded-lg border border-white/10 transition-colors">
                        Details
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      {/* CPU */}
                      <div className="bg-black/20 rounded-xl p-3 border border-white/5">
                        <div className="text-xs text-zinc-500 mb-2 flex justify-between">
                          <span>CPU</span>
                          <span className="text-zinc-300">{m.CPUUsage.toFixed(1)}%</span>
                        </div>
                        <div className="w-full bg-zinc-800/50 rounded-full h-1.5">
                          <div className="bg-gradient-to-r from-indigo-500 to-indigo-400 h-1.5 rounded-full transition-all duration-300" style={{ width: `${Math.min(m.CPUUsage, 100)}%` }}></div>
                        </div>
                      </div>

                      {/* RAM */}
                      <div className="bg-black/20 rounded-xl p-3 border border-white/5">
                        <div className="text-xs text-zinc-500 mb-2 flex justify-between">
                          <span>Memory</span>
                          <span className="text-zinc-300">{m.RAMUsage.toFixed(1)}%</span>
                        </div>
                        <div className="w-full bg-zinc-800/50 rounded-full h-1.5">
                          <div className="bg-gradient-to-r from-purple-500 to-purple-400 h-1.5 rounded-full transition-all duration-300" style={{ width: `${Math.min(m.RAMUsage, 100)}%` }}></div>
                        </div>
                      </div>
                    </div>

                    {/* Network & Actions */}
                    <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between">
                      <div className="text-[10px] text-zinc-500 flex gap-3">
                        <span className="flex items-center gap-1"><svg className="w-3 h-3 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 10l7-7m0 0l7 7m-7-7v18"></path></svg> {(m.NetTx / 1024).toFixed(1)} KB/s</span>
                        <span className="flex items-center gap-1"><svg className="w-3 h-3 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"></path></svg> {(m.NetRx / 1024).toFixed(1)} KB/s</span>
                      </div>
                      <div className="flex gap-2">
                        <button className="p-1.5 hover:bg-white/10 rounded-md text-zinc-400 hover:text-white transition-colors" title="Restart">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                        </button>
                        <button className="p-1.5 hover:bg-white/10 rounded-md text-zinc-400 hover:text-red-400 transition-colors" title="Power Off">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
