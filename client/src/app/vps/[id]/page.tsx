"use client";
import { useState, useEffect, useRef, use, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Server, Cpu, MemoryStick, HardDrive, TerminalSquare,
  FolderOpen, MonitorPlay, ArrowLeft, RefreshCw, PowerOff, Play,
  AlertCircle, LineChart as LineChartIcon, Activity, Wifi, WifiOff,
  Clock, Shield, Image as ImageIcon, ArrowUpDown, Plus, Trash2,
  Edit3, Bell, History, Zap, ChevronDown, Save, Network, Eye, MoreVertical,
  LayoutDashboard, Settings as SettingsIcon
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import WebPTY from "@/components/Terminal";
import FileManager from "@/components/FileManager";
import ScreenView from "@/components/ScreenView";
import RefreshButton from "@/components/vps/RefreshButton";
import { useSocket } from "@/lib/socket";
import { api, getStoredUser } from "@/lib/api";

type TabKey = "overview" | "terminal" | "files" | "rustdesk" | "performance";

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatNetworkSpeed(bytesPerSec: number): string {
  if (!bytesPerSec || bytesPerSec === 0) return '0.00 MB/s';
  const mbps = bytesPerSec / (1024 * 1024);
  return `${mbps.toFixed(2)} MB/s`;
}

function formatPercent(value: number | undefined): string {
  if (value === undefined || value === null) return '0.00';
  return value.toFixed(2);
}

function formatTimeAgo(dateStr: string | null, now: number): string {
  if (!dateStr) return "Never";
  const diff = now - new Date(dateStr).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 5) return "Just now";
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const CHART_RANGES = [
  { label: '30m', minutes: 30 },
  { label: '1h', minutes: 60 },
  { label: '3h', minutes: 180 },
  { label: '6h', minutes: 360 },
  { label: '12h', minutes: 720 },
  { label: '24h', minutes: 1440 }
];

const DEFAULT_VISIBLE_CHARTS = ['cpu', 'ram', 'disk', 'network'];

function ChartPanel({ title, unit, color, dataKey, chartData, secondDataKey, secondColor, secondLabel, mainLabel }: {
  title: string;
  unit: string;
  color: string;
  dataKey: string;
  chartData: any[];
  secondDataKey?: string;
  secondColor?: string;
  secondLabel?: string;
  mainLabel?: string;
}) {
  return (
    <div className="bg-neutral-bg2/40 border border-border-subtle rounded-xl p-3 flex flex-col min-h-[180px]">
      <div className="text-xs font-semibold text-text-muted mb-1">{title}</div>
      <div className="flex-1 min-h-[150px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 16, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border-subtle" vertical={false} />
            <XAxis dataKey="time" stroke="currentColor" className="text-text-muted" fontSize={10} tickLine={false} axisLine={false} minTickGap={32} />
            <YAxis
              stroke="currentColor"
              className="text-text-muted"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => Number(v).toFixed(2)}
              unit={unit === '%' ? '%' : ''}
              domain={unit === '%' ? [0, 100] : ['auto', 'auto']}
              allowDataOverflow={false}
              width={56}
            />
            <Tooltip
              contentStyle={{ backgroundColor: 'var(--color-bg-2)', borderColor: 'var(--color-border-default)', borderRadius: '8px', color: 'var(--color-text-primary)' }}
              itemStyle={{ color: 'var(--color-text-primary)' }}
              formatter={(v: any) => Number(v).toFixed(2)}
            />
            <Line type="monotone" dataKey={dataKey} name={mainLabel || title} stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
            {secondDataKey && secondColor && (
              <Line type="monotone" dataKey={secondDataKey} name={secondLabel || ''} stroke={secondColor} strokeWidth={2} dot={false} isAnimationActive={false} />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function VpsDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [vps, setVps] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [telemetry, setTelemetry] = useState<any>({});
  const [chartData, setChartData] = useState<any[]>([]);
  const [chartRangeMin, setChartRangeMin] = useState(60);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [socketStatus, setSocketStatus] = useState<"connecting" | "connected" | "error">("connecting");
  const { socket, connectionStatus: globalConnStatus } = useSocket();
  const [now, setNow] = useState<number>(Date.now());

  // Visible charts (from VPS settings) - default to all
  const [visibleCharts, setVisibleCharts] = useState<string[]>(DEFAULT_VISIBLE_CHARTS);
  // User-level default from /api/settings/preferences (F0-18).
  const [userDefaultCharts, setUserDefaultCharts] = useState<string[] | null>(null);
  const [vpsHasExplicitCharts, setVpsHasExplicitCharts] = useState(false);

  const [confirmModal, setConfirmModal] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [editModal, setEditModal] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', ipAddress: '', os: '', status: '' });
  const [menuOpen, setMenuOpen] = useState(false);
  const [cmdResult, setCmdResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showConfirm = (message: string): Promise<boolean> => {
    return new Promise(resolve => {
      setConfirmModal({ message, onConfirm: () => { setConfirmModal(null); resolve(true); } });
    });
  };

  const fetchChartData = useCallback(async (rangeMin: number) => {
    try {
      const hours = Math.max(1, Math.ceil(rangeMin / 60));
      const metrics = await api<any[]>(`/api/vps/${id}/metrics?hours=${hours}`);
      if (Array.isArray(metrics) && metrics.length > 0) {
        const since = Date.now() - rangeMin * 60 * 1000;
        const filtered = metrics.filter((m: any) => new Date(m.timestamp).getTime() >= since);
        setChartData(filtered.map((m: any) => ({
          time: new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          cpu: m.cpu,
          ram: m.ram,
          disk: m.disk,
          netTx: m.netTx,
          netRx: m.netRx
        })));
      } else {
        setChartData([]);
      }
    } catch {}
  }, [id]);

  useEffect(() => {
    const storedUser = getStoredUser();
    if (!storedUser) { router.push("/login"); return; }
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [router]);

  useEffect(() => {
    api<{ chartVisibleMetrics?: string[] }>('/api/settings/preferences')
      .then((d) => {
        if (Array.isArray(d?.chartVisibleMetrics) && d.chartVisibleMetrics.length > 0) {
          setUserDefaultCharts(d.chartVisibleMetrics);
          if (!vpsHasExplicitCharts) setVisibleCharts(d.chartVisibleMetrics);
        }
      })
      .catch(() => {});
  }, [vpsHasExplicitCharts]);

  useEffect(() => {
    api<any>(`/api/vps/${id}/settings`)
      .then((d) => {
        if (d && d.visibleCharts) {
          try {
            const parsed = JSON.parse(d.visibleCharts);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setVpsHasExplicitCharts(true);
              setVisibleCharts(parsed);
              return;
            }
          } catch {}
        }
        if (userDefaultCharts && userDefaultCharts.length > 0) {
          setVisibleCharts(userDefaultCharts);
        }
      })
      .catch(() => {
        if (userDefaultCharts && userDefaultCharts.length > 0) {
          setVisibleCharts(userDefaultCharts);
        }
      });
  }, [id, userDefaultCharts]);

  useEffect(() => {
    const storedUser = getStoredUser();
    if (!storedUser) { router.push("/login"); return; }

    api<any>(`/api/vps/${id}`)
      .then(data => {
        setVps(data);
        setLoading(false);
        fetchChartData(chartRangeMin);
      })
      .catch(() => { setLoading(false); setVps(null); });
  }, [id, router, fetchChartData]);

  useEffect(() => {
    if (!socket) return;

    if (socket.connected) {
      setSocketStatus("connected");
      socket.emit("subscribe_vps", id);
    } else {
      setSocketStatus("connecting");
    }

    const onConnect = () => {
      setSocketStatus("connected");
      socket.emit("subscribe_vps", id);
    };
    const onConnectError = () => setSocketStatus("error");
    const onDisconnect = () => setSocketStatus("error");
    const onTelemetry = (d: any) => {
      if (d && d.vpsId === id) setTelemetry(d);
    };
    const onScreenshot = (d: any) => {
      if (d && d.vpsId === id && d.imageData) setScreenshot(d.imageData);
    };
    const onStatus = (d: any) => {
      if (d && d.vpsId === id) {
        setVps((prev: any) => prev ? {
          ...prev,
          status: d.status || prev.status,
          lastHeartbeat: d.lastHeartbeat || prev.lastHeartbeat,
          ipAddress: d.ipAddress || prev.ipAddress
        } : prev);
      }
    };

    socket.on("connect", onConnect);
    socket.on("connect_error", onConnectError);
    socket.on("disconnect", onDisconnect);
    socket.on("telemetry_update", onTelemetry);
    socket.on("screenshot_update", onScreenshot);
    socket.on("vps_status_update", onStatus);

    return () => {
      socket.off("connect", onConnect);
      socket.off("connect_error", onConnectError);
      socket.off("disconnect", onDisconnect);
      socket.off("telemetry_update", onTelemetry);
      socket.off("screenshot_update", onScreenshot);
      socket.off("vps_status_update", onStatus);
    };
  }, [socket, id]);

  useEffect(() => {
    fetchChartData(chartRangeMin);
  }, [chartRangeMin, fetchChartData]);

  // 15s periodic chart refresh
  useEffect(() => {
    const interval = setInterval(() => {
      fetchChartData(chartRangeMin);
    }, 15000);
    return () => clearInterval(interval);
  }, [chartRangeMin, fetchChartData]);

  const executeAction = async (command: string) => {
    const ok = await showConfirm(`Execute "${command}"?`);
    if (!ok) return;
    try {
      const data = await api<any>(`/api/vps/${id}/command`, {
        method: 'POST',
        json: { command }
      });
      setCmdResult({ type: 'success', message: `"${command}" executed successfully` });
    } catch (err: any) {
      setCmdResult({ type: 'error', message: `Failed: ${err?.message || "Unknown error"}` });
    }
    setTimeout(() => setCmdResult(null), 4000);
  };

  const handleEditVps = async () => {
    const updated = await api<any>(`/api/vps/${id}`, {
      method: 'PUT',
      json: editForm
    });
    setVps({ ...vps, ...updated });
    setEditModal(false);
  };

  const handleDeleteVps = async () => {
    const ok = await showConfirm("Permanently delete this VPS? This cannot be undone.");
    if (!ok) return;
    await api(`/api/vps/${id}`, { method: 'DELETE' });
    router.push('/vps');
  };

  if (loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-text-muted">
        <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin mb-4" />
        Connecting to instance...
      </div>
    );
  }

  if (!vps) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-text-muted">
        <AlertCircle className="w-8 h-8 text-status-error mb-4" />
        VPS not found or access denied.
      </div>
    );
  }

  const isOffline = vps.status !== 'ONLINE';
  const isAdmin = typeof window !== 'undefined' && (getStoredUser()?.role === 'ADMIN');

  const tabs: { key: TabKey; label: string; icon: any }[] = [
    { key: "overview", label: "Overview", icon: ImageIcon },
    { key: "terminal", label: "Terminal", icon: TerminalSquare },
    { key: "files", label: "File Manager", icon: FolderOpen },
    { key: "rustdesk", label: "Remote Desktop", icon: MonitorPlay },
    { key: "performance", label: "Performance", icon: LineChartIcon },
  ];

  return (
    <div className="max-w-[1600px] mx-auto pb-12">
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setConfirmModal(null)}>
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-neutral-bg2 border border-border-DEFAULT rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <p className="text-text-primary text-sm mb-6">{confirmModal.message}</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirmModal(null)} className="px-4 py-2 text-sm bg-neutral-bg3 hover:bg-neutral-bg4 text-text-primary rounded-xl border border-border-subtle transition-colors">Cancel</button>
              <button onClick={confirmModal.onConfirm} className="px-4 py-2 text-sm bg-brand hover:bg-brand-hover text-white rounded-xl transition-colors">Confirm</button>
            </div>
          </motion.div>
        </div>
      )}

      {editModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setEditModal(false)}>
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-neutral-bg2 border border-border-DEFAULT rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-text-primary mb-4">Edit VPS</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-text-muted mb-1 uppercase">Name</label>
                <input type="text" value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} className="w-full p-2 rounded-lg bg-neutral-bg1 border border-border-DEFAULT text-text-primary text-sm focus:outline-none focus:border-brand" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-muted mb-1 uppercase">IP Address</label>
                <input type="text" value={editForm.ipAddress} onChange={e => setEditForm({...editForm, ipAddress: e.target.value})} className="w-full p-2 rounded-lg bg-neutral-bg1 border border-border-DEFAULT text-text-primary text-sm focus:outline-none focus:border-brand" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-muted mb-1 uppercase">Status</label>
                <select value={editForm.status} onChange={e => setEditForm({...editForm, status: e.target.value})} className="w-full p-2 rounded-lg bg-neutral-bg1 border border-border-DEFAULT text-text-primary text-sm focus:outline-none focus:border-brand">
                  <option value="ONLINE">ONLINE</option>
                  <option value="OFFLINE">OFFLINE</option>
                  <option value="MAINTENANCE">MAINTENANCE</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <button onClick={() => setEditModal(false)} className="px-4 py-2 text-sm bg-neutral-bg3 hover:bg-neutral-bg4 text-text-primary rounded-xl border border-border-subtle transition-colors">Cancel</button>
              <button onClick={handleEditVps} className="px-4 py-2 text-sm bg-brand hover:bg-brand-hover text-white rounded-xl transition-colors">Save</button>
            </div>
          </motion.div>
        </div>
      )}

      {cmdResult && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-lg border ${cmdResult.type === 'success' ? 'bg-status-success/10 border-status-success/30 text-status-success' : 'bg-status-error/10 border-status-error/30 text-status-error'}`}>
          {cmdResult.message}
        </div>
      )}

      <header className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push('/vps')} className="w-10 h-10 rounded-xl bg-neutral-bg2 border border-border-DEFAULT flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-neutral-bg3 transition-colors shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-text-primary flex items-center gap-3">
              {vps.name}
              <span className="flex h-2.5 w-2.5">
                {vps.status === 'ONLINE' ? (<><span className="animate-ping absolute inline-flex h-2.5 w-2.5 rounded-full bg-status-success opacity-75"></span><span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-status-success"></span></>) : vps.status === 'MAINTENANCE' ? (<span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-status-warning"></span>) : (<span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-status-error"></span>)}
              </span>
            </h1>
            <div className="text-text-muted text-sm mt-1 flex items-center gap-2 font-mono">
              <Server className="w-3.5 h-3.5" />
              {vps.ipAddress || "No IP assigned"}
              <span className="text-border-strong">•</span>
              {vps.os}{vps.customOsName ? ` (${vps.customOsName})` : ''}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <RefreshButton vpsId={id} onResult={(ok, msg) => setCmdResult({ type: ok ? 'success' : 'error', message: msg })} />
          {isAdmin && (
            <button onClick={() => { setEditForm({ name: vps.name, ipAddress: vps.ipAddress || '', os: vps.os, status: vps.status }); setEditModal(true); }} className="flex items-center gap-1.5 px-3 py-2 text-xs bg-neutral-bg2 hover:bg-neutral-bg3 text-text-secondary rounded-xl border border-border-DEFAULT transition-colors">
              <Edit3 className="w-3.5 h-3.5" /> Edit
            </button>
          )}
          {isAdmin && (
            <button onClick={handleDeleteVps} className="flex items-center gap-1.5 px-3 py-2 text-xs bg-status-error/10 hover:bg-status-error/20 text-status-error rounded-xl border border-status-error/20 transition-colors">
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
          )}

          <div className="relative">
            <button onClick={() => setMenuOpen(!menuOpen)} className="p-2 text-text-secondary hover:text-text-primary hover:bg-neutral-bg3 rounded-xl border border-border-subtle transition-colors" title="More">
              <MoreVertical className="w-4 h-4" />
            </button>
            <AnimatePresence>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="absolute right-0 mt-2 w-56 bg-neutral-bg2 border border-border-DEFAULT rounded-xl shadow-xl z-50 py-1"
                  >
                    <button onClick={() => { router.push(`/vps/${id}/settings`); setMenuOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-primary hover:bg-neutral-bg3 transition-colors">
                      <SettingsIcon className="w-4 h-4" /> VPS Settings
                    </button>
                    <button onClick={() => { router.push(`/vps/${id}/alerts`); setMenuOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-primary hover:bg-neutral-bg3 transition-colors">
                      <Bell className="w-4 h-4" /> Alert Rules
                    </button>
                    <button onClick={() => { router.push(`/vps/${id}/audit`); setMenuOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-primary hover:bg-neutral-bg3 transition-colors">
                      <History className="w-4 h-4" /> Audit Log
                    </button>
                    <button onClick={() => { router.push('/alerts'); setMenuOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-primary hover:bg-neutral-bg3 transition-colors">
                      <Shield className="w-4 h-4" /> Global Alert Tracker
                    </button>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          {isOffline && (
            <div className="flex items-center gap-2 px-3 py-2 bg-status-error/10 border border-status-error/20 rounded-xl text-xs text-status-error">
              <WifiOff className="w-3.5 h-3.5" /> Offline
            </div>
          )}
        </div>
      </header>

      <div className="bg-neutral-bg2/80 border border-border-DEFAULT rounded-2xl overflow-hidden backdrop-blur-xl shadow-lg">
        <div className="flex border-b border-border-DEFAULT bg-neutral-bg1 overflow-x-auto">
          {tabs.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors relative whitespace-nowrap ${activeTab === tab.key ? 'text-brand-light' : 'text-text-secondary hover:text-text-primary hover:bg-neutral-bg2'}`}>
              <tab.icon className="w-4 h-4" />
              {tab.label}
              {activeTab === tab.key && <motion.div layoutId="tab-indicator" className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand" />}
            </button>
          ))}
        </div>

        <div className="bg-neutral-bg1">
          {activeTab === 'overview' && (
            <div className="p-6 flex flex-col gap-4">
              <ScreenView vpsId={id} imageData={screenshot} isOffline={isOffline} className="w-full h-56 bg-black/50 border border-border-subtle rounded-xl flex items-center justify-center overflow-hidden" />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-neutral-bg2/60 border border-border-subtle rounded-xl p-4">
                  <h3 className="text-xs font-bold tracking-wider uppercase text-text-muted mb-3 flex items-center gap-2"><Activity className="w-3.5 h-3.5" /> Status</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-text-muted">Status</span><span className={`font-medium ${vps.status === 'ONLINE' ? 'text-status-success' : vps.status === 'MAINTENANCE' ? 'text-status-warning' : 'text-status-error'}`}>{vps.status}</span></div>
                    <div className="flex justify-between"><span className="text-text-muted">Last Heartbeat</span><span className="text-text-primary font-mono text-xs flex items-center gap-1"><Clock className="w-3 h-3" />{formatTimeAgo(vps.lastHeartbeat, now)}</span></div>
                    <div className="flex justify-between"><span className="text-text-muted">Socket</span><span className={`flex items-center gap-1 ${socketStatus === 'connected' ? 'text-status-success' : socketStatus === 'error' ? 'text-status-error' : 'text-status-warning'}`}>{socketStatus === 'connected' ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}{socketStatus}</span></div>
                  </div>
                </div>

                <div className="bg-neutral-bg2/60 border border-border-subtle rounded-xl p-4">
                  <h3 className="text-xs font-bold tracking-wider uppercase text-text-muted mb-3 flex items-center gap-2"><Server className="w-3.5 h-3.5" /> System Info</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-text-muted">Name</span><span className="text-text-primary font-medium">{vps.name}</span></div>
                    <div className="flex justify-between"><span className="text-text-muted">IP Address</span><span className="text-text-primary font-mono text-xs">{vps.ipAddress || "N/A"}</span></div>
                    <div className="flex justify-between"><span className="text-text-muted">OS</span><span className="text-text-primary">{vps.os}{vps.customOsName ? ` / ${vps.customOsName}` : ''}</span></div>
                    {vps.user && <div className="flex justify-between"><span className="text-text-muted">Owner</span><span className="text-text-primary text-xs">{vps.user.email}</span></div>}
                  </div>
                </div>

                <div className="bg-neutral-bg2/60 border border-border-subtle rounded-xl p-4">
                  <h3 className="text-xs font-bold tracking-wider uppercase text-text-muted mb-3 flex items-center gap-2"><Cpu className="w-3.5 h-3.5" /> Live Metrics</h3>
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-text-muted">CPU</span>
                        <span className="text-text-primary font-mono">{formatPercent(telemetry.CPUUsage)}%</span>
                      </div>
                      <div className="h-1.5 bg-neutral-bg3 rounded-full overflow-hidden">
                        <div className={`h-full transition-all duration-500 ${(telemetry.CPUUsage || 0) > 85 ? 'bg-status-error' : 'bg-brand'}`} style={{ width: `${telemetry.CPUUsage || 0}%` }} />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-text-muted">RAM</span>
                        <span className="text-text-primary font-mono">{formatPercent(telemetry.RAMUsage)}%{telemetry.RAMTotal ? ` (${formatBytes((telemetry.RAMUsage / 100) * telemetry.RAMTotal)} / ${formatBytes(telemetry.RAMTotal)})` : ''}</span>
                      </div>
                      <div className="h-1.5 bg-neutral-bg3 rounded-full overflow-hidden">
                        <div className={`h-full transition-all duration-500 ${(telemetry.RAMUsage || 0) > 85 ? 'bg-status-warning' : 'bg-dataviz-purple'}`} style={{ width: `${telemetry.RAMUsage || 0}%` }} />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-text-muted">Disk</span>
                        <span className="text-text-primary font-mono">{formatPercent(telemetry.DiskUsage)}%{telemetry.DiskTotal ? ` (${formatBytes((telemetry.DiskUsage / 100) * telemetry.DiskTotal)} / ${formatBytes(telemetry.DiskTotal)})` : ''}</span>
                      </div>
                      <div className="h-1.5 bg-neutral-bg3 rounded-full overflow-hidden">
                        <div className={`h-full transition-all duration-500 ${(telemetry.DiskUsage || 0) > 90 ? 'bg-status-warning' : 'bg-dataviz-blue'}`} style={{ width: `${telemetry.DiskUsage || 0}%` }} />
                      </div>
                    </div>
                    <div className="flex justify-between items-center text-xs pt-1 border-t border-border-subtle">
                      <span className="text-text-muted flex items-center gap-1"><Network className="w-3 h-3" /> Network</span>
                      <div className="font-mono text-text-primary flex flex-col items-end">
                        <span><span className="text-text-muted">Upload </span>{formatNetworkSpeed(telemetry.NetTx || 0)}</span>
                        <span><span className="text-text-muted">Download </span>{formatNetworkSpeed(telemetry.NetRx || 0)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-neutral-bg2/60 border border-border-subtle rounded-xl p-4">
                  <h3 className="text-xs font-bold tracking-wider uppercase text-text-muted mb-3 flex items-center gap-2"><Shield className="w-3.5 h-3.5" /> Quick Actions</h3>
                  <div className="space-y-2">
                    <button onClick={() => setActiveTab('terminal')} className="w-full flex items-center justify-center gap-2 py-2.5 bg-neutral-bg3 hover:bg-neutral-bg4 text-text-primary rounded-lg text-sm font-medium transition-colors border border-border-subtle">
                      <TerminalSquare className="w-4 h-4" /> Open Terminal
                    </button>
                    <div className="grid grid-cols-3 gap-2">
                      <button onClick={() => executeAction('start')} className="flex items-center justify-center gap-1.5 py-2 bg-status-success/10 hover:bg-status-success/20 text-status-success rounded-lg text-xs font-medium transition-colors border border-status-success/20">
                        <Play className="w-3.5 h-3.5" /> Start
                      </button>
                      <button onClick={() => executeAction('restart')} className="flex items-center justify-center gap-1.5 py-2 bg-neutral-bg3 hover:bg-neutral-bg4 text-text-primary rounded-lg text-xs font-medium transition-colors border border-border-subtle">
                        <RefreshCw className="w-3.5 h-3.5" /> Restart
                      </button>
                      <button onClick={() => executeAction('stop')} className="flex items-center justify-center gap-1.5 py-2 bg-status-error/10 hover:bg-status-error/20 text-status-error rounded-lg text-xs font-medium transition-colors border border-status-error/20">
                        <PowerOff className="w-3.5 h-3.5" /> Stop
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'terminal' && (
            isOffline ? (
              <div className="p-12 flex flex-col items-center justify-center text-text-muted">
                <WifiOff className="w-12 h-12 mb-3 opacity-20" />
                <p className="text-sm font-medium">VPS is offline</p>
                <p className="text-xs mt-1">Terminal is unavailable while the VPS is not running.</p>
              </div>
            ) : (
              <div className="p-4 h-[min(750px,70vh)]"><WebPTY vpsId={id} /></div>
            )
          )}

          {activeTab === 'files' && (
            isOffline ? (
              <div className="p-12 flex flex-col items-center justify-center text-text-muted">
                <WifiOff className="w-12 h-12 mb-3 opacity-20" />
                <p className="text-sm font-medium">VPS is offline</p>
                <p className="text-xs mt-1">File Manager is unavailable while the VPS is not running.</p>
              </div>
            ) : (
              <div className="h-[min(750px,70vh)]"><FileManager vpsId={id} /></div>
            )
          )}

          {activeTab === 'rustdesk' && (
            <div className="p-12 flex flex-col items-center justify-center text-text-muted">
              <MonitorPlay className="w-16 h-16 mb-4 opacity-20" />
              <p className="text-lg font-semibold text-text-secondary">Geliştirme Aşamasında</p>
              <p className="text-sm mt-2 text-text-muted max-w-md text-center">Remote Desktop (RustDesk) entegrasyonu üzerinde çalışılmaktadır.</p>
            </div>
          )}

          {activeTab === 'performance' && (
            <div className="p-6 flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-text-primary">Resource Usage</h2>
                <div className="flex gap-1 bg-neutral-bg2 rounded-lg p-0.5 border border-border-subtle">
                  {CHART_RANGES.map(r => (
                    <button key={r.minutes} onClick={() => setChartRangeMin(r.minutes)} className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${chartRangeMin === r.minutes ? 'bg-brand text-white' : 'text-text-secondary hover:text-text-primary'}`}>
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
              {chartData.length === 0 ? (
                <div className="flex flex-col items-center justify-center flex-1 text-text-muted py-12">
                  <LineChartIcon className="w-12 h-12 mb-3 opacity-20" />
                  <p className="text-sm">No historical data available yet.</p>
                  <p className="text-xs mt-1">Metrics are recorded every 15 seconds and retained for 24 hours.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {visibleCharts.includes('cpu') && <ChartPanel title="CPU" unit="%" color="#8251EE" dataKey="cpu" chartData={chartData} />}
                  {visibleCharts.includes('ram') && <ChartPanel title="RAM" unit="%" color="#a855f7" dataKey="ram" chartData={chartData} />}
                  {visibleCharts.includes('disk') && <ChartPanel title="Disk" unit="%" color="#3b82f6" dataKey="disk" chartData={chartData} />}
                  {visibleCharts.includes('network') && (
                    <ChartPanel
                      title="Network"
                      unit="MB/s"
                      color="#10b981"
                      dataKey="netTx"
                      chartData={chartData.map(d => ({ ...d, netTx: (d.netTx || 0) / (1024 * 1024), netRx: (d.netRx || 0) / (1024 * 1024) }))}
                      secondDataKey="netRx"
                      secondColor="#0ea5e9"
                      secondLabel="Download (MB/s)"
                      mainLabel="Upload (MB/s)"
                    />
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
