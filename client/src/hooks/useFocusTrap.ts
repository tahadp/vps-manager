"use client";
import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE_SELECTOR =
  'input:not([disabled]), button:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

export function useFocusTrap(
  isOpen: boolean,
  onEscape?: () => void
): RefObject<HTMLDivElement | null> {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onEscape?.();
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
    dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();
    return () => {
      document.removeEventListener('keydown', handleKey);
      previouslyFocused.current?.focus();
    };
  }, [isOpen, onEscape]);

  return dialogRef;
}
