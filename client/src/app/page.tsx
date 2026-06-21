"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Server, Cpu, MemoryStick, Activity,
  PowerOff, RefreshCw, Eye, AlertCircle, GripHorizontal, RefreshCcw, X
} from "lucide-react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AddVpsModal } from '@/components/vps/AddVpsModal';
import { Modal } from '@/components/Modal';
import RefreshButton from '@/components/vps/RefreshButton';
import { useSocket } from '@/lib/socket';
import { api, getStoredUser, setStoredUser } from '@/lib/api';
import { useInView } from '@/hooks/useInView';

function SortableVpsCard(props: any) {
  const { vps, isSelected, m, screenshots, toggleSelect, router } = props;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: vps.id });
  const [screenshotRef, inView] = useInView();

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto',
    opacity: isDragging ? 0.8 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className={`group relative bg-bg-raised border ${isSelected ? 'border-brand shadow-glow' : 'border-border hover:border-border-strong'} rounded-lg overflow-hidden transition-colors duration-150 flex flex-col`}>
      <div {...attributes} {...listeners} className="absolute top-3 left-3 z-20 cursor-grab active:cursor-grabbing p-1 bg-bg-elevated rounded text-text-muted hover:text-text-primary">
        <GripHorizontal className="w-3.5 h-3.5" />
      </div>

      <div className="absolute top-3 right-3 z-20">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => toggleSelect(vps.id)}
          className="h-4 w-4 rounded border-border bg-bg-sunken text-brand focus:ring-2 focus:ring-brand focus:ring-offset-1 focus:ring-offset-bg-raised cursor-pointer accent-[var(--brand)]"
        />
      </div>

      <div className="p-4 pb-3 relative z-10 cursor-pointer pt-11" onClick={() => router.push(`/vps/${vps.id}`)}>
        <div className="flex items-start gap-3 mb-1">
          <div className="h-9 w-9 rounded-md bg-bg-sunken border border-border-subtle flex items-center justify-center shrink-0">
            <Server className="w-4 h-4 text-dataviz-blue" />
          </div>
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold text-text-primary flex items-center gap-2 truncate">
              <span className="truncate">{vps.name}</span>
              <span className="relative flex h-2 w-2 shrink-0">
                {vps.status === 'ONLINE' ? (
                  <>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-status-success opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-status-success" />
                  </>
                ) : vps.status === 'MAINTENANCE' ? (
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-status-warning" />
                ) : (
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-status-error" />
                )}
              </span>
            </h3>
            <p className="text-xs text-text-muted mt-0.5 font-mono tabular-nums truncate">
              {vps.ipAddress}
            </p>
          </div>
        </div>
        <div className="mt-2.5 flex items-center gap-1.5">
          <span className="text-[11px] font-medium px-2 py-0.5 rounded-sm bg-bg-elevated text-text-secondary border border-border-subtle">
            {vps.os === 'OTHER' && vps.customOsName ? vps.customOsName : vps.os}
          </span>
        </div>
      </div>

      <div
        ref={screenshotRef}
        className="w-full h-32 bg-bg-sunken border-y border-border-subtle overflow-hidden flex items-center justify-center relative cursor-pointer group-hover:border-border transition-colors"
        onClick={() => router.push(`/vps/${vps.id}`)}
      >
        {screenshots[vps.id] && inView ? (
          <img
            src={`data:image/jpeg;base64,${screenshots[vps.id]}`}
            alt={`${vps.name} screen`}
            className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-[1.02] transition-all duration-500"
            loading="lazy"
          />
        ) : (
          <div className="flex flex-col items-center text-text-muted/60 gap-1.5">
            {screenshots[vps.id] ? (
              <div className="w-full h-full bg-bg-elevated animate-pulse" />
            ) : (
              <>
                <Eye className="w-5 h-5" />
                <span className="text-xs">No display signal</span>
              </>
            )}
          </div>
        )}
        <div className="absolute bottom-1.5 left-2.5 right-2.5 flex justify-between text-[10px] font-mono text-text-muted tabular-nums">
          <span className="flex items-center gap-1">
            <Activity className="w-3 h-3 text-status-success" />
            UL {(m.NetTx / 1024).toFixed(2)}K
          </span>
          <span className="flex items-center gap-1">
            <Activity className="w-3 h-3 text-dataviz-blue" />
            DL {(m.NetRx / 1024).toFixed(2)}K
          </span>
        </div>
      </div>

      <div className="p-3 grid grid-cols-2 gap-3 flex-1">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-text-muted flex items-center gap-1">
              <Cpu className="w-3.5 h-3.5" /> CPU
            </span>
            <span className="text-text-primary font-medium tabular-nums">{(m.CPUUsage ?? 0).toFixed(2)}%</span>
          </div>
          <div className="w-full bg-bg-elevated rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${m.CPUUsage > 85 ? 'bg-status-error' : 'bg-brand'}`}
              style={{ width: `${Math.min(m.CPUUsage || 0, 100)}%` }}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-text-muted flex items-center gap-1">
              <MemoryStick className="w-3.5 h-3.5" /> RAM
            </span>
            <span className="text-text-primary font-medium tabular-nums">{(m.RAMUsage ?? 0).toFixed(2)}%</span>
          </div>
          <div className="w-full bg-bg-elevated rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${m.RAMUsage > 85 ? 'bg-status-warning' : 'bg-dataviz-purple'}`}
              style={{ width: `${Math.min(m.RAMUsage || 0, 100)}%` }}
            />
          </div>
        </div>
      </div>

      <div className="p-2 border-t border-border-subtle bg-bg-elevated/30 flex gap-1.5 justify-end">
        <RefreshButton vpsId={vps.id} disabled={vps.status !== 'ONLINE'} className="h-8 w-8 inline-flex items-center justify-center bg-status-info/10 hover:bg-status-info/20 text-status-info rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed" />
        <button
          onClick={() => executeCommand(vps.id, 'restart')}
          disabled={vps.status !== 'ONLINE'}
          className="h-8 w-8 inline-flex items-center justify-center bg-bg-elevated hover:bg-bg-overlay text-text-secondary hover:text-text-primary rounded-md transition-colors border border-border-subtle disabled:opacity-40 disabled:cursor-not-allowed"
          title="Restart server"
          aria-label="Restart server"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => executeCommand(vps.id, 'stop')}
          disabled={vps.status !== 'ONLINE'}
          className="h-8 w-8 inline-flex items-center justify-center bg-status-error/10 hover:bg-status-error/20 text-status-error rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title="Power off"
          aria-label="Power off"
        >
          <PowerOff className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => router.push(`/vps/${vps.id}`)}
          className="h-8 w-8 inline-flex items-center justify-center bg-brand-soft hover:bg-brand text-brand hover:text-text-inverse rounded-md transition-colors"
          title="Open detail"
          aria-label="Open detail"
        >
          <Eye className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

const executeCommand = async (vpsId: string, command: string) => {
  if (!confirm(`Execute '${command}' on server?`)) return;
  if (command === 'refresh') {
    await api(`/api/vps/${vpsId}/refresh`, { method: 'POST' });
    return;
  }
  await api(`/api/vps/${vpsId}/command`, { method: 'POST', json: { command } });
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
    const storedUser = getStoredUser();
    if (!storedUser) { router.push("/login"); return; }
    setUser(storedUser);
  }, [router]);

  useEffect(() => {
    if (!socket) return;

    const fetchVpsList = async () => {
      try {
        const data = await api<any[]>('/api/vps');
        if (!Array.isArray(data)) return;

        const initialScreenshots: Record<string, string> = {};
        data.forEach((vps: any) => {
          if (vps.latestScreenshot) {
            initialScreenshots[vps.id] = vps.latestScreenshot;
          }
        });
        setScreenshots(prev => ({ ...initialScreenshots, ...prev }));

        let order: string[] = [];
        try {
          const prefs = await api<{ dashboardVpsOrder?: string[] }>('/api/settings/preferences');
          if (Array.isArray(prefs?.dashboardVpsOrder)) order = prefs.dashboardVpsOrder;
        } catch { /* ignore */ }

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
    const ids = newList.map(v => v.id);
    if (savePrefsTimeout.current) clearTimeout(savePrefsTimeout.current);
    savePrefsTimeout.current = setTimeout(() => {
      api('/api/settings/preferences', {
        method: 'PUT',
        json: { dashboardVpsOrder: ids }
      }).catch(() => {});
    }, 500);
  };

  const toggleSelect = (id: string) => {
    setSelectedVps(prev => prev.includes(id) ? prev.filter(vId => vId !== id) : [...prev, id]);
  };

  const executeBulkCommand = async (action: 'restart' | 'stop' | 'refresh' | 'delete') => {
    const targets = [...selectedVps];
    if (targets.length === 0) return;
    setConfirmBulk(null);
    setToast({ type: 'success', message: `Bulk ${action} started for ${targets.length} VPS` });
    setSelectedVps([]);
    setTimeout(() => setToast(null), 3000);
    try {
      if (action === 'delete') {
        for (const id of targets) {
          await api(`/api/vps/${id}`, { method: 'DELETE' });
        }
      } else if (action === 'refresh') {
        await api('/api/vps/bulk/refresh', {
          method: 'POST',
          json: { vpsIds: targets }
        });
      } else {
        await api('/api/vps/bulk/command', {
          method: 'POST',
          json: { vpsIds: targets, command: action }
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
        <div className="h-6 w-6 border-2 border-brand border-t-transparent rounded-full animate-spin mb-3" />
        Initializing dashboard…
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
      <header className="mb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary mb-1 flex items-center gap-2.5">
            <Activity className="w-5 h-5 text-brand" />
            Infrastructure
          </h1>
          <p className="text-text-secondary text-sm">
            Live status for every host in your account.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <span className={`h-1.5 w-1.5 rounded-full ${
              connectionStatus === 'connected' ? 'bg-status-success' :
              connectionStatus === 'reconnecting' ? 'bg-status-warning animate-pulse' :
              'bg-status-error'
            }`} />
            <span className="capitalize">{connectionStatus}</span>
          </div>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="inline-flex items-center gap-2 bg-brand hover:bg-brand-hover text-text-inverse h-9 px-3.5 rounded-md text-sm font-medium transition-colors"
          >
            <Server className="w-4 h-4" />
            Add VPS
          </button>
        </div>
      </header>

      <AnimatePresence>
        {selectedVps.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mb-4 flex items-center gap-2 bg-brand-soft px-3 h-10 rounded-md border border-brand/30"
          >
            <span className="text-xs font-medium text-text-primary">
              {selectedVps.length} selected
            </span>
            <button
              onClick={() => setConfirmBulk({ action: 'restart', message: `Restart ${selectedVps.length} VPS?` })}
              className="inline-flex items-center gap-1.5 text-xs bg-bg-raised hover:bg-bg-elevated text-text-primary px-2.5 h-7 rounded-md border border-border-subtle"
            >
              <RefreshCw className="w-3 h-3" /> Restart
            </button>
            <button
              onClick={() => setConfirmBulk({ action: 'stop', message: `Stop ${selectedVps.length} VPS?` })}
              className="inline-flex items-center gap-1.5 text-xs bg-status-error/10 hover:bg-status-error/20 text-status-error px-2.5 h-7 rounded-md border border-status-error/30"
            >
              <PowerOff className="w-3 h-3" /> Stop
            </button>
            <button
              onClick={() => setConfirmBulk({ action: 'refresh', message: `Refresh ${selectedVps.length} VPS?` })}
              className="inline-flex items-center gap-1.5 text-xs bg-status-info/10 hover:bg-status-info/20 text-status-info px-2.5 h-7 rounded-md border border-status-info/30"
            >
              <RefreshCcw className="w-3 h-3" /> Refresh
            </button>
            {user?.role === 'ADMIN' && (
              <button
                onClick={() => setConfirmBulk({ action: 'delete', message: `Delete ${selectedVps.length} VPS?` })}
                className="inline-flex items-center gap-1.5 text-xs bg-status-error/10 hover:bg-status-error/20 text-status-error px-2.5 h-7 rounded-md border border-status-error/30"
              >
                <AlertCircle className="w-3 h-3" /> Delete
              </button>
            )}
            <button
              onClick={() => setSelectedVps([])}
              className="ml-auto text-xs text-text-muted hover:text-text-primary h-7 px-2"
            >
              Clear
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {toast && (
        <div className={`fixed top-20 right-4 z-50 flex items-center justify-between gap-3 px-4 h-10 rounded-md text-sm font-medium shadow-raise border max-w-sm animate-fade-in ${
          toast.type === 'success'
            ? 'bg-status-success/15 border-status-success/30 text-status-success'
            : 'bg-status-error/15 border-status-error/30 text-status-error'
        }`}>
          <span>{toast.message}</span>
          <button
            onClick={() => setToast(null)}
            className="p-0.5 hover:bg-bg-elevated rounded transition-colors"
            aria-label="Dismiss notification"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <Modal
        isOpen={!!confirmBulk}
        onClose={() => setConfirmBulk(null)}
        title="Confirm action"
        actions={
          <>
            <button
              onClick={() => setConfirmBulk(null)}
              className="h-9 px-3.5 text-sm bg-bg-elevated hover:bg-bg-overlay text-text-primary rounded-md transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => executeBulkCommand(confirmBulk!.action)}
              className="h-9 px-3.5 text-sm bg-brand hover:bg-brand-hover text-text-inverse rounded-md transition-colors"
            >
              Confirm
            </button>
          </>
        }
      >
        <p className="text-text-primary">{confirmBulk?.message}</p>
      </Modal>

      {vpsList.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-text-muted border border-dashed border-border-strong rounded-lg bg-bg-raised/50">
          <Server className="w-10 h-10 mb-3 opacity-50" />
          <p className="text-base font-medium text-text-secondary mb-1">No servers yet</p>
          <p className="text-sm">Add a server to start streaming telemetry.</p>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={vpsList.map((v) => v.id)} strategy={rectSortingStrategy}>
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="show"
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
            >
              {vpsList.map((vps) => {
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
