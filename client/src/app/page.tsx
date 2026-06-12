"use client";
import { useState, useEffect } from "react";
import io from "socket.io-client";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Server, Cpu, MemoryStick, Activity, 
  Power, PowerOff, RefreshCw, TerminalSquare, AlertCircle, Play, GripHorizontal
} from "lucide-react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AddVpsModal } from '@/components/vps/AddVpsModal';

function SortableVpsCard(props: any) {
  const { vps, isSelected, m, screenshots, toggleSelect, executeCommand, router } = props;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: vps.id });
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto',
    opacity: isDragging ? 0.8 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className={`group relative bg-neutral-bg2/80 backdrop-blur-xl border ${isSelected ? 'border-brand shadow-glow' : 'border-border-DEFAULT hover:border-brand/50'} rounded-2xl overflow-hidden transition-all duration-300 flex flex-col`}>
      {/* Drag Handle */}
      <div {...attributes} {...listeners} className="absolute top-4 left-4 z-20 cursor-grab active:cursor-grabbing p-1 bg-neutral-bg3 rounded text-text-muted hover:text-text-primary">
        <GripHorizontal className="w-4 h-4" />
      </div>

      {/* Checkbox */}
      <div className="absolute top-4 right-4 z-20">
        <input 
          type="checkbox" 
          checked={isSelected}
          onChange={() => toggleSelect(vps.id)}
          className="w-4 h-4 rounded border-border-strong bg-neutral-bg1 text-brand focus:ring-brand focus:ring-offset-neutral-bg2 cursor-pointer transition-colors"
        />
      </div>

      {/* Header */}
      <div className="p-5 pb-4 relative z-10 cursor-pointer pt-12" onClick={() => router.push(`/vps/${vps.id}`)}>
        <div className="flex items-start gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl bg-neutral-bg1 border border-border-subtle flex items-center justify-center shrink-0">
            <Server className="w-5 h-5 text-dataviz-blue" />
          </div>
          <div>
            <h3 className="text-base font-bold text-text-primary flex items-center gap-2">
              {vps.name}
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-status-success opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-status-success"></span>
              </span>
            </h3>
            <p className="text-xs text-text-muted mt-0.5 font-mono">{vps.ipAddress}</p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-neutral-bg4 text-text-secondary border border-border-subtle">
            {vps.os}
          </span>
        </div>
      </div>

      {/* Screenshot Area */}
      <div 
        className="w-full h-36 bg-black/50 border-y border-border-subtle overflow-hidden flex items-center justify-center relative cursor-pointer group-hover:border-border-DEFAULT transition-colors" 
        onClick={() => router.push(`/vps/${vps.id}`)}
      >
        {screenshots[vps.id] ? (
          <img 
            src={`data:image/jpeg;base64,${screenshots[vps.id]}`} 
            alt="Screenshot" 
            className="w-full h-full object-cover opacity-70 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500" 
            loading="lazy" 
          />
        ) : (
          <div className="flex flex-col items-center text-text-muted/50 gap-2">
            <TerminalSquare className="w-6 h-6" />
            <span className="text-xs">No display signal</span>
          </div>
        )}
        
        {/* Overlay gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 pointer-events-none" />
        
        {/* Network Stats Overlay */}
        <div className="absolute bottom-2 left-3 right-3 flex justify-between text-[10px] font-mono text-white/80">
          <span className="flex items-center gap-1">
            <Activity className="w-3 h-3 text-dataviz-green" /> 
            UL {(m.NetTx / 1024).toFixed(1)}K
          </span>
          <span className="flex items-center gap-1">
            <Activity className="w-3 h-3 text-dataviz-blue" /> 
            DL {(m.NetRx / 1024).toFixed(1)}K
          </span>
        </div>
      </div>

      {/* Metrics */}
      <div className="p-4 grid grid-cols-2 gap-4 flex-1">
        {/* CPU */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-text-muted flex items-center gap-1">
              <Cpu className="w-3.5 h-3.5" /> CPU
            </span>
            <span className="text-text-primary font-medium">{m.CPUUsage.toFixed(1)}%</span>
          </div>
          <div className="w-full bg-neutral-bg4 rounded-full h-1.5 overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all duration-500 ${m.CPUUsage > 85 ? 'bg-status-error shadow-[0_0_8px_rgba(239,68,68,0.5)]' : 'bg-brand'}`} 
              style={{ width: `${Math.min(m.CPUUsage, 100)}%` }} 
            />
          </div>
        </div>

        {/* RAM */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-text-muted flex items-center gap-1">
              <MemoryStick className="w-3.5 h-3.5" /> RAM
            </span>
            <span className="text-text-primary font-medium">{m.RAMUsage.toFixed(1)}%</span>
          </div>
          <div className="w-full bg-neutral-bg4 rounded-full h-1.5 overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all duration-500 ${m.RAMUsage > 85 ? 'bg-status-warning shadow-[0_0_8px_rgba(245,158,11,0.5)]' : 'bg-dataviz-purple'}`} 
              style={{ width: `${Math.min(m.RAMUsage, 100)}%` }} 
            />
          </div>
        </div>
      </div>

      {/* Actions Footer */}
      <div className="p-3 border-t border-border-subtle bg-neutral-bg1/50 flex gap-2 justify-end">
        <button 
          onClick={() => executeCommand(vps.id, 'restart')} 
          className="p-2 bg-neutral-bg3 hover:bg-neutral-bg4 text-text-secondary hover:text-text-primary rounded-lg transition-colors border border-border-subtle" 
          title="Restart Server"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
        <button 
          onClick={() => executeCommand(vps.id, 'stop')} 
          className="p-2 bg-status-error/10 hover:bg-status-error/20 text-status-error rounded-lg transition-colors border border-status-error/20" 
          title="Power Off"
        >
          <PowerOff className="w-4 h-4" />
        </button>
        <button 
          onClick={() => router.push(`/vps/${vps.id}`)} 
          className="p-2 bg-brand/10 hover:bg-brand/20 text-brand-light rounded-lg transition-colors border border-brand/20 ml-1" 
          title="Open Console"
        >
          <TerminalSquare className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const router = useRouter();
  const [vpsList, setVpsList] = useState<any[]>([]);
  const [metricsMap, setMetricsMap] = useState<Record<string, any>>({});
  const [screenshots, setScreenshots] = useState<Record<string, string>>({});
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  // Bulk Selection
  const [selectedVps, setSelectedVps] = useState<string[]>([]);

  // Add Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    const storedUser = localStorage.getItem("user");
    
    if (!token) {
      router.push("/login");
      return;
    }
    setUser(JSON.parse(storedUser || '{}'));

    fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/vps`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (!Array.isArray(data)) return;
        setVpsList(data);
        setLoading(false);

        const socket = io(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000', {
          auth: { token }
        });

        socket.on('connect', () => {
          data.forEach(vps => socket.emit('subscribe_vps', vps.id));
        });

        socket.on('telemetry_update', (update) => {
          setMetricsMap(prev => ({ ...prev, [update.vpsId]: update }));
        });

        socket.on('screenshot_update', (update) => {
          setScreenshots(prev => ({ ...prev, [update.vpsId]: update.imageData }));
        });

        return () => socket.disconnect();
      })
      .catch(() => {
        setLoading(false);
      });
  }, [router]);

  const toggleSelect = (id: string) => {
    setSelectedVps(prev => prev.includes(id) ? prev.filter(vId => vId !== id) : [...prev, id]);
  };

  const executeCommand = async (vpsId: string, command: string) => {
    if (!confirm(`Execute '${command}' on server?`)) return;
    const token = localStorage.getItem("token");
    await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/vps/${vpsId}/command`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ command })
    });
  };

  const executeBulkCommand = async (command: string) => {
    if (selectedVps.length === 0) return alert("Select at least one VPS");
    if (!confirm(`Execute '${command}' on ${selectedVps.length} server(s)?`)) return;
    const token = localStorage.getItem("token");
    await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/vps/bulk/command`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ vpsIds: selectedVps, command })
    });
    setSelectedVps([]);
  };

  // Dnd Sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setVpsList((items) => {
        const oldIndex = items.findIndex(item => item.id === active.id);
        const newIndex = items.findIndex(item => item.id === over.id);
        
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  if (loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-text-muted">
        <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin mb-4" />
        Initializing Dashboard...
      </div>
    );
  }

  // Animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.05 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
  };

  return (
    <div className="max-w-[1600px] mx-auto pb-12">
      <header className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-text-primary mb-2 flex items-center gap-3">
            <Activity className="w-8 h-8 text-brand" />
            Infrastructure Overview
          </h1>
          <p className="text-text-secondary text-sm">
            Monitor and manage your active virtual private servers in real-time.
          </p>
        </div>

        <div className="flex items-center gap-4">
          <AnimatePresence>
            {selectedVps.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="flex items-center gap-2 bg-brand-subtle px-4 py-2 rounded-xl border border-brand/30 shadow-glow"
              >
                <span className="text-xs font-semibold text-brand-light mr-2">
                  {selectedVps.length} selected
                </span>
                <button onClick={() => executeBulkCommand('restart')} className="flex items-center gap-1.5 text-xs bg-neutral-bg2 hover:bg-neutral-bg3 text-text-primary px-3 py-1.5 rounded-lg transition-colors border border-border-subtle">
                  <RefreshCw className="w-3 h-3" /> Restart
                </button>
                <button onClick={() => executeBulkCommand('stop')} className="flex items-center gap-1.5 text-xs bg-status-error/20 hover:bg-status-error/30 text-status-error px-3 py-1.5 rounded-lg transition-colors border border-status-error/30">
                  <PowerOff className="w-3 h-3" /> Stop
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 bg-brand hover:bg-brand-hover text-white px-4 py-2 rounded-xl transition-all shadow-glow text-sm font-medium"
          >
            <Server className="w-4 h-4" />
            Add VPS
          </button>
        </div>
      </header>

      {vpsList.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 text-text-muted border border-dashed border-border-strong rounded-3xl bg-neutral-bg1/50">
          <Server className="w-16 h-16 mb-4 opacity-50" />
          <p className="text-lg font-medium text-text-secondary mb-2">No servers found</p>
          <p className="text-sm">There are no servers assigned to your account.</p>
        </div>
      ) : (
        <DndContext 
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext 
            items={vpsList.map(v => v.id)}
            strategy={rectSortingStrategy}
          >
            <motion.div 
              variants={containerVariants}
              initial="hidden"
              animate="show"
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
            >
              {vpsList.map(vps => {
                const m = metricsMap[vps.id] || { CPUUsage: 0, RAMUsage: 0, NetTx: 0, NetRx: 0 };
                const isSelected = selectedVps.includes(vps.id);
                
                return (
                  <SortableVpsCard 
                    key={vps.id}
                    vps={vps}
                    isSelected={isSelected}
                    m={m}
                    screenshots={screenshots}
                    toggleSelect={toggleSelect}
                    executeCommand={executeCommand}
                    router={router}
                  />
                );
              })}
            </motion.div>
          </SortableContext>
        </DndContext>
      )}

      <AddVpsModal 
        isOpen={isAddModalOpen} 
        onClose={() => setIsAddModalOpen(false)} 
        onSuccess={(newVps) => setVpsList([...vpsList, newVps])} 
      />
    </div>
  );
}
