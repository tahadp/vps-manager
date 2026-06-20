"use client";

import React, { useState, useCallback } from 'react';
import { Server } from 'lucide-react';
import { Modal } from '@/components/Modal';
import OsSelect from './OsSelect';
import { api, getStoredUser } from '@/lib/api';

interface AddVpsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newVps: any) => void;
}

export function AddVpsModal({ isOpen, onClose, onSuccess }: AddVpsModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    os: 'Windows Server 2022',
    customOsName: ''
  });

  const [successData, setSuccessData] = useState<any>(null);

  const handleClose = useCallback(() => {
    setSuccessData(null);
    setFormData({ name: '', os: 'Windows Server 2022', customOsName: '' });
    onClose();
  }, [onClose]);

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

  const titleNode = (
    <span className="flex items-center gap-2">
      <Server className="w-5 h-5 text-brand" />
      {successData ? 'VPS Added Successfully' : 'Add New VPS'}
    </span>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={titleNode}
      size="md"
      actions={
        successData ? undefined : (
          <>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 p-2.5 bg-neutral-bg3 hover:bg-neutral-bg4 text-text-secondary font-medium rounded-xl transition-colors text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="add-vps-form"
              disabled={loading}
              className="flex-1 p-2.5 bg-brand hover:bg-brand-hover text-white font-medium rounded-xl transition-all shadow-glow text-sm disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create VPS'}
            </button>
          </>
        )
      }
    >
      {successData ? (
        <div className="space-y-4">
          <div className="p-4 bg-status-success/10 border border-status-success/20 rounded-xl">
            <h3 className="text-status-success font-semibold mb-2">Connect Your Server</h3>
            <p className="text-sm text-text-secondary mb-4">
              Run the following command on your VPS to start the agent and connect it to your dashboard.
            </p>
            <div className="space-y-3">
              <div>
                <span className="text-xs font-bold text-text-muted uppercase block mb-1">Linux / macOS:</span>
                <div className="bg-black/50 p-3 rounded-lg overflow-x-auto">
                  <code className="text-xs text-dataviz-blue whitespace-pre font-mono">
                    {`./vps-agent-linux --api-key="${successData.apiKey}" --vps-id="${successData.id}" --backend-ip="45.198.68.109:50051"`}
                  </code>
                </div>
              </div>
              <div>
                <span className="text-xs font-bold text-text-muted uppercase block mb-1">Windows:</span>
                <div className="bg-black/50 p-3 rounded-lg overflow-x-auto">
                  <code className="text-xs text-dataviz-blue whitespace-pre font-mono">
                    {`vps-agent.exe --api-key="${successData.apiKey}" --vps-id="${successData.id}" --backend-ip="45.198.68.109:50051"`}
                  </code>
                </div>
              </div>
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
        <form id="add-vps-form" onSubmit={handleSubmit} className="space-y-5">
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
        </form>
      )}
    </Modal>
  );
}
