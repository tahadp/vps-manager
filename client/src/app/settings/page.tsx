"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Settings() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const storedToken = localStorage.getItem("token");
    if (!storedToken) {
      router.push("/login");
      return;
    }
    fetchSettings(storedToken);
  }, [router]);

  const fetchSettings = async (jwt: string) => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/settings/telegram`, {
        headers: { Authorization: `Bearer ${jwt}` }
      });
      if (res.ok) {
        const data = await res.json();
        setToken(data.telegramBotToken);
        setChatId(data.telegramChatId);
      }
    } catch (err) {}
    setLoading(false);
  };

  const handleSave = async () => {
    setMsg(""); setError("");
    const jwt = localStorage.getItem("token");
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/settings/telegram`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwt}`
        },
        body: JSON.stringify({ telegramBotToken: token, telegramChatId: chatId })
      });
      if (res.ok) {
        setMsg("Telegram configuration saved.");
      } else {
        setError("Failed to save configuration.");
      }
    } catch (err) {
      setError("An error occurred.");
    }
  };

  const handleTest = async () => {
    setMsg(""); setError("");
    const jwt = localStorage.getItem("token");
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/settings/telegram/test`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` }
      });
      const data = await res.json();
      if (res.ok) {
        setMsg(data.message);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError("Failed to send test message.");
    }
  };

  if (loading) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-white">Loading...</div>;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-8 font-sans">
      <div className="max-w-2xl mx-auto">
        <header className="flex justify-between items-center mb-10">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Settings</h1>
            <p className="text-zinc-400 text-sm">Configure your personal preferences and integrations.</p>
          </div>
          <button onClick={() => router.push('/')} className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl transition-colors text-sm font-medium">
            Back to Dashboard
          </button>
        </header>

        <div className="bg-zinc-900/50 border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                <path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zM8.287 5.906c-.778.324-2.334.994-4.666 2.01-.378.15-.577.298-.595.442-.03.243.275.339.69.47l.175.055c.408.133.958.288 1.243.294.26.006.549-.1.868-.32 2.179-1.471 3.304-2.214 3.374-2.23.05-.012.12-.026.166.016.047.041.042.12.037.141-.03.129-1.227 1.241-1.846 1.817-.193.18-.33.307-.358.336a8.154 8.154 0 0 1-.188.186c-.38.366-.664.64.015 1.088.327.216.589.393.85.571.284.194.568.387.936.629.093.06.183.125.27.187.331.236.63.448.997.414.214-.02.435-.22.547-.82.265-1.417.786-4.486.906-5.751a1.426 1.426 0 0 0-.013-.315.337.337 0 0 0-.114-.217.526.526 0 0 0-.31-.093c-.3.005-.763.166-2.984 1.09z"/>
              </svg>
            </span>
            Telegram Alerts
          </h2>
          <p className="text-zinc-400 text-sm mb-6">Receive real-time notifications for critical VPS events (e.g., Disk &gt; 95%, CPU spikes).</p>

          {error && <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-xl">{error}</div>}
          {msg && <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm rounded-xl">{msg}</div>}

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase tracking-wider">Bot Token</label>
              <input 
                type="text" 
                className="w-full p-3 rounded-xl bg-black/40 border border-white/10 focus:outline-none focus:border-indigo-500 text-white" 
                value={token} onChange={(e) => setToken(e.target.value)}
                placeholder="123456789:ABCdefGHIjklMNOpqrSTUvwxYZ"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase tracking-wider">Chat ID</label>
              <input 
                type="text" 
                className="w-full p-3 rounded-xl bg-black/40 border border-white/10 focus:outline-none focus:border-indigo-500 text-white" 
                value={chatId} onChange={(e) => setChatId(e.target.value)}
                placeholder="-1001234567890"
              />
            </div>
            
            <div className="flex gap-3 pt-4 border-t border-white/10">
              <button onClick={handleSave} className="flex-1 p-3 bg-indigo-600 hover:bg-indigo-500 text-white transition-colors font-medium rounded-xl">
                Save Configuration
              </button>
              <button onClick={handleTest} className="px-6 p-3 bg-zinc-800 hover:bg-zinc-700 text-white transition-colors font-medium rounded-xl border border-white/5">
                Test Connection
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
