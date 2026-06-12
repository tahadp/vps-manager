"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { io, Socket } from "socket.io-client";
import { Terminal as XTerm } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import Editor from "@monaco-editor/react";
import "xterm/css/xterm.css";
import { motion } from "framer-motion";
import { 
  Server, Cpu, MemoryStick, HardDrive, TerminalSquare, 
  FolderOpen, MonitorPlay, ArrowLeft, RefreshCw, PowerOff,
  FileText, Folder, Save, AlertCircle, LineChart as LineChartIcon
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

export default function VpsDetail({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { id } = params;
  const [vps, setVps] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("terminal");
  const [telemetry, setTelemetry] = useState<any>({});
  const [chartData, setChartData] = useState<any[]>([]);
  
  // File Manager State
  const [currentPath, setCurrentPath] = useState("/");
  const [files, setFiles] = useState<any[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [savingFile, setSavingFile] = useState(false);

  // Terminal & Socket
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const socketRef = useRef<Socket | null>(null);

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
      initSocket(token);
      
      // Mock 24h data
      const mock = [];
      const now = new Date();
      for(let i=24; i>=0; i--) {
        const time = new Date(now.getTime() - i * 60 * 60 * 1000);
        mock.push({
          time: time.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
          cpu: Math.floor(Math.random() * 40) + 10,
          ram: Math.floor(Math.random() * 30) + 40
        });
      }
      setChartData(mock);
    })
    .catch(() => setLoading(false));

    return () => {
      if (socketRef.current) socketRef.current.disconnect();
      if (xtermRef.current) xtermRef.current.dispose();
    };
  }, [id, router]);

  const initSocket = (token: string) => {
    const socket = io(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000', {
      auth: { token }
    });
    socketRef.current = socket;

    socket.emit("subscribe_vps", id);
    socket.on("telemetry_update", (data) => setTelemetry(data));
  };

  // Setup Terminal when tab is active
  useEffect(() => {
    if (activeTab === "terminal" && terminalRef.current && socketRef.current && !xtermRef.current) {
      const term = new XTerm({
        theme: { 
          background: "#18181b", // zinc-900 
          foreground: "#f4f4f5", // zinc-100
          cursor: "#8251EE"
        },
        fontFamily: "'Geist Mono', monospace",
        fontSize: 14,
        cursorBlink: true
      });
      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(terminalRef.current);
      fitAddon.fit();
      xtermRef.current = term;

      socketRef.current.emit("pty_connect", id);

      term.onData((data) => {
        socketRef.current?.emit("pty_input", data);
      });

      socketRef.current.on("pty_output", (data) => {
        term.write(data);
      });

      const handleResize = () => fitAddon.fit();
      window.addEventListener("resize", handleResize);
      return () => window.removeEventListener("resize", handleResize);
    }
  }, [activeTab, id]);

  // Load files when File Manager is active
  useEffect(() => {
    if (activeTab === "files") {
      fetchFiles(currentPath);
    }
  }, [activeTab, currentPath]);

  const fetchFiles = async (path: string) => {
    const token = localStorage.getItem("token");
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/vps/${id}/files?path=${path}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.success) {
      setFiles(data.files || []);
    }
  };

  const openFile = async (fileName: string) => {
    const token = localStorage.getItem("token");
    const fullPath = currentPath === "/" ? `/${fileName}` : `${currentPath}/${fileName}`;
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/vps/${id}/file?path=${fullPath}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.success) {
      setSelectedFile(fullPath);
      setFileContent(data.content);
    }
  };

  const saveFile = async () => {
    if (!selectedFile) return;
    setSavingFile(true);
    const token = localStorage.getItem("token");
    await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/vps/${id}/file`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ path: selectedFile, content: fileContent })
    });
    setSavingFile(false);
    alert("File saved!");
  };

  const executeAction = async (command: string) => {
    if (!confirm(`Are you sure you want to execute: ${command}?`)) return;
    const token = localStorage.getItem("token");
    await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/vps/${id}/command`, {
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
                <span className="animate-ping absolute inline-flex h-2.5 w-2.5 rounded-full bg-status-success opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-status-success"></span>
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
              <div className="absolute inset-0 p-4" ref={terminalRef} />
            )}
            
            {/* File Manager */}
            {activeTab === 'files' && (
              <div className="flex h-full">
                <div className="w-1/3 border-r border-border-DEFAULT p-2 flex flex-col bg-neutral-bg1/50">
                  <div className="px-3 py-2 text-xs font-mono text-text-secondary bg-neutral-bg2 rounded-lg border border-border-subtle mb-2 truncate">
                    {currentPath}
                  </div>
                  <div className="flex-1 overflow-y-auto space-y-1 pr-1">
                    {currentPath !== "/" && (
                      <div 
                        className="flex items-center gap-2 p-2 hover:bg-neutral-bg3 rounded-lg cursor-pointer text-sm text-text-primary transition-colors" 
                        onClick={() => setCurrentPath(currentPath.split("/").slice(0, -1).join("/") || "/")}
                      >
                        <Folder className="w-4 h-4 text-brand-light" />
                        ..
                      </div>
                    )}
                    {files.map(f => (
                      <div 
                        key={f.name} 
                        className={`flex justify-between items-center p-2 rounded-lg cursor-pointer text-sm transition-colors ${selectedFile === (currentPath === "/" ? `/${f.name}` : `${currentPath}/${f.name}`) ? 'bg-brand/20 text-brand-light' : 'hover:bg-neutral-bg3 text-text-primary'}`} 
                        onClick={() => f.isDir ? setCurrentPath(currentPath === "/" ? `/${f.name}` : `${currentPath}/${f.name}`) : openFile(f.name)}
                      >
                        <span className="flex items-center gap-2 truncate">
                          {f.isDir ? <Folder className="w-4 h-4 text-dataviz-blue shrink-0" /> : <FileText className="w-4 h-4 text-text-muted shrink-0" />}
                          <span className="truncate">{f.name}</span>
                        </span>
                        {!f.isDir && <span className="text-xs text-text-muted shrink-0 ml-2">{(f.size / 1024).toFixed(1)} KB</span>}
                      </div>
                    ))}
                  </div>
                </div>
                
                <div className="w-2/3 flex flex-col">
                  {selectedFile ? (
                    <>
                      <div className="px-4 py-2 border-b border-border-DEFAULT flex justify-between items-center bg-neutral-bg2/50">
                        <span className="text-sm font-mono text-text-primary truncate mr-4">{selectedFile}</span>
                        <button 
                          onClick={saveFile} 
                          disabled={savingFile} 
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-brand hover:bg-brand-hover disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-xs font-medium text-white transition-colors shadow-glow"
                        >
                          <Save className="w-3.5 h-3.5" />
                          {savingFile ? "Saving..." : "Save"}
                        </button>
                      </div>
                      <div className="flex-1">
                        <Editor
                          height="100%"
                          theme="vs-dark"
                          value={fileContent}
                          onChange={(val) => setFileContent(val || "")}
                          options={{ 
                            minimap: { enabled: false },
                            fontFamily: "'Geist Mono', monospace",
                            fontSize: 13,
                            padding: { top: 16 }
                          }}
                        />
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-text-muted">
                      <FileText className="w-12 h-12 mb-3 opacity-20" />
                      Select a file to edit
                    </div>
                  )}
                </div>
              </div>
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
