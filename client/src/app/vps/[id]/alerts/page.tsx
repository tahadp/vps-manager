"use client";
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { use } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Plus, Trash2, Bell, AlertCircle, Filter, ChevronDown } from 'lucide-react';
import io from 'socket.io-client';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

const METRIC_OPTIONS = [
  { value: 'CPU', label: 'CPU' },
  { value: 'RAM', label: 'RAM' },
  { value: 'DISK', label: 'Disk' },
  { value: 'OFFLINE', label: 'Offline' }
];

const CONDITION_OPTIONS = [
  { value: '>', label: '>' },
  { value: '<', label: '<' }
];

const ACTION_OPTIONS = [
  { value: 'ALERT', label: 'Notify Only' },
  { value: 'RESTART', label: 'Restart' },
  { value: 'ALERT_AND_RESTART', label: 'Alert + Restart' },
  { value: 'CUSTOM_SCRIPT', label: 'Custom Script' }
];

const MESSAGE_TEMPLATES = [
  { name: 'Critical', value: '🚨 CRITICAL: {{vpsName}} ({{ip}}) — {{metric}} at {{value}}% (threshold {{threshold}}%) for {{duration}} minutes.' },
  { name: 'Warning', value: '⚠️ Warning: {{vpsName}} — {{metric}} {{condition}} {{threshold}}% (current: {{value}}%)' },
  { name: 'Offline', value: '🔴 {{vpsName}} is offline for {{offlineMinutes}} minutes. Last IP: {{ip}}.' },
  { name: 'Recovery', value: '✅ {{vpsName}} is back online. {{metric}} recovered to {{value}}%.' }
];

export default function VpsAlertsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [rules, setRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [newRule, setNewRule] = useState({
    metric: 'CPU',
    condition: '>',
    threshold: 90,
    durationMin: 10,
    offlineThresholdMin: 5,
    customMessage: '',
    restartOnAlert: false,
    action: 'ALERT'
  });

  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { router.push('/login'); return; }
    fetchRules(token);
  }, [id, router]);

  useEffect(() => {
    const socket = io(API, { transports: ['websocket'] });
    socket.on('vps_event', (e: any) => {
      if (e?.type === 'RULES_CHANGED') {
        const token = localStorage.getItem('token');
        if (!token) return;
        fetchRules(token);
      }
    });
    return () => { socket.disconnect(); };
  }, [id]);

  const fetchRules = async (token: string) => {
    try {
      const res = await fetch(`${API}/api/rules`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const d = await res.json();
        if (Array.isArray(d)) setRules(d.filter((r: any) => !r.vpsId || r.vpsId === id));
      }
    } catch {}
    setLoading(false);
  };

  const addRule = async () => {
    const token = localStorage.getItem('token');
    const payload: any = { vpsId: id, ...newRule };
    if (newRule.metric !== 'OFFLINE') {
      payload.condition = newRule.condition;
    } else {
      payload.metric = undefined;
      payload.offlineThresholdMin = newRule.offlineThresholdMin;
    }
    const res = await fetch(`${API}/api/rules`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      const rule = await res.json();
      setRules([rule, ...rules]);
      setShowForm(false);
      setNewRule({ metric: 'CPU', condition: '>', threshold: 90, durationMin: 10, offlineThresholdMin: 5, customMessage: '', restartOnAlert: false, action: 'ALERT' });
    }
  };

  const deleteRule = async (ruleId: string) => {
    const token = localStorage.getItem('token');
    await fetch(`${API}/api/rules/${ruleId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    setRules(rules.filter(r => r.id !== ruleId));
    setConfirmDelete(null);
  };

  if (loading) return <div className="h-full flex items-center justify-center text-text-muted">Loading...</div>;

  return (
    <div className="max-w-4xl mx-auto pb-12">
      <header className="mb-6 flex items-center gap-4">
        <button onClick={() => router.push(`/vps/${id}`)} className="w-10 h-10 rounded-xl bg-neutral-bg2 border border-border-DEFAULT flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-neutral-bg3 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary flex items-center gap-3">
            <Bell className="w-6 h-6 text-brand" /> Alert Rules
          </h1>
          <p className="text-text-secondary text-sm">Custom alert conditions and actions for this VPS.</p>
        </div>
      </header>

      <div className="space-y-3 mb-4">
        {rules.length === 0 && (
          <div className="bg-neutral-bg2/40 border border-dashed border-border-strong rounded-2xl p-8 text-center text-text-muted">
            <Bell className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No alert rules for this VPS yet.</p>
          </div>
        )}
        {rules.map(rule => (
          <motion.div key={rule.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="bg-neutral-bg2/80 border border-border-DEFAULT rounded-2xl p-4 backdrop-blur-xl shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="text-sm text-text-primary font-medium">
                  {rule.metric === 'OFFLINE' || !rule.metric
                    ? <>🔴 If offline for <span className="text-brand-light">{rule.offlineThresholdMin ?? '?'} minutes</span></>
                    : <>If <span className="text-brand-light">{rule.metric} {rule.condition} {rule.threshold}%</span> for <span className="text-brand-light">{rule.durationMin}m</span></>
                  }
                </div>
                <div className="text-xs text-text-muted mt-1">Action: <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider ${rule.action === 'RESTART' || rule.action === 'ALERT_AND_RESTART' ? 'bg-status-error/10 text-status-error' : 'bg-status-info/10 text-status-info'}`}>{rule.action}</span></div>
                {rule.customMessage && (
                  <div className="text-xs text-text-secondary mt-2 italic border-l-2 border-border-subtle pl-2">"{rule.customMessage}"</div>
                )}
              </div>
              <button onClick={() => setConfirmDelete(rule.id)} className="p-2 text-text-muted hover:text-status-error hover:bg-status-error/10 rounded-lg transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        ))}
      </div>

      <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 text-sm text-brand-light hover:text-brand mb-3">
        <Plus className="w-4 h-4" /> {showForm ? 'Cancel' : 'Add Rule'}
      </button>

      {showForm && (
        <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="bg-neutral-bg2/80 border border-border-DEFAULT rounded-2xl p-6 backdrop-blur-xl shadow-sm space-y-4">
          <div>
            <label className="block text-xs font-semibold text-text-muted mb-1.5 uppercase">Metric</label>
            <select value={newRule.metric} onChange={e => setNewRule({ ...newRule, metric: e.target.value })} className="w-full p-2.5 rounded-xl bg-neutral-bg1 border border-border-DEFAULT text-text-primary text-sm focus:outline-none focus:border-brand">
              {METRIC_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {newRule.metric !== 'OFFLINE' ? (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-text-muted mb-1.5 uppercase">Condition</label>
                <select value={newRule.condition} onChange={e => setNewRule({ ...newRule, condition: e.target.value })} className="w-full p-2.5 rounded-xl bg-neutral-bg1 border border-border-DEFAULT text-text-primary text-sm focus:outline-none focus:border-brand">
                  {CONDITION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-muted mb-1.5 uppercase">Threshold (%)</label>
                <input type="number" value={newRule.threshold} onChange={e => setNewRule({ ...newRule, threshold: Number(e.target.value) })} className="w-full p-2.5 rounded-xl bg-neutral-bg1 border border-border-DEFAULT text-text-primary text-sm focus:outline-none focus:border-brand" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-muted mb-1.5 uppercase">Duration (min)</label>
                <input type="number" min={1} value={newRule.durationMin} onChange={e => setNewRule({ ...newRule, durationMin: Number(e.target.value) })} className="w-full p-2.5 rounded-xl bg-neutral-bg1 border border-border-DEFAULT text-text-primary text-sm focus:outline-none focus:border-brand" />
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-text-muted mb-1.5 uppercase">Offline Threshold (min)</label>
              <input type="number" min={1} value={newRule.offlineThresholdMin} onChange={e => setNewRule({ ...newRule, offlineThresholdMin: Number(e.target.value) })} className="w-full p-2.5 rounded-xl bg-neutral-bg1 border border-border-DEFAULT text-text-primary text-sm focus:outline-none focus:border-brand" />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-text-muted mb-1.5 uppercase">Action</label>
            <select value={newRule.action} onChange={e => setNewRule({ ...newRule, action: e.target.value })} className="w-full p-2.5 rounded-xl bg-neutral-bg1 border border-border-DEFAULT text-text-primary text-sm focus:outline-none focus:border-brand">
              {ACTION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-text-muted uppercase">Custom Message (Telegram)</label>
              <select
                onChange={e => { if (e.target.value) setNewRule({ ...newRule, customMessage: e.target.value }); e.target.value = ''; }}
                className="text-xs bg-neutral-bg1 border border-border-subtle rounded-lg px-2 py-1 text-text-secondary"
                defaultValue=""
              >
                <option value="" disabled>Insert template…</option>
                {MESSAGE_TEMPLATES.map(t => <option key={t.name} value={t.value}>{t.name}</option>)}
              </select>
            </div>
            <textarea
              value={newRule.customMessage}
              onChange={e => setNewRule({ ...newRule, customMessage: e.target.value })}
              maxLength={500}
              rows={3}
              placeholder="Leave empty to use the default alert message."
              className="w-full p-2.5 rounded-xl bg-neutral-bg1 border border-border-DEFAULT text-text-primary text-sm font-mono focus:outline-none focus:border-brand resize-none"
            />
            <div className="text-[10px] text-text-muted mt-1 text-right">{newRule.customMessage.length} / 500</div>
          </div>

          <button onClick={addRule} className="w-full py-2.5 bg-brand hover:bg-brand-hover text-white rounded-xl font-medium text-sm transition-colors">
            Save Rule
          </button>
        </motion.div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setConfirmDelete(null)}>
          <div className="bg-neutral-bg2 border border-border-DEFAULT rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <p className="text-text-primary text-sm mb-6">Delete this rule?</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 text-sm bg-neutral-bg3 text-text-primary rounded-xl">Cancel</button>
              <button onClick={() => deleteRule(confirmDelete)} className="px-4 py-2 text-sm bg-status-error hover:bg-status-error/80 text-white rounded-xl">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
