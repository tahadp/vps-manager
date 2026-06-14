"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Settings as SettingsIcon, MessageCircle, Shield, Bell, Plus, Trash2, Key, CheckCircle2, AlertCircle, BarChart3 } from "lucide-react";
import { api, getStoredUser } from "@/lib/api";

const CHART_METRICS = ['cpu', 'ram', 'disk', 'network'] as const;
type ChartMetric = typeof CHART_METRICS[number];

export default function Settings() {
  const router = useRouter();

  // Telegram State
  const [token, setToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [telegramMsg, setTelegramMsg] = useState("");
  const [telegramError, setTelegramError] = useState("");

  // Password State
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pwdMsg, setPwdMsg] = useState("");
  const [pwdError, setPwdError] = useState("");

  // Rules State
  const [rules, setRules] = useState<any[]>([]);
  const [vpsList, setVpsList] = useState<any[]>([]);
  const [newRule, setNewRule] = useState({
    vpsId: '',
    metric: 'CPU',
    condition: '>',
    threshold: 90,
    durationMin: 10,
    action: 'ALERT',
    script: ''
  });

  // F0-18: User-level chartVisibleMetrics
  const [chartVisibleMetrics, setChartVisibleMetrics] = useState<ChartMetric[]>([...CHART_METRICS]);
  const [chartMsg, setChartMsg] = useState("");
  const [chartError, setChartError] = useState("");

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getStoredUser()) {
      router.push("/login");
      return;
    }
    fetchData();
  }, [router]);

  const fetchData = async () => {
    try {
      const dataTel = await api<{ telegramBotToken?: string; telegramChatId?: string }>('/api/settings/telegram');
      setToken(dataTel.telegramBotToken || '');
      setChatId(dataTel.telegramChatId || '');

      const dataVps = await api<any[]>('/api/vps');
      setVpsList(dataVps);

      const prefs = await api<{ chartVisibleMetrics?: string[] }>('/api/settings/preferences');
      if (Array.isArray(prefs.chartVisibleMetrics) && prefs.chartVisibleMetrics.length > 0) {
        setChartVisibleMetrics(prefs.chartVisibleMetrics as ChartMetric[]);
      }

      fetchRules();
    } catch (err) {}
    setLoading(false);
  };

  const fetchRules = async () => {
    try {
      const data = await api<any[]>('/api/rules');
      setRules(data);
    } catch (err) {}
  };

  const handleSaveTelegram = async () => {
    setTelegramMsg(""); setTelegramError("");
    try {
      await api('/api/settings/telegram', {
        method: 'POST',
        json: { telegramBotToken: token, telegramChatId: chatId }
      });
      setTelegramMsg("Telegram configuration saved successfully.");
    } catch (err: any) {
      setTelegramError(err?.message || "Failed to save configuration.");
    }
  };

  const handleTestTelegram = async () => {
    setTelegramMsg(""); setTelegramError("");
    try {
      const data = await api<{ message?: string; error?: string }>('/api/settings/telegram/test', { method: 'POST' });
      setTelegramMsg(data.message || "Test sent");
    } catch (err: any) {
      setTelegramError(err?.message || "Failed to send test message.");
    }
  };

  const handleSaveCharts = async () => {
    setChartMsg(""); setChartError("");
    try {
      await api('/api/settings/preferences', {
        method: 'PUT',
        json: { chartVisibleMetrics }
      });
      setChartMsg("Chart preferences saved.");
    } catch (err: any) {
      setChartError(err?.message || "Failed to save chart preferences.");
    }
  };

  const toggleChart = (m: ChartMetric) => {
    setChartVisibleMetrics(prev =>
      prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]
    );
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdMsg(""); setPwdError("");
    try {
      await api('/api/auth/change-password', {
        method: 'POST',
        json: { oldPassword, newPassword }
      });
      setPwdMsg("Password changed successfully.");
      setOldPassword("");
      setNewPassword("");
    } catch (err: any) {
      setPwdError(err?.message || "Failed to change password.");
    }
  };

  const handleAddRule = async () => {
    try {
      await api('/api/rules', { method: 'POST', json: newRule });
      fetchRules();
      alert("Rule added successfully.");
    } catch (err: any) {
      alert(err?.message || "Error adding rule.");
    }
  };

  const handleDeleteRule = async (id: string) => {
    if (!confirm("Delete this rule?")) return;
    try {
      await api(`/api/rules/${id}`, { method: 'DELETE' });
      fetchRules();
    } catch (err) {}
  };

  if (loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-text-muted">
        <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin mb-4" />
        Loading settings...
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-12">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-text-primary mb-2 flex items-center gap-3">
          <SettingsIcon className="w-8 h-8 text-brand" />
          Platform Settings
        </h1>
        <p className="text-text-secondary text-sm">
          Configure your personal preferences, security, integrations, and alerting rules.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Security & Integrations */}
        <div className="lg:col-span-5 space-y-8">
          
          {/* Change Password */}
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-neutral-bg2 border border-border-DEFAULT rounded-2xl p-6 shadow-sm"
          >
            <h2 className="text-lg font-bold text-text-primary mb-4 flex items-center gap-2">
              <Shield className="w-5 h-5 text-dataviz-purple" />
              Account Security
            </h2>
            
            {pwdError && <div className="mb-4 p-3 bg-status-error/10 border border-status-error/20 text-status-error text-sm rounded-xl flex items-start gap-2"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5"/>{pwdError}</div>}
            {pwdMsg && <div className="mb-4 p-3 bg-status-success/10 border border-status-success/20 text-status-success text-sm rounded-xl flex items-start gap-2"><CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5"/>{pwdMsg}</div>}

            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-text-muted mb-1.5 uppercase tracking-wider">Current Password</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Key className="w-4 h-4 text-text-muted" />
                  </div>
                  <input 
                    type="password" 
                    required
                    className="w-full pl-10 p-2.5 rounded-xl bg-neutral-bg1 border border-border-DEFAULT focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand text-text-primary placeholder:text-text-muted/50 transition-all" 
                    value={oldPassword} onChange={(e) => setOldPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-muted mb-1.5 uppercase tracking-wider">New Password</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Key className="w-4 h-4 text-text-muted" />
                  </div>
                  <input 
                    type="password" 
                    required
                    className="w-full pl-10 p-2.5 rounded-xl bg-neutral-bg1 border border-border-DEFAULT focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand text-text-primary placeholder:text-text-muted/50 transition-all" 
                    value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                </div>
              </div>
              
              <div className="pt-2">
                <button type="submit" className="w-full p-2.5 bg-brand hover:bg-brand-hover text-white transition-colors font-medium rounded-xl shadow-glow">
                  Update Password
                </button>
              </div>
            </form>
          </motion.div>

          {/* Telegram Config */}
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-neutral-bg2 border border-border-DEFAULT rounded-2xl p-6 shadow-sm"
          >
            <h2 className="text-lg font-bold text-text-primary mb-4 flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-dataviz-blue" />
              Telegram Integration
            </h2>
            
            {telegramError && <div className="mb-4 p-3 bg-status-error/10 border border-status-error/20 text-status-error text-sm rounded-xl flex items-start gap-2"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5"/>{telegramError}</div>}
            {telegramMsg && <div className="mb-4 p-3 bg-status-success/10 border border-status-success/20 text-status-success text-sm rounded-xl flex items-start gap-2"><CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5"/>{telegramMsg}</div>}

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-text-muted mb-1.5 uppercase tracking-wider">Bot Token</label>
                <input 
                  type="text" 
                  className="w-full p-2.5 rounded-xl bg-neutral-bg1 border border-border-DEFAULT focus:outline-none focus:border-dataviz-blue focus:ring-1 focus:ring-dataviz-blue text-text-primary placeholder:text-text-muted/50 transition-all" 
                  value={token} onChange={(e) => setToken(e.target.value)}
                  placeholder="123456789:ABCdefGHIjklMNOpqrSTUvwxYZ"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-muted mb-1.5 uppercase tracking-wider">Chat ID</label>
                <input 
                  type="text" 
                  className="w-full p-2.5 rounded-xl bg-neutral-bg1 border border-border-DEFAULT focus:outline-none focus:border-dataviz-blue focus:ring-1 focus:ring-dataviz-blue text-text-primary placeholder:text-text-muted/50 transition-all" 
                  value={chatId} onChange={(e) => setChatId(e.target.value)}
                  placeholder="-1001234567890"
                />
              </div>
              
              <div className="flex gap-3 pt-2">
                <button onClick={handleSaveTelegram} className="flex-1 p-2.5 bg-neutral-bg4 hover:bg-neutral-bg5 text-white transition-colors font-medium rounded-xl border border-border-subtle">
                  Save
                </button>
                <button onClick={handleTestTelegram} className="flex-1 p-2.5 bg-dataviz-blue/20 hover:bg-dataviz-blue/30 text-dataviz-blue transition-colors font-medium rounded-xl border border-dataviz-blue/30">
                  Test Ping
                </button>
              </div>
             </div>
           </motion.div>

           {/* F0-18: User-level chart preferences */}
           <motion.div
             initial={{ opacity: 0, y: 10 }}
             animate={{ opacity: 1, y: 0 }}
             transition={{ delay: 0.15 }}
             className="bg-neutral-bg2 border border-border-DEFAULT rounded-2xl p-6 shadow-sm"
           >
             <h2 className="text-lg font-bold text-text-primary mb-2 flex items-center gap-2">
               <BarChart3 className="w-5 h-5 text-dataviz-blue" />
               Default Dashboard Charts
             </h2>
             <p className="text-text-secondary text-sm mb-4">
               Choose which metric cards to show by default on each VPS detail page. Per-VPS overrides in the VPS settings still win.
             </p>

             {chartError && <div className="mb-4 p-3 bg-status-error/10 border border-status-error/20 text-status-error text-sm rounded-xl flex items-start gap-2"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5"/>{chartError}</div>}
             {chartMsg && <div className="mb-4 p-3 bg-status-success/10 border border-status-success/20 text-status-success text-sm rounded-xl flex items-start gap-2"><CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5"/>{chartMsg}</div>}

             <div className="grid grid-cols-2 gap-2 mb-4">
               {CHART_METRICS.map(m => (
                 <label
                   key={m}
                   className={`flex items-center gap-2 p-3 rounded-xl border cursor-pointer transition-colors ${
                     chartVisibleMetrics.includes(m)
                       ? 'bg-brand/10 border-brand/40 text-text-primary'
                       : 'bg-neutral-bg1 border-border-DEFAULT text-text-muted hover:border-border-strong'
                   }`}
                 >
                   <input
                     type="checkbox"
                     checked={chartVisibleMetrics.includes(m)}
                     onChange={() => toggleChart(m)}
                     className="w-4 h-4 rounded border-border-DEFAULT bg-neutral-bg1 text-brand focus:ring-brand cursor-pointer"
                   />
                   <span className="text-sm font-medium uppercase tracking-wider">{m}</span>
                 </label>
               ))}
             </div>
             <button
               onClick={handleSaveCharts}
               className="w-full p-2.5 bg-brand hover:bg-brand-hover text-white transition-colors font-medium rounded-xl"
             >
               Save Chart Preferences
             </button>
           </motion.div>

         </div>

        {/* Right Column: Alerting Engine */}
        <div className="lg:col-span-7">
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-neutral-bg2 border border-border-DEFAULT rounded-2xl p-6 shadow-sm h-full"
          >
            <h2 className="text-lg font-bold text-text-primary mb-2 flex items-center gap-2">
              <Bell className="w-5 h-5 text-dataviz-yellow" />
              Alerting Engine Rules
            </h2>
            <p className="text-text-secondary text-sm mb-6">Create dynamic rules to monitor your servers. If a condition is met for the specified duration, the action will be triggered automatically.</p>

            {/* Create Rule Form */}
            <div className="bg-neutral-bg1 border border-border-subtle rounded-xl p-5 mb-8">
              <h3 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
                <Plus className="w-4 h-4 text-brand" />
                Add New Rule
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-5">
                <div className="col-span-2 md:col-span-1">
                  <label className="block text-[10px] uppercase font-semibold text-text-muted mb-1.5">Target VPS</label>
                  <select 
                    className="w-full p-2 bg-neutral-bg2 border border-border-DEFAULT rounded-lg text-sm text-text-primary focus:outline-none focus:border-brand transition-colors"
                    value={newRule.vpsId} onChange={e => setNewRule({...newRule, vpsId: e.target.value})}
                  >
                    <option value="">All VPS</option>
                    {vpsList.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
                
                <div className="col-span-1">
                  <label className="block text-[10px] uppercase font-semibold text-text-muted mb-1.5">Metric</label>
                  <select 
                    className="w-full p-2 bg-neutral-bg2 border border-border-DEFAULT rounded-lg text-sm text-text-primary focus:outline-none focus:border-brand transition-colors"
                    value={newRule.metric} onChange={e => setNewRule({...newRule, metric: e.target.value})}
                  >
                    <option value="CPU">CPU</option>
                    <option value="RAM">RAM</option>
                    <option value="DISK">Disk</option>
                  </select>
                </div>

                <div className="col-span-1">
                  <label className="block text-[10px] uppercase font-semibold text-text-muted mb-1.5">Condition</label>
                  <select 
                    className="w-full p-2 bg-neutral-bg2 border border-border-DEFAULT rounded-lg text-sm text-text-primary focus:outline-none focus:border-brand transition-colors"
                    value={newRule.condition} onChange={e => setNewRule({...newRule, condition: e.target.value})}
                  >
                    <option value=">">&gt; (Greater)</option>
                    <option value="<">&lt; (Less)</option>
                  </select>
                </div>

                <div className="col-span-1">
                  <label className="block text-[10px] uppercase font-semibold text-text-muted mb-1.5">Threshold (%)</label>
                  <input 
                    type="number" 
                    className="w-full p-2 bg-neutral-bg2 border border-border-DEFAULT rounded-lg text-sm text-text-primary focus:outline-none focus:border-brand transition-colors"
                    value={newRule.threshold} onChange={e => setNewRule({...newRule, threshold: Number(e.target.value)})}
                  />
                </div>

                <div className="col-span-1">
                  <label className="block text-[10px] uppercase font-semibold text-text-muted mb-1.5">Duration (Min)</label>
                  <input 
                    type="number" 
                    className="w-full p-2 bg-neutral-bg2 border border-border-DEFAULT rounded-lg text-sm text-text-primary focus:outline-none focus:border-brand transition-colors"
                    value={newRule.durationMin} onChange={e => setNewRule({...newRule, durationMin: Number(e.target.value)})}
                  />
                </div>

                <div className="col-span-2 md:col-span-1">
                  <label className="block text-[10px] uppercase font-semibold text-text-muted mb-1.5">Action</label>
                  <select
                    className="w-full p-2 bg-neutral-bg2 border border-border-DEFAULT rounded-lg text-sm text-text-primary focus:outline-none focus:border-brand transition-colors"
                    value={newRule.action} onChange={e => setNewRule({...newRule, action: e.target.value})}
                  >
                    <option value="ALERT">Notify Only</option>
                    <option value="RESTART">Restart</option>
                    <option value="ALERT_AND_RESTART">Alert + Restart</option>
                    <option value="CUSTOM_SCRIPT">Custom Script</option>
                  </select>
                </div>
              </div>
              
              {/* Custom Script Input */}
              {newRule.action === 'CUSTOM_SCRIPT' && (
                <div className="mb-5">
                  <label className="block text-[10px] uppercase font-semibold text-text-muted mb-1.5">Script to Execute</label>
                  <textarea 
                    className="w-full p-3 bg-neutral-bg2 border border-border-DEFAULT rounded-lg text-sm text-text-primary font-mono focus:outline-none focus:border-brand transition-colors"
                    rows={4}
                    placeholder="#!/bin/bash&#10;# Your script here&#10;echo 'Hello World'"
                    value={newRule.script} 
                    onChange={e => setNewRule({...newRule, script: e.target.value})}
                  />
                  <p className="text-[10px] text-text-muted mt-1">This script will be executed on the target VPS when the rule triggers.</p>
                </div>
              )}
              
              <button onClick={handleAddRule} className="w-full sm:w-auto px-5 py-2 bg-neutral-bg3 hover:bg-neutral-bg4 text-text-primary rounded-lg text-sm font-medium transition-colors border border-border-DEFAULT">
                Create Rule
              </button>
            </div>

            {/* Rules List */}
            <div>
              <h3 className="text-sm font-semibold text-text-primary mb-4 flex items-center justify-between">
                <span>Active Rules</span>
                <span className="bg-neutral-bg3 text-text-secondary py-0.5 px-2 rounded-md text-xs">{rules.length}</span>
              </h3>
              
              {rules.length === 0 ? (
                <div className="text-center py-10 border border-dashed border-border-strong rounded-xl bg-neutral-bg1/50">
                  <Bell className="w-8 h-8 text-text-muted mx-auto mb-2 opacity-50" />
                  <p className="text-text-muted text-sm">No alerting rules configured yet.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {rules.map(rule => (
                    <div key={rule.id} className="group flex items-center justify-between p-4 bg-neutral-bg1 border border-border-subtle hover:border-border-DEFAULT rounded-xl transition-colors">
                      <div className="flex flex-col gap-1">
                        <span className="text-text-primary font-medium text-sm">
                          If <span className="text-brand font-semibold">{rule.vps ? rule.vps.name : 'ANY VPS'}</span> {rule.metric} is {rule.condition} {rule.threshold}% for {rule.durationMin} mins
                        </span>
                        <span className="text-text-muted text-xs flex items-center gap-1.5">
                          Action: 
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider ${rule.action === 'RESTART' ? 'bg-status-error/10 text-status-error' : 'bg-status-info/10 text-status-info'}`}>
                            {rule.action}
                          </span>
                        </span>
                      </div>
                      <button 
                        onClick={() => handleDeleteRule(rule.id)} 
                        className="p-2 text-text-muted hover:text-status-error hover:bg-status-error/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                        title="Delete Rule"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </div>

      </div>
    </div>
  );
}
