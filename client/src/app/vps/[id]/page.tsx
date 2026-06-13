"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { io, Socket } from "socket.io-client";
import { motion } from "framer-motion";
import { 
  Server, Cpu, MemoryStick, HardDrive, TerminalSquare, 
  FolderOpen, MonitorPlay, ArrowLeft, RefreshCw, PowerOff,
  AlertCircle, LineChart as LineChartIcon
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import WebPTY from "@/components/Terminal";
import FileManager from "@/components/FileManager";

export default function VpsDetail({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { id } = params;
  const [vps, setVps] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("terminal");
  const [telemetry, setTelemetry] = useState<any>({});
  const [chartData, setChartData] = useState<any[]>([]);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }
    
    const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

    fetch(`${API}/api/vps/${id}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    .then(res => res.json())
    .then(data => {
      setVps(data);
      setLoading(false);

      const socket = io(API, { auth: { token } });
      socketRef.current = socket;

      socket.on('connect', () => {
        socket.emit("subscribe_vps", id);
      });

      socket.on("telemetry_update", (d) => setTelemetry(d));

      // Fetch real historical metrics
      fetch(`${API}/api/vps/${id}/metrics?hours=24`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then(res => res.json())
      .then(metrics => {
        if (Array.isArray(metrics) && metrics.length > 0) {
          setChartData(metrics.map((m: any) => ({
            time: new Date(m.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
            cpu: m.cpu,
            ram: m.ram
          })));
        }
      })
      .catch(() => {});
    })
    .catch(() => setLoading(false));

    return () => {
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, [id, router]);

  const executeAction = async (command: string) => {
    if (!confirm(`Are you sure you want to execute: ${command}?`)) return;
    const token = localStorage.getItem("token");
    const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
    await fetch(`${API}/api/vps/${id}/command`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ command })
    });
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

  return (
    <div className="max-w-[1600px] mx-auto pb-12">
      <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => router.push('/')} 
            className="w-10 h-10 rounded-xl bg-neutral-bg2 border border-border-DEFAULT flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-neutral-bg3 transition-colors shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-text-primary flex items-center gap-3">
              {vps.name}
              <span className="flex h-2.5 w-2.5">
                {vps.status === 'ONLINE' ? (
                  <>
                    <span className="animate-ping absolute inline-flex h-2.5 w-2.5 rounded-full bg-status-success opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-status-success"></span>
                  </>
                ) : vps.status === 'MAINTENANCE' ? (
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-status-warning"></span>
                ) : (
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-status-error"></span>
                )}
              </span>
            </h1>
            <div className="text-text-muted text-sm mt-1 flex items-center gap-2 font-mono">
              <Server className="w-3.5 h-3.5" />
              {vps.ipAddress}
              <span className="text-border-strong">•</span>
              {vps.os}
            </div>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Main Workspace (Left) */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="lg:col-span-9 flex flex-col h-[750px] bg-neutral-bg2/80 border border-border-DEFAULT rounded-2xl overflow-hidden backdrop-blur-xl shadow-lg"
        >
          {/* Tabs */}
          <div className="flex border-b border-border-DEFAULT bg-neutral-bg1">
            <button 
              onClick={() => setActiveTab('terminal')} 
              className={`flex items-center gap-2 px-6 py-3.5 text-sm font-medium transition-colors relative ${activeTab === 'terminal' ? 'text-brand-light' : 'text-text-secondary hover:text-text-primary hover:bg-neutral-bg2'}`}
            >
              <TerminalSquare className="w-4 h-4" />
              Terminal
              {activeTab === 'terminal' && <motion.div layoutId="tab-indicator" className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand" />}
            </button>
            <button 
              onClick={() => setActiveTab('files')} 
              className={`flex items-center gap-2 px-6 py-3.5 text-sm font-medium transition-colors relative ${activeTab === 'files' ? 'text-brand-light' : 'text-text-secondary hover:text-text-primary hover:bg-neutral-bg2'}`}
            >
              <FolderOpen className="w-4 h-4" />
              File Manager
              {activeTab === 'files' && <motion.div layoutId="tab-indicator" className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand" />}
            </button>
            <button 
              onClick={() => setActiveTab('rustdesk')} 
              className={`flex items-center gap-2 px-6 py-3.5 text-sm font-medium transition-colors relative ${activeTab === 'rustdesk' ? 'text-brand-light' : 'text-text-secondary hover:text-text-primary hover:bg-neutral-bg2'}`}
            >
              <MonitorPlay className="w-4 h-4" />
              Remote Desktop
              {activeTab === 'rustdesk' && <motion.div layoutId="tab-indicator" className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand" />}
            </button>
            <button 
              onClick={() => setActiveTab('chart')} 
              className={`flex items-center gap-2 px-6 py-3.5 text-sm font-medium transition-colors relative ${activeTab === 'chart' ? 'text-brand-light' : 'text-text-secondary hover:text-text-primary hover:bg-neutral-bg2'}`}
            >
              <LineChartIcon className="w-4 h-4" />
              Performance
              {activeTab === 'chart' && <motion.div layoutId="tab-indicator" className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand" />}
            </button>
          </div>
          
          {/* Tab Contents */}
          <div className="flex-1 overflow-hidden relative bg-neutral-bg1">
            
            {/* Terminal */}
            {activeTab === 'terminal' && (
              <div className="absolute inset-0 p-4">
                <WebPTY vpsId={id} />
              </div>
            )}
            
            {/* File Manager */}
            {activeTab === 'files' && (
              <FileManager vpsId={id} />
            )}

            {/* Remote Desktop */}
            {activeTab === 'rustdesk' && (
              <div className="absolute inset-0 bg-neutral-bg1 flex flex-col items-center justify-center">
                 <iframe 
                   src={process.env.NEXT_PUBLIC_RUSTDESK_URL || "http://localhost:2111/"} 
                   className="w-full h-full border-0" 
                   title="Rustdesk Web Viewer"
                 />
              </div>
            )}

            {/* Performance Chart */}
            {activeTab === 'chart' && (
              <div className="absolute inset-0 bg-neutral-bg1 flex flex-col p-6">
                <h2 className="text-lg font-semibold text-text-primary mb-6">Resource Usage (Last 24h)</h2>
                <div className="flex-1 w-full h-full min-h-[300px]">
                  {chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" vertical={false} />
                        <XAxis dataKey="time" stroke="#a1a1aa" fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis stroke="#a1a1aa" fontSize={12} tickLine={false} axisLine={false} unit="%" />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#18181b', borderColor: '#3f3f46', borderRadius: '8px' }}
                          itemStyle={{ color: '#f4f4f5' }}
                        />
                        <Legend />
                        <Line type="monotone" dataKey="cpu" name="CPU Usage" stroke="#8251EE" strokeWidth={2} dot={false} activeDot={{ r: 6 }} />
                        <Line type="monotone" dataKey="ram" name="RAM Usage" stroke="#a855f7" strokeWidth={2} dot={false} activeDot={{ r: 6 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-text-muted">
                      <LineChartIcon className="w-12 h-12 mb-3 opacity-20" />
                      <p className="text-sm">No historical data available yet.</p>
                      <p className="text-xs text-text-muted mt-1">Metrics will appear as the agent streams telemetry.</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </motion.div>

        {/* Sidebar (Right) */}
        <div className="lg:col-span-3 space-y-6">
          
          {/* Telemetry Metrics */}
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-neutral-bg2/80 border border-border-DEFAULT rounded-2xl p-6 backdrop-blur-xl shadow-sm"
          >
            <h2 className="text-sm font-bold tracking-wider uppercase text-text-muted mb-6">Live Metrics</h2>
            
            <div className="space-y-6">
              {/* CPU */}
              <div>
                <div className="flex justify-between items-end mb-2">
                  <span className="text-sm font-medium text-text-primary flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-brand" /> CPU Usage
                  </span>
                  <span className="text-sm font-mono text-text-secondary">{telemetry.CPUUsage?.toFixed(1) || 0}%</span>
                </div>
                <div className="h-2.5 bg-neutral-bg3 rounded-full overflow-hidden">
                  <div className={`h-full transition-all duration-500 ${(telemetry.CPUUsage || 0) > 85 ? 'bg-status-error' : 'bg-brand'}`} style={{ width: `${telemetry.CPUUsage || 0}%` }}></div>
                </div>
              </div>

              {/* RAM */}
              <div>
                <div className="flex justify-between items-end mb-2">
                  <span className="text-sm font-medium text-text-primary flex items-center gap-2">
                    <MemoryStick className="w-4 h-4 text-dataviz-purple" /> RAM Usage
                  </span>
                  <span className="text-sm font-mono text-text-secondary">{telemetry.RAMUsage?.toFixed(1) || 0}%</span>
                </div>
                <div className="h-2.5 bg-neutral-bg3 rounded-full overflow-hidden">
                  <div className={`h-full transition-all duration-500 ${(telemetry.RAMUsage || 0) > 85 ? 'bg-status-warning' : 'bg-dataviz-purple'}`} style={{ width: `${telemetry.RAMUsage || 0}%` }}></div>
                </div>
              </div>

              {/* Disk */}
              <div>
                <div className="flex justify-between items-end mb-2">
                  <span className="text-sm font-medium text-text-primary flex items-center gap-2">
                    <HardDrive className="w-4 h-4 text-dataviz-blue" /> Disk Usage
                  </span>
                  <span className="text-sm font-mono text-text-secondary">{telemetry.DiskUsage?.toFixed(1) || 0}%</span>
                </div>
                <div className="h-2.5 bg-neutral-bg3 rounded-full overflow-hidden">
                  <div className="h-full bg-dataviz-blue transition-all duration-500" style={{ width: `${telemetry.DiskUsage || 0}%` }}></div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Quick Actions */}
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-neutral-bg2/80 border border-border-DEFAULT rounded-2xl p-6 backdrop-blur-xl shadow-sm"
          >
            <h2 className="text-sm font-bold tracking-wider uppercase text-text-muted mb-4">Quick Actions</h2>
            <div className="space-y-3">
              <button 
                onClick={() => executeAction('restart')} 
                className="w-full flex items-center justify-center gap-2 py-3 bg-neutral-bg3 hover:bg-neutral-bg4 text-text-primary rounded-xl text-sm font-medium transition-colors border border-border-subtle"
              >
                <RefreshCw className="w-4 h-4" />
                Restart Server
              </button>
              <button 
                onClick={() => executeAction('stop')} 
                className="w-full flex items-center justify-center gap-2 py-3 bg-status-error/10 hover:bg-status-error/20 text-status-error rounded-xl text-sm font-medium transition-colors border border-status-error/20"
              >
                <PowerOff className="w-4 h-4" />
                Stop Server
              </button>
            </div>
          </motion.div>

        </div>
      </div>
    </div>
  );
}
