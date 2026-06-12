"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { io, Socket } from "socket.io-client";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import Editor from "@monaco-editor/react";
import "xterm/css/xterm.css";

export default function VpsDetail({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { id } = params;
  const [vps, setVps] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("terminal");
  const [telemetry, setTelemetry] = useState<any>({});
  
  // File Manager State
  const [currentPath, setCurrentPath] = useState("/");
  const [files, setFiles] = useState<any[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [savingFile, setSavingFile] = useState(false);

  // Terminal & Socket
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
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
      const term = new Terminal({
        theme: { background: "#000000", foreground: "#ffffff" },
        fontFamily: "monospace",
        fontSize: 14
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
    alert("Command queued");
  };

  if (loading) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-white">Loading...</div>;
  if (!vps) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-white">VPS not found</div>;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">{vps.name}</h1>
            <p className="text-zinc-400 text-sm mt-1">{vps.ipAddress} • {vps.os}</p>
          </div>
          <button onClick={() => router.push('/')} className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl transition-colors text-sm font-medium">
            Back to Dashboard
          </button>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3 flex flex-col h-[700px] bg-zinc-900/50 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-xl">
            {/* Tabs */}
            <div className="flex border-b border-white/10 bg-black/20">
              <button onClick={() => setActiveTab('terminal')} className={`px-6 py-3 text-sm font-medium transition-colors ${activeTab === 'terminal' ? 'text-white border-b-2 border-indigo-500' : 'text-zinc-400 hover:text-white'}`}>Terminal</button>
              <button onClick={() => setActiveTab('files')} className={`px-6 py-3 text-sm font-medium transition-colors ${activeTab === 'files' ? 'text-white border-b-2 border-indigo-500' : 'text-zinc-400 hover:text-white'}`}>File Manager</button>
              <button onClick={() => setActiveTab('rustdesk')} className={`px-6 py-3 text-sm font-medium transition-colors ${activeTab === 'rustdesk' ? 'text-white border-b-2 border-indigo-500' : 'text-zinc-400 hover:text-white'}`}>Rustdesk Web</button>
            </div>
            
            {/* Tab Contents */}
            <div className="flex-1 overflow-hidden relative">
              {activeTab === 'terminal' && (
                <div className="absolute inset-0 p-2 bg-black" ref={terminalRef}></div>
              )}
              {activeTab === 'files' && (
                <div className="flex h-full">
                  <div className="w-1/3 border-r border-white/10 p-4 overflow-y-auto">
                    <div className="text-sm text-zinc-400 mb-4">{currentPath}</div>
                    {currentPath !== "/" && (
                      <div className="cursor-pointer text-indigo-400 mb-2" onClick={() => setCurrentPath(currentPath.split("/").slice(0, -1).join("/") || "/")}>
                        📂 ..
                      </div>
                    )}
                    {files.map(f => (
                      <div key={f.name} className="flex justify-between items-center p-2 hover:bg-white/5 cursor-pointer text-sm" onClick={() => f.isDir ? setCurrentPath(currentPath === "/" ? `/${f.name}` : `${currentPath}/${f.name}`) : openFile(f.name)}>
                        <span>{f.isDir ? "📁" : "📄"} {f.name}</span>
                        {!f.isDir && <span className="text-xs text-zinc-500">{f.size} B</span>}
                      </div>
                    ))}
                  </div>
                  <div className="w-2/3 flex flex-col">
                    {selectedFile ? (
                      <>
                        <div className="p-2 border-b border-white/10 flex justify-between items-center bg-black/40">
                          <span className="text-sm font-mono text-zinc-300">{selectedFile}</span>
                          <button onClick={saveFile} disabled={savingFile} className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 rounded text-xs">
                            {savingFile ? "Saving..." : "Save"}
                          </button>
                        </div>
                        <div className="flex-1">
                          <Editor
                            height="100%"
                            theme="vs-dark"
                            value={fileContent}
                            onChange={(val) => setFileContent(val || "")}
                            options={{ minimap: { enabled: false } }}
                          />
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center justify-center h-full text-zinc-500">Select a file to edit</div>
                    )}
                  </div>
                </div>
              )}
              {activeTab === 'rustdesk' && (
                <div className="absolute inset-0 bg-black flex items-center justify-center">
                   <iframe src={process.env.NEXT_PUBLIC_RUSTDESK_URL || "http://localhost:2111/"} className="w-full h-full border-0" title="Rustdesk Web Viewer"></iframe>
                   {/* In production, URL should point to actual rustdesk web client deployed */}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-zinc-900/50 border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
              <h2 className="text-lg font-semibold text-white mb-4">Quick Actions</h2>
              <div className="space-y-3">
                <button onClick={() => executeAction('stop')} className="w-full py-3 bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded-xl text-sm font-medium transition-colors border border-red-500/20">
                  Stop Server
                </button>
                <button onClick={() => executeAction('restart')} className="w-full py-3 bg-yellow-600/20 hover:bg-yellow-600/40 text-yellow-400 rounded-xl text-sm font-medium transition-colors border border-yellow-500/20">
                  Restart Server
                </button>
              </div>
            </div>

            <div className="bg-zinc-900/50 border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
              <h2 className="text-lg font-semibold text-white mb-4">Live Metrics</h2>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-zinc-400">CPU Usage</span>
                    <span className="text-white">{telemetry.CPUUsage?.toFixed(1) || 0}%</span>
                  </div>
                  <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500" style={{ width: `${telemetry.CPUUsage || 0}%` }}></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-zinc-400">RAM Usage</span>
                    <span className="text-white">{telemetry.RAMUsage?.toFixed(1) || 0}%</span>
                  </div>
                  <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500" style={{ width: `${telemetry.RAMUsage || 0}%` }}></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-zinc-400">Disk Usage</span>
                    <span className="text-white">{telemetry.DiskUsage?.toFixed(1) || 0}%</span>
                  </div>
                  <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full bg-purple-500" style={{ width: `${telemetry.DiskUsage || 0}%` }}></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
