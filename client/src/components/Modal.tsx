"use client";
import { type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useFocusTrap } from '@/hooks/useFocusTrap';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

const SIZE_CLASS = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg' };

export function Modal({ isOpen, onClose, title, children, actions, size = 'md' }: ModalProps) {
  const ref = useFocusTrap(isOpen, onClose);
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className={`relative w-full ${SIZE_CLASS[size]} bg-neutral-bg1 border border-border-DEFAULT rounded-2xl shadow-2xl overflow-hidden`}
          >
            <div className="flex items-center justify-between p-5 border-b border-border-subtle bg-neutral-bg2/50">
              <h2 id="modal-title" className="text-lg font-bold text-text-primary">{title}</h2>
              <button onClick={onClose} className="p-1.5 text-text-muted hover:text-text-primary hover:bg-neutral-bg3 rounded-lg transition-colors" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6">{children}</div>
            {actions && <div className="flex gap-3 justify-end p-5 pt-0">{actions}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
