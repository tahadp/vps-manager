"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Server, Cpu, MemoryStick, Activity,
  Power, PowerOff, RefreshCw, Eye, AlertCircle, Play, GripHorizontal, RefreshCcw
} from "lucide-react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AddVpsModal } from '@/components/vps/AddVpsModal';
import RefreshButton from '@/components/vps/RefreshButton';
import { useSocket } from '@/lib/socket';

function SortableVpsCard(props: any) {
  const { vps, isSelected, m, screenshots, toggleSelect, router } = props;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: vps.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto',
    opacity: isDragging ? 0.8 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className={`group relative bg-neutral-bg2/80 backdrop-blur-xl border ${isSelected ? 'border-brand shadow-glow' : 'border-border-DEFAULT hover:border-brand/50'} rounded-2xl overflow-hidden transition-all duration-300 flex flex-col`}>
      <div {...attributes} {...listeners} className="absolute top-4 left-4 z-20 cursor-grab active:cursor-grabbing p-1 bg-neutral-bg3 rounded text-text-muted hover:text-text-primary">
        <GripHorizontal className="w-4 h-4" />
      </div>

      <div className="absolute top-4 right-4 z-20">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => toggleSelect(vps.id)}
          className="w-4 h-4 rounded border-border-strong bg-neutral-bg1 text-brand focus:ring-brand focus:ring-offset-neutral-bg2 cursor-pointer transition-colors"
        />
      </div>

      <div className="p-5 pb-4 relative z-10 cursor-pointer pt-12" onClick={() => router.push(`/vps/${vps.id}`)}>
        <div className="flex items-start gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl bg-neutral-bg1 border border-border-subtle flex items-center justify-center shrink-0">
            <Server className="w-5 h-5 text-dataviz-blue" />
          </div>
          <div>
            <h3 className="text-base font-bold text-text-primary flex items-center gap-2">
              {vps.name}
              <span className="relative flex h-2 w-2">
                {vps.status === 'ONLINE' ? (
                  <>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-status-success opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-status-success"></span>
                  </>
                ) : vps.status === 'MAINTENANCE' ? (
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-status-warning"></span>
                ) : (
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-status-error"></span>
                )}
              </span>
            </h3>
            <p className="text-xs text-text-muted mt-0.5 font-mono">{vps.ipAddress}</p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-neutral-bg4 text-text-secondary border border-border-subtle">
            {vps.os === 'OTHER' && vps.customOsName ? vps.customOsName : vps.os}
          </span>
        </div>
      </div>

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
            <Eye className="w-6 h-6" />
            <span className="text-xs">No display signal</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 pointer-events-none" />
        <div className="absolute bottom-2 left-3 right-3 flex justify-between text-[10px] font-mono text-white/80">
          <span className="flex items-center gap-1">
            <Activity className="w-3 h-3 text-dataviz-green" />
            UL {(m.NetTx / 1024).toFixed(2)}K
          </span>
          <span className="flex items-center gap-1">
            <Activity className="w-3 h-3 text-dataviz-blue" />
            DL {(m.NetRx / 1024).toFixed(2)}K
          </span>
        </div>
      </div>

      <div className="p-4 grid grid-cols-2 gap-4 flex-1">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-text-muted flex items-center gap-1">
              <Cpu className="w-3.5 h-3.5" /> CPU
            </span>
            <span className="text-text-primary font-medium">{(m.CPUUsage ?? 0).toFixed(2)}%</span>
          </div>
          <div className="w-full bg-neutral-bg4 rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${m.CPUUsage > 85 ? 'bg-status-error shadow-[0_0_8px_rgba(239,68,68,0.5)]' : 'bg-brand'}`}
              style={{ width: `${Math.min(m.CPUUsage || 0, 100)}%` }}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-text-muted flex items-center gap-1">
              <MemoryStick className="w-3.5 h-3.5" /> RAM
            </span>
            <span className="text-text-primary font-medium">{(m.RAMUsage ?? 0).toFixed(2)}%</span>
          </div>
          <div className="w-full bg-neutral-bg4 rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${m.RAMUsage > 85 ? 'bg-status-warning shadow-[0_0_8px_rgba(245,158,11,0.5)]' : 'bg-dataviz-purple'}`}
              style={{ width: `${Math.min(m.RAMUsage || 0, 100)}%` }}
            />
          </div>
        </div>
      </div>

      <div className="p-3 border-t border-border-subtle bg-neutral-bg1/50 flex gap-2 justify-end">
        <RefreshButton vpsId={vps.id} className="p-2 bg-status-info/10 hover:bg-status-info/20 text-status-info rounded-lg transition-colors border border-status-info/20" />
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
          title="Open Detail"
        >
          <Eye className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

const executeCommand = async (vpsId: string, command: string) => {
  if (!confirm(`Execute '${command}' on server?`)) return;
  const token = localStorage.getItem("token");
  if (command === 'refresh') {
    await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/vps/${vpsId}/refresh`, {
      method: "POST", headers: { Authorization: `Bearer ${token}` }
    });
    return;
  }
  await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/vps/${vpsId}/command`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ command })
  });
};

export default function Dashboard() {
  const router = useRouter();
  const [vpsList, setVpsList] = useState<any[]>([]);
  const [metricsMap, setMetricsMap] = useState<Record<string, any>>({});
  const [screenshots, setScreenshots] = useState<Record<string, string>>({});
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { socket, connectionStatus } = useSocket();

  const [selectedVps, setSelectedVps] = useState<string[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [confirmBulk, setConfirmBulk] = useState<{ action: 'restart' | 'stop' | 'refresh' | 'delete'; message: string } | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const savePrefsTimeout = useRef<NodeJS.Timeout | null>(null);
  const subscribedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const token = localStorage.getItem("token");
    const storedUser = localStorage.getItem("user");

    if (!token) { router.push("/login"); return; }
    setUser(JSON.parse(storedUser || '{}'));
  }, [router]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token || !socket) return;

    const fetchVpsList = async () => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/vps`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (!Array.isArray(data)) return;

        const prefsRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/settings/preferences`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        let order: string[] = [];
        if (prefsRes.ok) {
          const prefs = await prefsRes.json();
          if (Array.isArray(prefs.dashboardVpsOrder)) order = prefs.dashboardVpsOrder;
        }

        const sorted = [...data].sort((a, b) => {
          const ai = order.indexOf(a.id);
          const bi = order.indexOf(b.id);
          if (ai === -1 && bi === -1) return 0;
          if (ai === -1) return 1;
          if (bi === -1) return -1;
          return ai - bi;
        });
        setVpsList(sorted);
        setLoading(false);

        data.forEach((vps: any) => {
          if (!subscribedRef.current.has(vps.id)) {
            socket.emit('subscribe_vps', vps.id);
            subscribedRef.current.add(vps.id);
          }
        });
      } catch (error) {
        console.error('Failed to fetch VPS list:', error);
        setLoading(false);
      }
    };

    fetchVpsList();

    const onTelemetry = (update: any) => {
      if (update && update.vpsId) setMetricsMap(prev => ({ ...prev, [update.vpsId]: update }));
    };
    const onScreenshot = (update: any) => {
      if (update && update.vpsId) setScreenshots(prev => ({ ...prev, [update.vpsId]: update.imageData }));
    };
    const onVpsEvent = (e: any) => {
      if (!e) return;
      if (e.type === 'STATUS_CHANGED' && e.vpsId) {
        setVpsList(prev => prev.map(v => v.id === e.vpsId ? { ...v, status: e.status, name: e.name || v.name } : v));
      } else if (e.type === 'ADDED' && e.vpsId) {
        if (!subscribedRef.current.has(e.vpsId)) {
          socket.emit('subscribe_vps', e.vpsId);
          subscribedRef.current.add(e.vpsId);
        }
        setVpsList(prev => {
          if (prev.some(v => v.id === e.vpsId)) return prev;
          return [...prev, { id: e.vpsId, name: e.name, status: e.status, userId: e.userId }];
        });
      } else if (e.type === 'DELETED' && e.vpsId) {
        subscribedRef.current.delete(e.vpsId);
        setVpsList(prev => prev.filter(v => v.id !== e.vpsId));
      } else if (e.type === 'RENAMED' && e.vpsId) {
        setVpsList(prev => prev.map(v => v.id === e.vpsId ? { ...v, name: e.name || v.name } : v));
      }
    };
    const onConnect = () => {
      subscribedRef.current.forEach(id => socket.emit('subscribe_vps', id));
    };

    socket.on('telemetry_update', onTelemetry);
    socket.on('screenshot_update', onScreenshot);
    socket.on('vps_event', onVpsEvent);
    socket.on('connect', onConnect);

    return () => {
      socket.off('telemetry_update', onTelemetry);
      socket.off('screenshot_update', onScreenshot);
      socket.off('vps_event', onVpsEvent);
      socket.off('connect', onConnect);
    };
  }, [socket]);

  const persistOrder = (newList: any[]) => {
    const token = localStorage.getItem('token');
    const ids = newList.map(v => v.id);
    if (savePrefsTimeout.current) clearTimeout(savePrefsTimeout.current);
    savePrefsTimeout.current = setTimeout(() => {
      fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/settings/preferences`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ dashboardVpsOrder: ids })
      }).catch(() => {});
    }, 500);
  };

  const toggleSelect = (id: string) => {
    setSelectedVps(prev => prev.includes(id) ? prev.filter(vId => vId !== id) : [...prev, id]);
  };

  const executeBulkCommand = async (action: 'restart' | 'stop' | 'refresh' | 'delete') => {
    if (selectedVps.length === 0) return;
    setConfirmBulk(null);
    setToast({ type: 'success', message: `Bulk ${action} started for ${selectedVps.length} VPS` });
    setSelectedVps([]);
    setTimeout(() => setToast(null), 3000);
    const token = localStorage.getItem("token");
    try {
      if (action === 'delete') {
        for (const id of selectedVps) {
          await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/vps/${id}`, {
            method: 'DELETE', headers: { Authorization: `Bearer ${token}` }
          });
        }
      } else if (action === 'refresh') {
        await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/vps/bulk/refresh`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ vpsIds: selectedVps, command: 'refresh' })
        });
      } else {
        await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/vps/bulk/command`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ vpsIds: selectedVps, command: action })
        });
      }
    } catch {}
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setVpsList((items) => {
        const oldIndex = items.findIndex(item => item.id === active.id);
        const newIndex = items.findIndex(item => item.id === over.id);
        const newItems = arrayMove(items, oldIndex, newIndex);
        persistOrder(newItems);
        return newItems;
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

  const containerVariants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.05 } }
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
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${
              connectionStatus === 'connected' ? 'bg-status-success' :
              connectionStatus === 'reconnecting' ? 'bg-status-warning animate-pulse' :
              'bg-status-error'
            }`} />
            <span className="text-xs text-text-muted capitalize">{connectionStatus}</span>
          </div>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 bg-brand hover:bg-brand-hover text-white px-4 py-2 rounded-xl transition-all shadow-glow text-sm font-medium"
          >
            <Server className="w-4 h-4" />
            Add VPS
          </button>
        </div>
      </header>

      <AnimatePresence>
        {selectedVps.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mb-4 flex items-center gap-2 bg-brand-subtle px-4 py-2 rounded-xl border border-brand/30"
          >
            <span className="text-xs font-semibold text-brand-light">{selectedVps.length} selected</span>
            <button onClick={() => setConfirmBulk({ action: 'restart', message: `Restart ${selectedVps.length} VPS?` })} className="flex items-center gap-1.5 text-xs bg-neutral-bg2 hover:bg-neutral-bg3 text-text-primary px-3 py-1.5 rounded-lg border border-border-subtle">
              <RefreshCw className="w-3 h-3" /> Restart
            </button>
            <button onClick={() => setConfirmBulk({ action: 'stop', message: `Stop ${selectedVps.length} VPS?` })} className="flex items-center gap-1.5 text-xs bg-status-error/20 hover:bg-status-error/30 text-status-error px-3 py-1.5 rounded-lg border border-status-error/30">
              <PowerOff className="w-3 h-3" /> Stop
            </button>
            <button onClick={() => setConfirmBulk({ action: 'refresh', message: `Refresh ${selectedVps.length} VPS?` })} className="flex items-center gap-1.5 text-xs bg-status-info/15 hover:bg-status-info/25 text-status-info px-3 py-1.5 rounded-lg border border-status-info/30">
              <RefreshCcw className="w-3 h-3" /> Refresh All
            </button>
            {user?.role === 'ADMIN' && (
              <button onClick={() => setConfirmBulk({ action: 'delete', message: `Delete ${selectedVps.length} VPS?` })} className="flex items-center gap-1.5 text-xs bg-status-error/20 hover:bg-status-error/30 text-status-error px-3 py-1.5 rounded-lg border border-status-error/30">
                <AlertCircle className="w-3 h-3" /> Delete
              </button>
            )}
            <button onClick={() => setSelectedVps([])} className="ml-auto text-xs text-text-muted hover:text-text-primary">Clear</button>
          </motion.div>
        )}
      </AnimatePresence>

      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-lg border ${toast.type === 'success' ? 'bg-status-success/10 border-status-success/30 text-status-success' : 'bg-status-error/10 border-status-error/30 text-status-error'}`}>
          {toast.message}
        </div>
      )}

      {confirmBulk && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setConfirmBulk(null)}>
          <div className="bg-neutral-bg2 border border-border-DEFAULT rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <p className="text-text-primary text-sm mb-6">{confirmBulk.message}</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirmBulk(null)} className="px-4 py-2 text-sm bg-neutral-bg3 text-text-primary rounded-xl">Cancel</button>
              <button onClick={() => executeBulkCommand(confirmBulk.action)} className="px-4 py-2 text-sm bg-brand hover:bg-brand-hover text-white rounded-xl">Confirm</button>
            </div>
          </div>
        </div>
      )}

      {vpsList.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 text-text-muted border border-dashed border-border-strong rounded-3xl bg-neutral-bg1/50">
          <Server className="w-16 h-16 mb-4 opacity-50" />
          <p className="text-lg font-medium text-text-secondary mb-2">No servers found</p>
          <p className="text-sm">There are no servers assigned to your account.</p>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={vpsList.map(v => v.id)} strategy={rectSortingStrategy}>
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
