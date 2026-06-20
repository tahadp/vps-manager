"use client";
import { useEffect, useRef, useState, type RefObject } from 'react';

export function useInView(options?: IntersectionObserverInit): [RefObject<HTMLDivElement | null>, boolean] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setInView(true);
        observer.disconnect(); // once visible, stay mounted (cheap base64)
      }
    }, { rootMargin: '200px', ...options });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [options]);
  return [ref, inView];
}
