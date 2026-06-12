"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Settings() {
  const router = useRouter();
  
  // Telegram State
  const [token, setToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  
  // Rules State
  const [rules, setRules] = useState<any[]>([]);
  const [vpsList, setVpsList] = useState<any[]>([]);
  const [newRule, setNewRule] = useState({
    vpsId: '',
    metric: 'CPU',
    condition: '>',
    threshold: 90,
    durationMin: 10,
    action: 'NOTIFY_ONLY'
  });
  
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedToken = localStorage.getItem("token");
    if (!storedToken) {
      router.push("/login");
      return;
    }
    fetchData(storedToken);
  }, [router]);

  const fetchData = async (jwt: string) => {
    try {
      // Fetch Telegram Settings
      const resTel = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/settings/telegram`, {
        headers: { Authorization: `Bearer ${jwt}` }
      });
      if (resTel.ok) {
        const data = await resTel.json();
        setToken(data.telegramBotToken || '');
        setChatId(data.telegramChatId || '');
      }

      // Fetch VPS List
      const resVps = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/vps`, {
        headers: { Authorization: `Bearer ${jwt}` }
      });
      if (resVps.ok) {
        setVpsList(await resVps.json());
      }

      // Fetch Rules
      fetchRules(jwt);
    } catch (err) {}
    setLoading(false);
  };

  const fetchRules = async (jwt: string) => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/rules`, {
        headers: { Authorization: `Bearer ${jwt}` }
      });
      if (res.ok) {
        setRules(await res.json());
      }
    } catch (err) {}
  };

  const handleSaveTelegram = async () => {
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
      if (res.ok) setMsg("Telegram configuration saved.");
      else setError("Failed to save configuration.");
    } catch (err) {
      setError("An error occurred.");
    }
  };

  const handleTestTelegram = async () => {
    setMsg(""); setError("");
    const jwt = localStorage.getItem("token");
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/settings/telegram/test`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` }
      });
      const data = await res.json();
      if (res.ok) setMsg(data.message);
      else setError(data.error);
    } catch (err) {
      setError("Failed to send test message.");
    }
  };

  const handleAddRule = async () => {
    const jwt = localStorage.getItem("token");
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/rules`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwt}`
        },
        body: JSON.stringify(newRule)
      });
      if (res.ok) {
        fetchRules(jwt || "");
        alert("Rule added successfully.");
      } else {
        alert("Failed to add rule.");
      }
    } catch (err) {
      alert("Error adding rule.");
    }
  };

  const handleDeleteRule = async (id: string) => {
    if (!confirm("Delete this rule?")) return;
    const jwt = localStorage.getItem("token");
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/rules/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${jwt}` }
      });
      if (res.ok) {
        fetchRules(jwt || "");
      }
    } catch (err) {}
  };

  if (loading) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-white">Loading...</div>;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-8 font-sans">
      <div className="max-w-4xl mx-auto space-y-8">
        <header className="flex justify-between items-center mb-10">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Settings</h1>
            <p className="text-zinc-400 text-sm">Configure your personal preferences, integrations, and alerting rules.</p>
          </div>
          <button onClick={() => router.push('/')} className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl transition-colors text-sm font-medium">
            Back to Dashboard
          </button>
        </header>

        {/* Telegram Config */}
        <div className="bg-zinc-900/50 border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                <path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zM8.287 5.906c-.778.324-2.334.994-4.666 2.01-.378.15-.577.298-.595.442-.03.243.275.339.69.47l.175.055c.408.133.958.288 1.243.294.26.006.549-.1.868-.32 2.179-1.471 3.304-2.214 3.374-2.23.05-.012.12-.026.166.016.047.041.042.12.037.141-.03.129-1.227 1.241-1.846 1.817-.193.18-.33.307-.358.336a8.154 8.154 0 0 1-.188.186c-.38.366-.664.64.015 1.088.327.216.589.393.85.571.284.194.568.387.936.629.093.06.183.125.27.187.331.236.63.448.997.414.214-.02.435-.22.547-.82.265-1.417.786-4.486.906-5.751a1.426 1.426 0 0 0-.013-.315.337.337 0 0 0-.114-.217.526.526 0 0 0-.31-.093c-.3.005-.763.166-2.984 1.09z"/>
              </svg>
            </span>
            Telegram Configuration
          </h2>
          
          {error && <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-xl">{error}</div>}
          {msg && <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm rounded-xl">{msg}</div>}

          <div className="space-y-4 max-w-2xl">
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
              <button onClick={handleSaveTelegram} className="flex-1 p-3 bg-indigo-600 hover:bg-indigo-500 text-white transition-colors font-medium rounded-xl">
                Save Configuration
              </button>
              <button onClick={handleTestTelegram} className="px-6 p-3 bg-zinc-800 hover:bg-zinc-700 text-white transition-colors font-medium rounded-xl border border-white/5">
                Test Connection
              </button>
            </div>
          </div>
        </div>

        {/* Dynamic Alerting Rules */}
        <div className="bg-zinc-900/50 border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
            </span>
            Alerting Engine Rules
          </h2>
          <p className="text-zinc-400 text-sm mb-6">Create dynamic rules to monitor your servers. If a condition is met for the specified duration, the action will be triggered automatically.</p>

          <div className="bg-black/40 border border-white/5 rounded-xl p-4 mb-8">
            <h3 className="text-sm font-medium text-white mb-4">Add New Rule</h3>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-4">
              <div className="col-span-2 md:col-span-1">
                <label className="block text-[10px] uppercase text-zinc-500 mb-1">Target VPS</label>
                <select 
                  className="w-full p-2 bg-zinc-900 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500"
                  value={newRule.vpsId} onChange={e => setNewRule({...newRule, vpsId: e.target.value})}
                >
                  <option value="">All VPS</option>
                  {vpsList.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
              
              <div className="col-span-1">
                <label className="block text-[10px] uppercase text-zinc-500 mb-1">Metric</label>
                <select 
                  className="w-full p-2 bg-zinc-900 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500"
                  value={newRule.metric} onChange={e => setNewRule({...newRule, metric: e.target.value})}
                >
                  <option value="CPU">CPU</option>
                  <option value="RAM">RAM</option>
                  <option value="DISK">Disk</option>
                </select>
              </div>

              <div className="col-span-1">
                <label className="block text-[10px] uppercase text-zinc-500 mb-1">Condition</label>
                <select 
                  className="w-full p-2 bg-zinc-900 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500"
                  value={newRule.condition} onChange={e => setNewRule({...newRule, condition: e.target.value})}
                >
                  <option value=">">&gt; (Greater)</option>
                  <option value="<">&lt; (Less)</option>
                </select>
              </div>

              <div className="col-span-1">
                <label className="block text-[10px] uppercase text-zinc-500 mb-1">Threshold (%)</label>
                <input 
                  type="number" 
                  className="w-full p-2 bg-zinc-900 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500"
                  value={newRule.threshold} onChange={e => setNewRule({...newRule, threshold: Number(e.target.value)})}
                />
              </div>

              <div className="col-span-1">
                <label className="block text-[10px] uppercase text-zinc-500 mb-1">Duration (Min)</label>
                <input 
                  type="number" 
                  className="w-full p-2 bg-zinc-900 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500"
                  value={newRule.durationMin} onChange={e => setNewRule({...newRule, durationMin: Number(e.target.value)})}
                />
              </div>

              <div className="col-span-2 md:col-span-1">
                <label className="block text-[10px] uppercase text-zinc-500 mb-1">Action</label>
                <select 
                  className="w-full p-2 bg-zinc-900 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500"
                  value={newRule.action} onChange={e => setNewRule({...newRule, action: e.target.value})}
                >
                  <option value="NOTIFY_ONLY">Notify Only</option>
                  <option value="RESTART">Restart Services</option>
                </select>
              </div>
            </div>
            <button onClick={handleAddRule} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors">
              + Add Rule
            </button>
          </div>

          <div>
            <h3 className="text-sm font-medium text-white mb-4">Active Rules</h3>
            {rules.length === 0 ? (
              <div className="text-zinc-500 text-sm">No rules configured.</div>
            ) : (
              <div className="space-y-3">
                {rules.map(rule => (
                  <div key={rule.id} className="flex items-center justify-between p-4 bg-zinc-900/80 border border-white/5 rounded-xl">
                    <div className="flex flex-col">
                      <span className="text-white font-medium text-sm">
                        If {rule.vps ? rule.vps.name : 'ALL VPS'} {rule.metric} is {rule.condition} {rule.threshold}% for {rule.durationMin} minutes
                      </span>
                      <span className="text-zinc-400 text-xs mt-1">
                        Action: <strong className={rule.action === 'RESTART' ? 'text-red-400' : 'text-blue-400'}>{rule.action}</strong>
                      </span>
                    </div>
                    <button onClick={() => handleDeleteRule(rule.id)} className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
