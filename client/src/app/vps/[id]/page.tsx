"use client";
import { useState, useEffect, useRef, use } from "react";
import { useRouter } from "next/navigation";
import { io, Socket } from "socket.io-client";
import { motion } from "framer-motion";
import { 
  Server, Cpu, MemoryStick, HardDrive, TerminalSquare, 
  FolderOpen, MonitorPlay, ArrowLeft, RefreshCw, PowerOff, Play,
  AlertCircle, LineChart as LineChartIcon, Activity, Wifi, WifiOff,
  Clock, Shield, Image as ImageIcon, ArrowUpDown, Plus, Trash2, 
  Edit3, Bell, History, Zap, ChevronDown
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import WebPTY from "@/components/Terminal";
import FileManager from "@/components/FileManager";
import ScreenView from "@/components/ScreenView";

type TabKey = "overview" | "terminal" | "files" | "rustdesk" | "chart";

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatNetworkSpeed(bytesPerSec: number): string {
  if (!bytesPerSec || bytesPerSec === 0) return '0 MB/s';
  const mbps = bytesPerSec / (1024 * 1024);
  return `${mbps.toFixed(2)} MB/s`;
}

function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function VpsDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [vps, setVps] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [telemetry, setTelemetry] = useState<any>({});
  const [chartData, setChartData] = useState<any[]>([]);
  const [chartHours, setChartHours] = useState(24);
  const [chartMetric, setChartMetric] = useState<'all' | 'cpu' | 'ram'>('all');
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [socketStatus, setSocketStatus] = useState<"connecting" | "connected" | "error">("connecting");
  const socketRef = useRef<Socket | null>(null);

  // Confirm modal state
  const [confirmModal, setConfirmModal] = useState<{ message: string; onConfirm: () => void } | null>(null);

  // Audit log state
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [showAudit, setShowAudit] = useState(false);

  // Alert rules state
  const [alertRules, setAlertRules] = useState<any[]>([]);
  const [showRules, setShowRules] = useState(false);
  const [newRule, setNewRule] = useState({ metric: 'CPU', condition: '>', threshold: 90, durationMin: 10, action: 'ALERT', script: '' });

  // Admin edit state
  const [editModal, setEditModal] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', ipAddress: '', os: '', status: '' });

  // Quick commands
  const [quickCmds, setQuickCmds] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      try { return JSON.parse(localStorage.getItem('quickCmds') || '[]'); } catch { return []; }
    }
    return [];
  });
  const [showQuickCmds, setShowQuickCmds] = useState(false);
  const [newQuickCmd, setNewQuickCmd] = useState('');

  // Command result feedback
  const [cmdResult, setCmdResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showConfirm = (message: string): Promise<boolean> => {
    return new Promise(resolve => {
      setConfirmModal({ message, onConfirm: () => { setConfirmModal(null); resolve(true); } });
    });
  };

  const fetchChartData = async (token: string, hours: number) => {
    try {
      const res = await fetch(`${API}/api/vps/${id}/metrics?hours=${hours}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const metrics = await res.json();
      if (Array.isArray(metrics) && metrics.length > 0) {
        setChartData(metrics.map((m: any) => ({
          time: new Date(m.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
          cpu: m.cpu,
          ram: m.ram
        })));
      } else {
        setChartData([]);
      }
    } catch {}
  };

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { router.push("/login"); return; }

    fetch(`${API}/api/vps/${id}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    .then(res => { if (!res.ok) throw new Error("Failed"); return res.json(); })
    .then(data => {
      setVps(data);
      setLoading(false);

      const socket = io(API, { auth: { token } });
      socketRef.current = socket;

      socket.on('connect', () => {
        setSocketStatus("connected");
        socket.emit("subscribe_vps", id);
      });
      socket.on('connect_error', () => setSocketStatus("error"));

      socket.on("telemetry_update", (d) => {
        if (d && d.vpsId === id) {
          setTelemetry(d);
          setChartData(prev => {
            const next = [...prev, {
              time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
              cpu: d.CPUUsage,
              ram: d.RAMUsage
            }];
            return next.slice(-500);
          });
        }
      });

      socket.on("screenshot_update", (d) => {
        if (d && d.vpsId === id && d.imageData) setScreenshot(d.imageData);
      });

      fetchChartData(token, chartHours);
    })
    .catch(() => { setLoading(false); setVps(null); });

    return () => { if (socketRef.current) socketRef.current.disconnect(); };
  }, [id, router]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) fetchChartData(token, chartHours);
  }, [chartHours]);

  // Fetch audit logs
  useEffect(() => {
    if (!showAudit) return;
    const token = localStorage.getItem("token");
    fetch(`${API}/api/audit?take=20`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { if (d.data) setAuditLogs(d.data); })
      .catch(() => {});
  }, [showAudit]);

  // Fetch alert rules
  useEffect(() => {
    if (!showRules) return;
    const token = localStorage.getItem("token");
    fetch(`${API}/api/rules`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setAlertRules(d.filter((r: any) => !r.vpsId || r.vpsId === id)); })
      .catch(() => {});
  }, [showRules, id]);

  const executeAction = async (command: string) => {
    const ok = await showConfirm(`Execute "${command}"?`);
    if (!ok) return;
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${API}/api/vps/${id}/command`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ command })
      });
      const data = await res.json();
      setCmdResult(res.ok
        ? { type: 'success', message: `"${command}" executed successfully` }
        : { type: 'error', message: `Failed: ${data.error || "Unknown error"}` }
      );
    } catch {
      setCmdResult({ type: 'error', message: "Failed to execute. Is the VPS online?" });
    }
    setTimeout(() => setCmdResult(null), 4000);
  };

  const handleDeleteRule = async (ruleId: string) => {
    const ok = await showConfirm("Delete this alert rule?");
    if (!ok) return;
    const token = localStorage.getItem("token");
    await fetch(`${API}/api/rules/${ruleId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    setAlertRules(prev => prev.filter(r => r.id !== ruleId));
  };

  const handleAddRule = async () => {
    const token = localStorage.getItem("token");
    const res = await fetch(`${API}/api/rules`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ vpsId: id, ...newRule })
    });
    if (res.ok) {
      const rule = await res.json();
      setAlertRules(prev => [rule, ...prev]);
      setNewRule({ metric: 'CPU', condition: '>', threshold: 90, durationMin: 10, action: 'ALERT', script: '' });
    }
  };

  const handleEditVps = async () => {
    const token = localStorage.getItem("token");
    const res = await fetch(`${API}/api/vps/${id}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(editForm)
    });
    if (res.ok) {
      const updated = await res.json();
      setVps({ ...vps, ...updated });
      setEditModal(false);
    }
  };

  const handleDeleteVps = async () => {
    const ok = await showConfirm("Permanently delete this VPS? This cannot be undone.");
    if (!ok) return;
    const token = localStorage.getItem("token");
    await fetch(`${API}/api/vps/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    router.push('/vps');
  };

  const addQuickCmd = () => {
    if (!newQuickCmd.trim()) return;
    const updated = [...quickCmds, newQuickCmd.trim()];
    setQuickCmds(updated);
    localStorage.setItem('quickCmds', JSON.stringify(updated));
    setNewQuickCmd('');
  };

  const removeQuickCmd = (idx: number) => {
    const updated = quickCmds.filter((_, i) => i !== idx);
    setQuickCmds(updated);
    localStorage.setItem('quickCmds', JSON.stringify(updated));
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
  const isAdmin = typeof window !== 'undefined' && JSON.parse(atob(localStorage.getItem('token')?.split('.')[1] || '{}')).role === 'ADMIN';

  const tabs: { key: TabKey; label: string; icon: any }[] = [
    { key: "overview", label: "Overview", icon: ImageIcon },
    { key: "terminal", label: "Terminal", icon: TerminalSquare },
    { key: "files", label: "File Manager", icon: FolderOpen },
    { key: "rustdesk", label: "Remote Desktop", icon: MonitorPlay },
    { key: "chart", label: "Performance", icon: LineChartIcon },
  ];

  const timeRanges = [
    { label: '1h', value: 1 },
    { label: '6h', value: 6 },
    { label: '24h', value: 24 },
    { label: '7d', value: 168 },
  ];

  return (
    <div className="max-w-[1600px] mx-auto pb-12">
      {/* Confirm Modal */}
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

      {/* Edit VPS Modal (Admin) */}
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

      {/* Command Result Toast */}
      {cmdResult && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-lg border ${cmdResult.type === 'success' ? 'bg-status-success/10 border-status-success/30 text-status-success' : 'bg-status-error/10 border-status-error/30 text-status-error'}`}>
          {cmdResult.message}
        </div>
      )}

      {/* Header */}
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
              {vps.os}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <>
              <button onClick={() => { setEditForm({ name: vps.name, ipAddress: vps.ipAddress || '', os: vps.os, status: vps.status }); setEditModal(true); }} className="flex items-center gap-1.5 px-3 py-2 text-xs bg-neutral-bg2 hover:bg-neutral-bg3 text-text-secondary rounded-xl border border-border-DEFAULT transition-colors">
                <Edit3 className="w-3.5 h-3.5" /> Edit
              </button>
              <button onClick={handleDeleteVps} className="flex items-center gap-1.5 px-3 py-2 text-xs bg-status-error/10 hover:bg-status-error/20 text-status-error rounded-xl border border-status-error/20 transition-colors">
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>
            </>
          )}
          {isOffline && (
            <div className="flex items-center gap-2 px-3 py-2 bg-status-error/10 border border-status-error/20 rounded-xl text-xs text-status-error">
              <WifiOff className="w-3.5 h-3.5" /> Offline
            </div>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Main Workspace */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="lg:col-span-9 flex flex-col h-[min(750px,70vh)] bg-neutral-bg2/80 border border-border-DEFAULT rounded-2xl overflow-hidden backdrop-blur-xl shadow-lg">
          {/* Tabs */}
          <div className="flex border-b border-border-DEFAULT bg-neutral-bg1 overflow-x-auto">
            {tabs.map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)} className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors relative whitespace-nowrap ${activeTab === tab.key ? 'text-brand-light' : 'text-text-secondary hover:text-text-primary hover:bg-neutral-bg2'}`}>
                <tab.icon className="w-4 h-4" />
                {tab.label}
                {activeTab === tab.key && <motion.div layoutId="tab-indicator" className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand" />}
              </button>
            ))}
          </div>
          
          <div className="flex-1 overflow-hidden relative bg-neutral-bg1">
            {/* Overview */}
            {activeTab === 'overview' && (
              <div className="absolute inset-0 flex flex-col overflow-y-auto">
                <div className="p-6 pb-4">
                  <ScreenView vpsId={id} imageData={screenshot} className="w-full h-56 bg-black/50 border border-border-subtle rounded-xl flex items-center justify-center overflow-hidden" />
                </div>
                <div className="px-6 pb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Status Card */}
                  <div className="bg-neutral-bg2/60 border border-border-subtle rounded-xl p-4">
                    <h3 className="text-xs font-bold tracking-wider uppercase text-text-muted mb-3 flex items-center gap-2"><Activity className="w-3.5 h-3.5" /> Status</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between"><span className="text-text-muted">Status</span><span className={`font-medium ${vps.status === 'ONLINE' ? 'text-status-success' : vps.status === 'MAINTENANCE' ? 'text-status-warning' : 'text-status-error'}`}>{vps.status}</span></div>
                      <div className="flex justify-between"><span className="text-text-muted">Last Heartbeat</span><span className="text-text-primary font-mono text-xs flex items-center gap-1"><Clock className="w-3 h-3" />{formatTimeAgo(vps.lastHeartbeat)}</span></div>
                      <div className="flex justify-between"><span className="text-text-muted">Socket</span><span className={`flex items-center gap-1 ${socketStatus === 'connected' ? 'text-status-success' : socketStatus === 'error' ? 'text-status-error' : 'text-status-warning'}`}>{socketStatus === 'connected' ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}{socketStatus}</span></div>
                    </div>
                  </div>

                  {/* System Info Card */}
                  <div className="bg-neutral-bg2/60 border border-border-subtle rounded-xl p-4">
                    <h3 className="text-xs font-bold tracking-wider uppercase text-text-muted mb-3 flex items-center gap-2"><Server className="w-3.5 h-3.5" /> System Info</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between"><span className="text-text-muted">Name</span><span className="text-text-primary font-medium">{vps.name}</span></div>
                      <div className="flex justify-between"><span className="text-text-muted">IP Address</span><span className="text-text-primary font-mono text-xs">{vps.ipAddress || "N/A"}</span></div>
                      <div className="flex justify-between"><span className="text-text-muted">OS</span><span className="text-text-primary">{vps.os}</span></div>
                      {vps.user && <div className="flex justify-between"><span className="text-text-muted">Owner</span><span className="text-text-primary text-xs">{vps.user.email}</span></div>}
                    </div>
                  </div>

                  {/* Live Metrics Card */}
                  <div className="bg-neutral-bg2/60 border border-border-subtle rounded-xl p-4">
                    <h3 className="text-xs font-bold tracking-wider uppercase text-text-muted mb-3 flex items-center gap-2"><Cpu className="w-3.5 h-3.5" /> Live Metrics</h3>
                    <div className="space-y-3">
                      {/* CPU */}
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-text-muted">CPU</span>
                          <span className="text-text-primary font-mono">{telemetry.CPUUsage?.toFixed(1) || 0}%</span>
                        </div>
                        <div className="h-1.5 bg-neutral-bg3 rounded-full overflow-hidden">
                          <div className={`h-full transition-all duration-500 ${(telemetry.CPUUsage || 0) > 85 ? 'bg-status-error' : 'bg-brand'}`} style={{ width: `${telemetry.CPUUsage || 0}%` }} />
                        </div>
                      </div>
                      {/* RAM */}
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-text-muted">RAM</span>
                          <span className="text-text-primary font-mono">{telemetry.RAMUsage?.toFixed(1) || 0}%{telemetry.RAMTotal ? ` (${formatBytes((telemetry.RAMUsage / 100) * telemetry.RAMTotal)} / ${formatBytes(telemetry.RAMTotal)})` : ''}</span>
                        </div>
                        <div className="h-1.5 bg-neutral-bg3 rounded-full overflow-hidden">
                          <div className={`h-full transition-all duration-500 ${(telemetry.RAMUsage || 0) > 85 ? 'bg-status-warning' : 'bg-dataviz-purple'}`} style={{ width: `${telemetry.RAMUsage || 0}%` }} />
                        </div>
                      </div>
                      {/* Disk */}
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-text-muted">Disk</span>
                          <span className="text-text-primary font-mono">{telemetry.DiskUsage?.toFixed(1) || 0}%{telemetry.DiskTotal ? ` (${formatBytes((telemetry.DiskUsage / 100) * telemetry.DiskTotal)} / ${formatBytes(telemetry.DiskTotal)})` : ''}</span>
                        </div>
                        <div className="h-1.5 bg-neutral-bg3 rounded-full overflow-hidden">
                          <div className={`h-full transition-all duration-500 ${(telemetry.DiskUsage || 0) > 90 ? 'bg-status-warning' : 'bg-dataviz-blue'}`} style={{ width: `${telemetry.DiskUsage || 0}%` }} />
                        </div>
                      </div>
                      {/* Network */}
                      <div className="flex justify-between text-xs pt-1 border-t border-border-subtle">
                        <span className="text-text-muted flex items-center gap-1"><ArrowUpDown className="w-3 h-3" /> Network</span>
                        <span className="text-text-primary font-mono">↑{formatNetworkSpeed(telemetry.NetTx || 0)} ↓{formatNetworkSpeed(telemetry.NetRx || 0)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Quick Actions Card */}
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
            
            {/* Terminal */}
            {activeTab === 'terminal' && (
              isOffline ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-text-muted">
                  <WifiOff className="w-12 h-12 mb-3 opacity-20" />
                  <p className="text-sm font-medium">VPS is offline</p>
                  <p className="text-xs mt-1">Terminal is unavailable while the VPS is not running.</p>
                </div>
              ) : (
                <div className="absolute inset-0 p-4"><WebPTY vpsId={id} /></div>
              )
            )}
            
            {/* File Manager */}
            {activeTab === 'files' && (
              isOffline ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-text-muted">
                  <WifiOff className="w-12 h-12 mb-3 opacity-20" />
                  <p className="text-sm font-medium">VPS is offline</p>
                  <p className="text-xs mt-1">File Manager is unavailable while the VPS is not running.</p>
                </div>
              ) : (
                <FileManager vpsId={id} />
              )
            )}

            {/* Remote Desktop */}
            {activeTab === 'rustdesk' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-text-muted">
                <MonitorPlay className="w-16 h-16 mb-4 opacity-20" />
                <p className="text-lg font-semibold text-text-secondary">Geliştirme Aşamasında</p>
                <p className="text-sm mt-2 text-text-muted max-w-md text-center">Remote Desktop (RustDesk) entegrasyonu üzerinde çalışılmaktadır.</p>
              </div>
            )}

            {/* Performance Chart */}
            {activeTab === 'chart' && (
              <div className="absolute inset-0 bg-neutral-bg1 flex flex-col p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-text-primary">Resource Usage</h2>
                  <div className="flex gap-2">
                    <div className="flex gap-1 bg-neutral-bg2 rounded-lg p-0.5 border border-border-subtle">
                      {([['all', 'All'], ['cpu', 'CPU'], ['ram', 'RAM']] as const).map(([key, label]) => (
                        <button key={key} onClick={() => setChartMetric(key)} className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${chartMetric === key ? 'bg-brand text-white' : 'text-text-secondary hover:text-text-primary'}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-1 bg-neutral-bg2 rounded-lg p-0.5 border border-border-subtle">
                      {timeRanges.map(tr => (
                        <button key={tr.value} onClick={() => setChartHours(tr.value)} className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${chartHours === tr.value ? 'bg-brand text-white' : 'text-text-secondary hover:text-text-primary'}`}>
                          {tr.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex-1 w-full min-h-[300px]">
                  {chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" vertical={false} />
                        <XAxis dataKey="time" stroke="#a1a1aa" fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis stroke="#a1a1aa" fontSize={12} tickLine={false} axisLine={false} unit="%" />
                        <Tooltip contentStyle={{ backgroundColor: '#18181b', borderColor: '#3f3f46', borderRadius: '8px' }} itemStyle={{ color: '#f4f4f5' }} />
                        <Legend />
                        {(chartMetric === 'all' || chartMetric === 'cpu') && <Line type="monotone" dataKey="cpu" name="CPU" stroke="#8251EE" strokeWidth={2} dot={false} activeDot={{ r: 6 }} />}
                        {(chartMetric === 'all' || chartMetric === 'ram') && <Line type="monotone" dataKey="ram" name="RAM" stroke="#a855f7" strokeWidth={2} dot={false} activeDot={{ r: 6 }} />}
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-text-muted">
                      <LineChartIcon className="w-12 h-12 mb-3 opacity-20" />
                      <p className="text-sm">No historical data available yet.</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </motion.div>

        {/* Sidebar */}
        <div className="lg:col-span-3 space-y-4">
          
          {/* Telemetry Metrics */}
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }} className="bg-neutral-bg2/80 border border-border-DEFAULT rounded-2xl p-5 backdrop-blur-xl shadow-sm">
            <h2 className="text-xs font-bold tracking-wider uppercase text-text-muted mb-4">Live Metrics</h2>
            <div className="space-y-4">
              {/* CPU */}
              <div>
                <div className="flex justify-between items-end mb-1.5">
                  <span className="text-sm font-medium text-text-primary flex items-center gap-2"><Cpu className="w-4 h-4 text-brand" /> CPU</span>
                  <span className="text-sm font-mono text-text-secondary">{telemetry.CPUUsage?.toFixed(1) || 0}%</span>
                </div>
                <div className="h-2 bg-neutral-bg3 rounded-full overflow-hidden">
                  <div className={`h-full transition-all duration-500 ${(telemetry.CPUUsage || 0) > 85 ? 'bg-status-error' : 'bg-brand'}`} style={{ width: `${telemetry.CPUUsage || 0}%` }} />
                </div>
              </div>
              {/* RAM */}
              <div>
                <div className="flex justify-between items-end mb-1.5">
                  <span className="text-sm font-medium text-text-primary flex items-center gap-2"><MemoryStick className="w-4 h-4 text-dataviz-purple" /> RAM</span>
                  <span className="text-xs font-mono text-text-secondary">{telemetry.RAMUsage?.toFixed(1) || 0}%{telemetry.RAMTotal ? ` (${formatBytes((telemetry.RAMUsage / 100) * telemetry.RAMTotal)} / ${formatBytes(telemetry.RAMTotal)})` : ''}</span>
                </div>
                <div className="h-2 bg-neutral-bg3 rounded-full overflow-hidden">
                  <div className={`h-full transition-all duration-500 ${(telemetry.RAMUsage || 0) > 85 ? 'bg-status-warning' : 'bg-dataviz-purple'}`} style={{ width: `${telemetry.RAMUsage || 0}%` }} />
                </div>
              </div>
              {/* Disk */}
              <div>
                <div className="flex justify-between items-end mb-1.5">
                  <span className="text-sm font-medium text-text-primary flex items-center gap-2"><HardDrive className="w-4 h-4 text-dataviz-blue" /> Disk</span>
                  <span className="text-xs font-mono text-text-secondary">{telemetry.DiskUsage?.toFixed(1) || 0}%{telemetry.DiskTotal ? ` (${formatBytes((telemetry.DiskUsage / 100) * telemetry.DiskTotal)} / ${formatBytes(telemetry.DiskTotal)})` : ''}</span>
                </div>
                <div className="h-2 bg-neutral-bg3 rounded-full overflow-hidden">
                  <div className={`h-full transition-all duration-500 ${(telemetry.DiskUsage || 0) > 90 ? 'bg-status-warning' : 'bg-dataviz-blue'}`} style={{ width: `${telemetry.DiskUsage || 0}%` }} />
                </div>
              </div>
              {/* Network */}
              <div className="flex items-center justify-between pt-2 border-t border-border-subtle">
                <span className="text-xs text-text-muted flex items-center gap-1.5"><ArrowUpDown className="w-3.5 h-3.5" /> Network</span>
                <div className="text-xs font-mono text-text-primary flex gap-3">
                  <span className="text-status-success">↑ {formatNetworkSpeed(telemetry.NetTx || 0)}</span>
                  <span className="text-dataviz-blue">↓ {formatNetworkSpeed(telemetry.NetRx || 0)}</span>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Quick Actions */}
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 }} className="bg-neutral-bg2/80 border border-border-DEFAULT rounded-2xl p-5 backdrop-blur-xl shadow-sm">
            <h2 className="text-xs font-bold tracking-wider uppercase text-text-muted mb-3">Quick Actions</h2>
            <div className="space-y-2">
              <button onClick={() => executeAction('start')} className="w-full flex items-center justify-center gap-2 py-2.5 bg-status-success/10 hover:bg-status-success/20 text-status-success rounded-xl text-sm font-medium transition-colors border border-status-success/20">
                <Play className="w-4 h-4" /> Start Server
              </button>
              <button onClick={() => executeAction('restart')} className="w-full flex items-center justify-center gap-2 py-2.5 bg-neutral-bg3 hover:bg-neutral-bg4 text-text-primary rounded-xl text-sm font-medium transition-colors border border-border-subtle">
                <RefreshCw className="w-4 h-4" /> Restart Server
              </button>
              <button onClick={() => executeAction('stop')} className="w-full flex items-center justify-center gap-2 py-2.5 bg-status-error/10 hover:bg-status-error/20 text-status-error rounded-xl text-sm font-medium transition-colors border border-status-error/20">
                <PowerOff className="w-4 h-4" /> Stop Server
              </button>
            </div>
          </motion.div>

          {/* Quick Commands */}
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }} className="bg-neutral-bg2/80 border border-border-DEFAULT rounded-2xl p-5 backdrop-blur-xl shadow-sm">
            <button onClick={() => setShowQuickCmds(!showQuickCmds)} className="w-full flex items-center justify-between text-xs font-bold tracking-wider uppercase text-text-muted mb-2">
              <span className="flex items-center gap-1.5"><Zap className="w-3.5 h-3.5" /> Quick Commands</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showQuickCmds ? 'rotate-180' : ''}`} />
            </button>
            {showQuickCmds && (
              <div className="space-y-2">
                {quickCmds.map((cmd, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <button onClick={() => executeAction(cmd)} className="flex-1 text-left px-3 py-1.5 text-xs bg-neutral-bg3 hover:bg-neutral-bg4 text-text-primary rounded-lg border border-border-subtle transition-colors font-mono truncate">
                      {cmd}
                    </button>
                    <button onClick={() => removeQuickCmd(i)} className="p-1 text-text-muted hover:text-status-error rounded"><Trash2 className="w-3 h-3" /></button>
                  </div>
                ))}
                <div className="flex gap-1">
                  <input type="text" value={newQuickCmd} onChange={e => setNewQuickCmd(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addQuickCmd(); }} placeholder="e.g. df -h" className="flex-1 px-2 py-1 text-xs bg-neutral-bg1 border border-border-DEFAULT rounded-lg text-text-primary focus:outline-none focus:border-brand" />
                  <button onClick={addQuickCmd} className="px-2 py-1 text-xs bg-brand text-white rounded-lg hover:bg-brand-hover"><Plus className="w-3 h-3" /></button>
                </div>
              </div>
            )}
          </motion.div>

          {/* Alert Rules */}
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 }} className="bg-neutral-bg2/80 border border-border-DEFAULT rounded-2xl p-5 backdrop-blur-xl shadow-sm">
            <button onClick={() => setShowRules(!showRules)} className="w-full flex items-center justify-between text-xs font-bold tracking-wider uppercase text-text-muted mb-2">
              <span className="flex items-center gap-1.5"><Bell className="w-3.5 h-3.5" /> Alert Rules <span className="bg-neutral-bg3 text-text-secondary py-0.5 px-1.5 rounded text-[10px]">{alertRules.length}</span></span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showRules ? 'rotate-180' : ''}`} />
            </button>
            {showRules && (
              <div className="space-y-2">
                {alertRules.length === 0 ? (
                  <p className="text-xs text-text-muted py-2">No rules configured for this VPS.</p>
                ) : alertRules.map(rule => (
                  <div key={rule.id} className="group flex items-center justify-between p-2 bg-neutral-bg1 border border-border-subtle rounded-lg">
                    <span className="text-xs text-text-primary">{rule.metric} {rule.condition} {rule.threshold}% for {rule.durationMin}m → <span className="text-brand">{rule.action}</span></span>
                    <button onClick={() => handleDeleteRule(rule.id)} className="p-1 text-text-muted hover:text-status-error opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 className="w-3 h-3" /></button>
                  </div>
                ))}
                {/* Add Rule Mini Form */}
                <div className="pt-2 border-t border-border-subtle space-y-2">
                  <div className="grid grid-cols-4 gap-1">
                    <select value={newRule.metric} onChange={e => setNewRule({...newRule, metric: e.target.value})} className="p-1 text-[10px] bg-neutral-bg1 border border-border-DEFAULT rounded text-text-primary">
                      <option value="CPU">CPU</option><option value="RAM">RAM</option><option value="DISK">Disk</option>
                    </select>
                    <select value={newRule.condition} onChange={e => setNewRule({...newRule, condition: e.target.value})} className="p-1 text-[10px] bg-neutral-bg1 border border-border-DEFAULT rounded text-text-primary">
                      <option value=">">&gt;</option><option value="<">&lt;</option>
                    </select>
                    <input type="number" value={newRule.threshold} onChange={e => setNewRule({...newRule, threshold: Number(e.target.value)})} className="p-1 text-[10px] bg-neutral-bg1 border border-border-DEFAULT rounded text-text-primary w-full" placeholder="%" />
                    <select value={newRule.action} onChange={e => setNewRule({...newRule, action: e.target.value})} className="p-1 text-[10px] bg-neutral-bg1 border border-border-DEFAULT rounded text-text-primary">
                      <option value="ALERT">Alert</option><option value="RESTART">Restart</option>
                    </select>
                  </div>
                  <button onClick={handleAddRule} className="w-full py-1.5 text-xs bg-neutral-bg3 hover:bg-neutral-bg4 text-text-primary rounded-lg border border-border-subtle transition-colors">Add Rule</button>
                </div>
              </div>
            )}
          </motion.div>

          {/* Audit Log */}
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }} className="bg-neutral-bg2/80 border border-border-DEFAULT rounded-2xl p-5 backdrop-blur-xl shadow-sm">
            <button onClick={() => setShowAudit(!showAudit)} className="w-full flex items-center justify-between text-xs font-bold tracking-wider uppercase text-text-muted mb-2">
              <span className="flex items-center gap-1.5"><History className="w-3.5 h-3.5" /> Audit Log</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAudit ? 'rotate-180' : ''}`} />
            </button>
            {showAudit && (
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {auditLogs.length === 0 ? (
                  <p className="text-xs text-text-muted py-2">No recent activity.</p>
                ) : auditLogs.map(log => (
                  <div key={log.id} className="p-2 bg-neutral-bg1 border border-border-subtle rounded-lg">
                    <div className="flex justify-between items-start">
                      <span className="text-xs font-mono text-text-primary">{log.action}</span>
                      <span className="text-[10px] text-text-muted">{formatTimeAgo(log.createdAt)}</span>
                    </div>
                    <p className="text-[10px] text-text-muted mt-0.5 truncate">{log.target}</p>
                  </div>
                ))}
              </div>
            )}
          </motion.div>

        </div>
      </div>
    </div>
  );
}
