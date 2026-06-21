import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Combine class names with Tailwind-aware conflict resolution.
 * Re-exported from the shadcn/ui pattern so the same `cn` is available
 * across the dashboard.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
