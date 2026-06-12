"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function VpsDetail({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { id } = params;
  const [vps, setVps] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }
    
    fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/vps/${id}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    .then(res => res.json())
    .then(data => {
      setVps(data);
      setLoading(false);
    })
    .catch(() => setLoading(false));
  }, [id, router]);

  if (loading) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-white">Loading...</div>;
  if (!vps) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-white">VPS not found or unauthorized</div>;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">{vps.name}</h1>
            <p className="text-zinc-400 text-sm mt-1">{vps.ipAddress} • {vps.os}</p>
          </div>
          <button onClick={() => router.push('/')} className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl transition-colors text-sm font-medium">
            Back to Dashboard
          </button>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Terminal View */}
          <div className="lg:col-span-2 bg-zinc-900/50 border border-white/10 rounded-2xl p-6 backdrop-blur-xl flex flex-col h-[600px]">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-white">Remote Terminal (Web PTY)</h2>
              <div className="flex gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
              </div>
            </div>
            <div className="flex-1 bg-black/80 rounded-xl border border-white/5 font-mono text-sm p-4 overflow-hidden relative">
              <div className="text-zinc-500 mb-2">Connected to {vps.ipAddress} as root</div>
              <div className="text-green-400">root@{vps.name}:~# <span className="animate-pulse">_</span></div>
              
              <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                <button className="px-4 py-2 bg-indigo-600 rounded-lg font-sans font-medium hover:bg-indigo-500 transition-colors">
                  Connect Terminal
                </button>
              </div>
            </div>
          </div>

          {/* Details & Actions */}
          <div className="space-y-6">
            <div className="bg-zinc-900/50 border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
              <h2 className="text-lg font-semibold text-white mb-4">Quick Actions</h2>
              <div className="space-y-3">
                <button className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-sm font-medium transition-colors border border-white/5 flex items-center justify-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/><path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/></svg>
                  Stop Server
                </button>
                <button className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-sm font-medium transition-colors border border-white/5 flex items-center justify-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/><path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/></svg>
                  Restart Server
                </button>
                <button className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M0 4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V4zm2-1a1 1 0 0 0-1 1v.217l7 4.2 7-4.2V4a1 1 0 0 0-1-1H2zm13 2.383-4.708 2.825L15 11.105V5.383zm-.034 6.876-5.64-3.471L8 9.583l-1.326-.795-5.64 3.47A1 1 0 0 0 2 13h12a1 1 0 0 0 .966-.741zM1 11.105l4.708-2.897L1 5.383v5.722z"/></svg>
                  Open Rustdesk Viewer
                </button>
              </div>
            </div>

            <div className="bg-zinc-900/50 border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
              <h2 className="text-lg font-semibold text-white mb-4">Detailed Metrics</h2>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-zinc-400">CPU Usage</span>
                    <span className="text-white">12%</span>
                  </div>
                  <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 w-[12%]"></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-zinc-400">Memory (RAM)</span>
                    <span className="text-white">45%</span>
                  </div>
                  <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500 w-[45%]"></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-zinc-400">Disk I/O</span>
                    <span className="text-white">8%</span>
                  </div>
                  <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full bg-purple-500 w-[8%]"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
