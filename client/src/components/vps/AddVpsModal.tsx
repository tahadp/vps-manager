"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Server, Terminal } from 'lucide-react';
import OsSelect from './OsSelect';
import { api, getStoredUser } from '@/lib/api';

interface AddVpsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newVps: any) => void;
}

const FOCUSABLE_SELECTOR =
  'input:not([disabled]), button:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

export function AddVpsModal({ isOpen, onClose, onSuccess }: AddVpsModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    os: 'Windows Server 2022',
    customOsName: ''
  });

  const [successData, setSuccessData] = useState<any>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  const handleClose = useCallback(() => {
    setSuccessData(null);
    setFormData({ name: '', os: 'Windows Server 2022', customOsName: '' });
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        handleClose();
      } else if (e.key === 'Tab' && dialogRef.current) {
        const focusables = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
        ).filter((el) => !el.hasAttribute('aria-hidden'));
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', handleKey);
    const firstFocusable = dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    firstFocusable?.focus();
    return () => {
      document.removeEventListener('keydown', handleKey);
      previouslyFocused.current?.focus();
    };
  }, [isOpen, handleClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const user = getStoredUser();
      const payload: any = {
        name: formData.name,
        userId: user?.id
      };
      if (formData.os === 'Other') {
        if (!formData.customOsName.trim()) {
          setError('Please specify a custom OS name.');
          setLoading(false);
          return;
        }
        payload.os = 'Other';
        payload.customOsName = formData.customOsName.trim();
      } else {
        payload.os = formData.os;
      }

      const newVps = await api<any>('/api/vps', { method: 'POST', json: payload });
      setSuccessData(newVps);
      onSuccess(newVps);
    } catch (err: any) {
      setError(err?.message || 'Failed to create VPS');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />

        <motion.div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-vps-modal-title"
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-md bg-neutral-bg1 border border-border-DEFAULT rounded-2xl shadow-2xl overflow-hidden"
        >
          <div className="flex items-center justify-between p-5 border-b border-border-subtle bg-neutral-bg2/50">
            <h2 id="add-vps-modal-title" className="text-lg font-bold text-text-primary flex items-center gap-2">
              <Server className="w-5 h-5 text-brand" />
              {successData ? 'VPS Added Successfully' : 'Add New VPS'}
            </h2>
            <button
              onClick={handleClose}
              className="p-1.5 text-text-muted hover:text-text-primary hover:bg-neutral-bg3 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {successData ? (
            <div className="p-6 space-y-4">
              <div className="p-4 bg-status-success/10 border border-status-success/20 rounded-xl">
                <h3 className="text-status-success font-semibold mb-2">Connect Your Server</h3>
                <p className="text-sm text-text-secondary mb-4">
                  Run the following command on your VPS to start the agent and connect it to your dashboard.
                </p>
                <div className="bg-black/50 p-3 rounded-lg overflow-x-auto">
                  <code className="text-xs text-dataviz-blue whitespace-pre font-mono">
                    {`go run main.go --api-key="${successData.apiKey}" --vps-id="${successData.id}" --backend-ip="YOUR_BACKEND_IP:50051"`}
                  </code>
                </div>
              </div>
              <button
                onClick={handleClose}
                className="w-full p-2.5 bg-neutral-bg3 hover:bg-neutral-bg4 text-text-primary font-medium rounded-xl transition-colors text-sm"
              >
                Close
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              {error && (
                <div className="p-3 bg-status-error/10 border border-status-error/20 rounded-xl text-status-error text-sm">
                  {error}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">Display Name</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <Server className="w-4 h-4 text-text-muted" />
                  </div>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    className="w-full pl-10 p-2.5 bg-neutral-bg2 border border-border-subtle rounded-xl text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-all text-sm"
                    placeholder="e.g. Production Web Server"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">Operating System</label>
                <OsSelect
                  value={formData.os}
                  customValue={formData.customOsName}
                  onChange={(os, customOsName) => setFormData({ ...formData, os, customOsName })}
                />
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 p-2.5 bg-neutral-bg3 hover:bg-neutral-bg4 text-text-secondary font-medium rounded-xl transition-colors text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 p-2.5 bg-brand hover:bg-brand-hover text-white font-medium rounded-xl transition-all shadow-glow text-sm disabled:opacity-50"
                >
                  {loading ? 'Creating...' : 'Create VPS'}
                </button>
              </div>
            </form>
          )}
        </motion.div>
      </div>
      )}
    </AnimatePresence>
  );
}
