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
            className="absolute inset-0 bg-black/55 backdrop-blur-sm"
          />
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className={`relative w-full ${SIZE_CLASS[size]} bg-bg-raised border border-border rounded-xl shadow-raise overflow-hidden`}
          >
            <div className="flex items-center justify-between px-5 h-14 border-b border-border-subtle">
              <h2 id="modal-title" className="text-base font-semibold text-text-primary">
                {title}
              </h2>
              <button
                onClick={onClose}
                className="h-8 w-8 inline-flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-bg-elevated rounded-md transition-colors"
                aria-label="Close dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 text-sm text-text-primary">{children}</div>
            {actions && <div className="flex gap-2 justify-end px-5 pb-5">{actions}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
