"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Bell, Plus, Trash2, Filter, ChevronDown, Server, AlertCircle } from 'lucide-react';
import { useSocket } from '@/lib/socket';
import { api, getStoredUser } from '@/lib/api';

const METRIC_OPTIONS = [
  { value: 'CPU', label: 'CPU' },
  { value: 'RAM', label: 'RAM' },
  { value: 'DISK', label: 'Disk' },
  { value: 'OFFLINE', label: 'Offline' }
];

const CONDITION_OPTIONS = [{ value: '>', label: '>' }, { value: '<', label: '<' }];

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

export default function GlobalAlertsPage() {
  const router = useRouter();
  const [rules, setRules] = useState<any[]>([]);
  const [vpsList, setVpsList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { socket } = useSocket();

  // Filters
  const [filterVps, setFilterVps] = useState<string>('all');
  const [filterAction, setFilterAction] = useState<string>('all');
  const [filterMetric, setFilterMetric] = useState<string>('all');

  const [newRule, setNewRule] = useState({
    vpsId: '',
    metric: 'CPU',
    condition: '>',
    threshold: 90,
    durationMin: 10,
    offlineThresholdMin: 5,
    customMessage: '',
    restartOnAlert: false,
    action: 'ALERT',
    script: ''
  });
  const [showForm, setShowForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    if (!getStoredUser()) { router.push('/login'); return; }
    Promise.all([api<any[]>('/api/rules'), api<any[]>('/api/vps')])
      .then(([rulesData, vpsData]) => {
        if (Array.isArray(rulesData)) setRules(rulesData);
        if (Array.isArray(vpsData)) setVpsList(vpsData);
      })
      .finally(() => setLoading(false));
  }, [router]);

  useEffect(() => {
    if (!getStoredUser()) return;
    const s = socket;
    if (!s) return;
    const onEvent = (e: any) => {
      if (e?.type === 'RULES_CHANGED') {
        api<any[]>('/api/rules').then(d => { if (Array.isArray(d)) setRules(d); }).catch(() => {});
      }
    };
    s.on('vps_event', onEvent);
    return () => { s.off('vps_event', onEvent); };
  }, [socket]);

  const filteredRules = rules.filter(r => {
    if (filterVps !== 'all' && r.vpsId !== filterVps && r.vpsId !== null) return false;
    if (filterAction !== 'all' && r.action !== filterAction) return false;
    if (filterMetric !== 'all' && r.metric !== filterMetric && !(filterMetric === 'OFFLINE' && r.metric === null)) return false;
    return true;
  });

  const addRule = async () => {
    const payload: any = { ...newRule };
    if (newRule.metric === 'OFFLINE') {
      payload.metric = undefined;
      payload.condition = undefined;
      payload.threshold = undefined;
      payload.durationMin = undefined;
    }
    if (!payload.vpsId) payload.vpsId = undefined;
    const r = await api<any>('/api/rules', { method: 'POST', json: payload });
    setRules([r, ...rules]);
    setShowForm(false);
    setNewRule({ vpsId: '', metric: 'CPU', condition: '>', threshold: 90, durationMin: 10, offlineThresholdMin: 5, customMessage: '', restartOnAlert: false, action: 'ALERT', script: '' });
  };

  const deleteRule = async (ruleId: string) => {
    await api(`/api/rules/${ruleId}`, { method: 'DELETE' });
    setRules(rules.filter(r => r.id !== ruleId));
    setConfirmDelete(null);
  };

  if (loading) return <div className="h-full flex items-center justify-center text-text-muted">Loading…</div>;

  return (
    <div className="max-w-6xl mx-auto pb-12">
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-text-primary mb-2 flex items-center gap-3">
          <Bell className="w-7 h-7 text-brand" /> Global Alert Tracker
        </h1>
        <p className="text-text-secondary text-sm">All your alerting rules across every VPS. Filter, manage, and customize messages.</p>
      </header>

      {/* Filters */}
      <div className="bg-neutral-bg2/40 border border-border-subtle rounded-2xl p-4 mb-4 flex flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-text-muted" />
          <span className="text-xs uppercase font-bold text-text-muted">Filters</span>
        </div>
        <select value={filterVps} onChange={e => setFilterVps(e.target.value)} className="px-3 py-1.5 text-sm bg-neutral-bg1 border border-border-subtle rounded-lg text-text-primary">
          <option value="all">All VPS ({rules.filter(r => !r.vpsId).length} global)</option>
          {vpsList.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        <select value={filterAction} onChange={e => setFilterAction(e.target.value)} className="px-3 py-1.5 text-sm bg-neutral-bg1 border border-border-subtle rounded-lg text-text-primary">
          <option value="all">All Actions</option>
          {ACTION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={filterMetric} onChange={e => setFilterMetric(e.target.value)} className="px-3 py-1.5 text-sm bg-neutral-bg1 border border-border-subtle rounded-lg text-text-primary">
          <option value="all">All Metrics</option>
          {METRIC_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <div className="ml-auto text-xs text-text-muted self-center">
          {filteredRules.length} of {rules.length} rules
        </div>
      </div>

      <div className="flex justify-end mb-3">
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 px-4 py-2 bg-brand hover:bg-brand-hover text-white rounded-xl text-sm font-medium transition-colors shadow-glow">
          <Plus className="w-4 h-4" /> New Rule
        </button>
      </div>

      {showForm && (
        <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="bg-neutral-bg2/80 border border-border-DEFAULT rounded-2xl p-6 mb-4 backdrop-blur-xl shadow-sm space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-text-muted mb-1.5 uppercase">Target VPS</label>
              <select value={newRule.vpsId} onChange={e => setNewRule({ ...newRule, vpsId: e.target.value })} className="w-full p-2.5 rounded-xl bg-neutral-bg1 border border-border-DEFAULT text-text-primary text-sm focus:outline-none focus:border-brand">
                <option value="">All VPS (global)</option>
                {vpsList.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-muted mb-1.5 uppercase">Metric</label>
              <select value={newRule.metric} onChange={e => setNewRule({ ...newRule, metric: e.target.value })} className="w-full p-2.5 rounded-xl bg-neutral-bg1 border border-border-DEFAULT text-text-primary text-sm focus:outline-none focus:border-brand">
                {METRIC_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
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

          {newRule.action === 'CUSTOM_SCRIPT' && (
            <div>
              <label className="block text-xs font-semibold text-text-muted mb-1.5 uppercase">Script</label>
              <textarea
                value={newRule.script}
                onChange={e => setNewRule({ ...newRule, script: e.target.value })}
                rows={3}
                placeholder="#!/bin/bash\necho hello"
                className="w-full p-2.5 rounded-xl bg-neutral-bg1 border border-border-DEFAULT text-text-primary text-sm font-mono focus:outline-none focus:border-brand resize-none"
              />
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-text-muted uppercase">Custom Message</label>
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
          </div>

          <div className="flex items-center gap-2">
            <input id="restartOnAlert" type="checkbox" checked={newRule.restartOnAlert} onChange={e => setNewRule({ ...newRule, restartOnAlert: e.target.checked })} className="w-4 h-4 rounded bg-neutral-bg1 border-border-default text-brand focus:ring-brand" />
            <label htmlFor="restartOnAlert" className="text-sm text-text-primary">Also restart the VPS after sending the alert</label>
          </div>

          <button onClick={addRule} className="w-full py-2.5 bg-brand hover:bg-brand-hover text-white rounded-xl font-medium text-sm transition-colors">
            Save Rule
          </button>
        </motion.div>
      )}

      <div className="space-y-3">
        {filteredRules.length === 0 ? (
          <div className="bg-neutral-bg2/40 border border-dashed border-border-strong rounded-2xl p-12 text-center text-text-muted">
            <Bell className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No matching rules.</p>
          </div>
        ) : (
          filteredRules.map(rule => (
            <motion.div key={rule.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="bg-neutral-bg2/80 border border-border-DEFAULT rounded-2xl p-4 backdrop-blur-xl shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="text-sm font-medium text-text-primary">
                      {rule.vps ? rule.vps.name : <span className="text-brand-light">All VPS</span>}
                    </span>
                    <span className="text-text-muted text-sm">·</span>
                    <span className="text-sm text-text-secondary">
                      {rule.metric === 'OFFLINE' || !rule.metric
                        ? <>offline for <span className="text-brand-light">{rule.offlineThresholdMin}m</span></>
                        : <>{rule.metric} {rule.condition} {rule.threshold}% for {rule.durationMin}m</>}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider ${
                      rule.action === 'RESTART' || rule.action === 'ALERT_AND_RESTART'
                        ? 'bg-status-error/10 text-status-error border border-status-error/20'
                        : rule.action === 'CUSTOM_SCRIPT'
                        ? 'bg-dataviz-purple/10 text-dataviz-purple border border-dataviz-purple/20'
                        : 'bg-status-info/10 text-status-info border border-status-info/20'
                    }`}>
                      {rule.action}
                    </span>
                    {rule.restartOnAlert && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-status-error/10 text-status-error border border-status-error/20">+ RESTART</span>
                    )}
                  </div>
                  {rule.customMessage && (
                    <div className="text-xs text-text-secondary italic border-l-2 border-border-subtle pl-2">"{rule.customMessage}"</div>
                  )}
                </div>
                <button onClick={() => setConfirmDelete(rule.id)} className="p-2 text-text-muted hover:text-status-error hover:bg-status-error/10 rounded-lg transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          ))
        )}
      </div>

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
