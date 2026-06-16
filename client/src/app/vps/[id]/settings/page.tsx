"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { use } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Save, Settings as SettingsIcon, Cpu, MemoryStick, HardDrive, Network, MessageCircle, Bell } from 'lucide-react';
import { api, getStoredUser } from '@/lib/api';

const CHART_OPTIONS = [
  { key: 'cpu', label: 'CPU', icon: Cpu },
  { key: 'ram', label: 'RAM', icon: MemoryStick },
  { key: 'disk', label: 'Disk', icon: HardDrive },
  { key: 'network', label: 'Network', icon: Network }
];

export default function VpsSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [settings, setSettings] = useState({
    screenshotIntervalSec: 30,
    telemetryIntervalSec: 1,
    ramDiskVisible: true,
    networkVisible: true,
    telegramEnabled: true,
    customAlertMessage: '',
    visibleCharts: ['cpu', 'ram', 'disk', 'network'] as string[],
    offlineTimeoutSec: 60,
    offlineAlertEnabled: true,
    onlineAlertEnabled: true,
    customOfflineMessage: '',
    customOnlineMessage: ''
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (!getStoredUser()) { router.push('/login'); return; }
    api<any>(`/api/vps/${id}/settings`)
      .then((d) => {
        if (d) {
          setSettings({
            screenshotIntervalSec: d.screenshotIntervalSec ?? 30,
            telemetryIntervalSec: d.telemetryIntervalSec ?? 1,
            ramDiskVisible: d.ramDiskVisible ?? true,
            networkVisible: d.networkVisible ?? true,
            telegramEnabled: d.telegramEnabled ?? true,
            customAlertMessage: d.customAlertMessage ?? '',
            visibleCharts: d.visibleCharts ? JSON.parse(d.visibleCharts) : ['cpu', 'ram', 'disk', 'network'],
            offlineTimeoutSec: d.offlineTimeoutSec ?? 60,
            offlineAlertEnabled: d.offlineAlertEnabled ?? true,
            onlineAlertEnabled: d.onlineAlertEnabled ?? true,
            customOfflineMessage: d.customOfflineMessage ?? '',
            customOnlineMessage: d.customOnlineMessage ?? ''
          });
        }
        setLoading(false);
      }).catch(() => setLoading(false));
  }, [id, router]);

  const toggleChart = (key: string) => {
    setSettings(prev => ({
      ...prev,
      visibleCharts: prev.visibleCharts.includes(key)
        ? prev.visibleCharts.filter(c => c !== key)
        : [...prev.visibleCharts, key]
    }));
  };

  const save = async () => {
    setSaving(true); setMsg(null);
    try {
      await api(`/api/vps/${id}/settings`, {
        method: 'PUT',
        json: settings
      });
      setMsg({ type: 'success', message: 'Settings saved. Agent will pick them up within 10s.' });
    } catch (err: any) {
      setMsg({ type: 'error', message: err?.message || 'Failed to save' });
    }
    setSaving(false);
    setTimeout(() => setMsg(null), 4000);
  };

  if (loading) {
    return <div className="h-full flex items-center justify-center text-text-muted">Loading settings...</div>;
  }

  return (
    <div className="max-w-3xl mx-auto pb-12">
      <header className="mb-6 flex items-center gap-4">
        <button onClick={() => router.push(`/vps/${id}`)} className="w-10 h-10 rounded-xl bg-neutral-bg2 border border-border-DEFAULT flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-neutral-bg3 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary flex items-center gap-3">
            <SettingsIcon className="w-6 h-6 text-brand" /> VPS Settings
          </h1>
          <p className="text-text-secondary text-sm">Per-VPS configuration: telemetry, screenshots, alerts and visible charts.</p>
        </div>
      </header>

      {msg && (
        <div className={`mb-4 p-3 rounded-xl border text-sm ${msg.type === 'success' ? 'bg-status-success/10 border-status-success/30 text-status-success' : 'bg-status-error/10 border-status-error/30 text-status-error'}`}>
          {msg.message}
        </div>
      )}

      <div className="space-y-4">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-neutral-bg2/80 border border-border-DEFAULT rounded-2xl p-6 backdrop-blur-xl shadow-sm">
          <h2 className="text-sm font-bold text-text-primary mb-4 uppercase tracking-wider">Agent Intervals</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-text-muted mb-1.5 uppercase">Screenshot Interval (sec)</label>
              <input type="number" min={5} max={3600} value={settings.screenshotIntervalSec} onChange={e => setSettings({ ...settings, screenshotIntervalSec: Math.max(5, Math.min(3600, Number(e.target.value))) })} className="w-full p-2.5 rounded-xl bg-neutral-bg1 border border-border-DEFAULT text-text-primary text-sm focus:outline-none focus:border-brand" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-muted mb-1.5 uppercase">Telemetry Interval (sec)</label>
              <input type="number" min={1} max={60} value={settings.telemetryIntervalSec} onChange={e => setSettings({ ...settings, telemetryIntervalSec: Math.max(1, Math.min(60, Number(e.target.value))) })} className="w-full p-2.5 rounded-xl bg-neutral-bg1 border border-border-DEFAULT text-text-primary text-sm focus:outline-none focus:border-brand" />
            </div>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-neutral-bg2/80 border border-border-DEFAULT rounded-2xl p-6 backdrop-blur-xl shadow-sm">
          <h2 className="text-sm font-bold text-text-primary mb-4 uppercase tracking-wider">Visibility</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-text-primary">Show RAM / Disk</div>
                <div className="text-xs text-text-muted">Toggle RAM and disk metrics in the overview</div>
              </div>
              <button onClick={() => setSettings({ ...settings, ramDiskVisible: !settings.ramDiskVisible })} className={`w-10 h-5 rounded-full transition-colors ${settings.ramDiskVisible ? 'bg-brand' : 'bg-neutral-bg3'}`}>
                <span className={`block w-4 h-4 bg-white rounded-full transition-transform ${settings.ramDiskVisible ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-text-primary">Show Network</div>
                <div className="text-xs text-text-muted">Toggle upload / download metrics in the overview</div>
              </div>
              <button onClick={() => setSettings({ ...settings, networkVisible: !settings.networkVisible })} className={`w-10 h-5 rounded-full transition-colors ${settings.networkVisible ? 'bg-brand' : 'bg-neutral-bg3'}`}>
                <span className={`block w-4 h-4 bg-white rounded-full transition-transform ${settings.networkVisible ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="bg-neutral-bg2/80 border border-border-DEFAULT rounded-2xl p-6 backdrop-blur-xl shadow-sm">
          <h2 className="text-sm font-bold text-text-primary mb-1 uppercase tracking-wider flex items-center gap-2"><MessageCircle className="w-4 h-4" /> Alerts & Telegram</h2>
          <p className="text-xs text-text-muted mb-4">Custom message template for alerts on this VPS. Variables: <code className="text-brand-light">{'{{vpsName}}'}, {'{{ip}}'}, {'{{metric}}'}, {'{{value}}'}, {'{{threshold}}'}, {'{{duration}}'}, {'{{offlineMinutes}}'}</code></p>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-text-primary">Telegram Enabled</div>
                <div className="text-xs text-text-muted">Receive alerts via Telegram for this VPS</div>
              </div>
              <button onClick={() => setSettings({ ...settings, telegramEnabled: !settings.telegramEnabled })} className={`w-10 h-5 rounded-full transition-colors ${settings.telegramEnabled ? 'bg-brand' : 'bg-neutral-bg3'}`}>
                <span className={`block w-4 h-4 bg-white rounded-full transition-transform ${settings.telegramEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-muted mb-1.5 uppercase">Custom Alert Message</label>
              <textarea
                value={settings.customAlertMessage}
                onChange={e => setSettings({ ...settings, customAlertMessage: e.target.value })}
                maxLength={500}
                placeholder="🚨 {{vpsName}} — {{metric}} at {{value}}% (threshold {{threshold}}%)"
                rows={3}
                className="w-full p-2.5 rounded-xl bg-neutral-bg1 border border-border-DEFAULT text-text-primary text-sm font-mono focus:outline-none focus:border-brand resize-none"
              />
              <div className="text-[10px] text-text-muted mt-1 text-right">{settings.customAlertMessage.length} / 500</div>
            </div>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }} className="bg-neutral-bg2/80 border border-border-DEFAULT rounded-2xl p-6 backdrop-blur-xl shadow-sm">
          <h2 className="text-sm font-bold text-text-primary mb-1 uppercase tracking-wider flex items-center gap-2"><Bell className="w-4 h-4" /> Heartbeat & Default Alerts</h2>
          <p className="text-xs text-text-muted mb-4">Configure when the system considers the VPS offline and customize status messages.</p>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-text-muted mb-1.5 uppercase">Heartbeat Offline Timeout (Seconds)</label>
              <input type="number" min={5} max={3600} value={settings.offlineTimeoutSec} onChange={e => setSettings({ ...settings, offlineTimeoutSec: Math.max(5, Math.min(3600, Number(e.target.value))) })} className="w-full p-2.5 rounded-xl bg-neutral-bg1 border border-border-DEFAULT text-text-primary text-sm focus:outline-none focus:border-brand" />
            </div>

            <div className="border-t border-border-subtle pt-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="text-sm text-text-primary">Default Offline Alert</div>
                  <div className="text-xs text-text-muted">Send alerts when the heartbeat is missed</div>
                </div>
                <button onClick={() => setSettings({ ...settings, offlineAlertEnabled: !settings.offlineAlertEnabled })} className={`w-10 h-5 rounded-full transition-colors ${settings.offlineAlertEnabled ? 'bg-brand' : 'bg-neutral-bg3'}`}>
                  <span className={`block w-4 h-4 bg-white rounded-full transition-transform ${settings.offlineAlertEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>
              {settings.offlineAlertEnabled && (
                <div>
                  <label className="block text-xs font-semibold text-text-muted mb-1.5 uppercase">Custom Offline Message</label>
                  <textarea
                    value={settings.customOfflineMessage}
                    onChange={e => setSettings({ ...settings, customOfflineMessage: e.target.value })}
                    placeholder="⚠️ VPS {{vpsName}} is OFFLINE — no heartbeat for {{offlineMinutes}}m"
                    maxLength={500}
                    rows={2}
                    className="w-full p-2.5 rounded-xl bg-neutral-bg1 border border-border-DEFAULT text-text-primary text-sm font-mono focus:outline-none focus:border-brand resize-none"
                  />
                </div>
              )}
            </div>

            <div className="border-t border-border-subtle pt-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="text-sm text-text-primary">Default Online Alert (Recovery)</div>
                  <div className="text-xs text-text-muted">Send recovery alerts when the VPS comes back online</div>
                </div>
                <button onClick={() => setSettings({ ...settings, onlineAlertEnabled: !settings.onlineAlertEnabled })} className={`w-10 h-5 rounded-full transition-colors ${settings.onlineAlertEnabled ? 'bg-brand' : 'bg-neutral-bg3'}`}>
                  <span className={`block w-4 h-4 bg-white rounded-full transition-transform ${settings.onlineAlertEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>
              {settings.onlineAlertEnabled && (
                <div>
                  <label className="block text-xs font-semibold text-text-muted mb-1.5 uppercase">Custom Online Message</label>
                  <textarea
                    value={settings.customOnlineMessage}
                    onChange={e => setSettings({ ...settings, customOnlineMessage: e.target.value })}
                    placeholder="✅ {{vpsName}} is back ONLINE"
                    maxLength={500}
                    rows={2}
                    className="w-full p-2.5 rounded-xl bg-neutral-bg1 border border-border-DEFAULT text-text-primary text-sm font-mono focus:outline-none focus:border-brand resize-none"
                  />
                </div>
              )}
            </div>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-neutral-bg2/80 border border-border-DEFAULT rounded-2xl p-6 backdrop-blur-xl shadow-sm">
          <h2 className="text-sm font-bold text-text-primary mb-1 uppercase tracking-wider">Visible Charts</h2>
          <p className="text-xs text-text-muted mb-4">Pick which metrics appear in the Performance tab.</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {CHART_OPTIONS.map(opt => {
              const Icon = opt.icon;
              const enabled = settings.visibleCharts.includes(opt.key);
              return (
                <button
                  key={opt.key}
                  onClick={() => toggleChart(opt.key)}
                  className={`flex items-center gap-2 p-3 rounded-xl border transition-colors ${enabled ? 'bg-brand/15 border-brand/40 text-brand-light' : 'bg-neutral-bg1 border-border-subtle text-text-secondary hover:text-text-primary'}`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="text-sm font-medium">{opt.label}</span>
                </button>
              );
            })}
          </div>
        </motion.div>

        <div className="flex justify-end">
          <button onClick={save} disabled={saving} className="flex items-center gap-2 px-5 py-2.5 bg-brand hover:bg-brand-hover text-white rounded-xl font-medium text-sm transition-colors disabled:opacity-50 shadow-glow">
            <Save className="w-4 h-4" />
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
