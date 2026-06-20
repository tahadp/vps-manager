"use client";
import React, { useState } from 'react';
import { TerminalSquare, Maximize2, X, WifiOff } from 'lucide-react';
import { useInView } from '@/hooks/useInView';

interface ScreenViewProps {
  vpsId: string;
  imageData?: string | null;
  isOffline?: boolean;
  className?: string;
}

export default function ScreenView({ vpsId, imageData, isOffline, className }: ScreenViewProps) {
  const [expanded, setExpanded] = useState(false);
  const [screenshotRef, inView] = useInView();

  return (
    <>
      <div
        ref={screenshotRef}
        className={`relative cursor-pointer group overflow-hidden ${className || 'w-full h-36 bg-black/50 border-y border-border-subtle flex items-center justify-center'}`}
        onClick={() => imageData && inView && setExpanded(true)}
      >
        {imageData && inView ? (
          <React.Fragment key={imageData.slice(0, 32)}>
            <img
              src={`data:image/jpeg;base64,${imageData}`}
              alt="VPS Screenshot"
              className={`w-full h-full object-cover transition-all duration-500 ${isOffline ? 'opacity-30 grayscale' : 'opacity-70 group-hover:opacity-100 group-hover:scale-105'}`}
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 pointer-events-none" />
            {isOffline ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-status-error/90 gap-1 bg-black/40 backdrop-blur-[1px]">
                <WifiOff className="w-7 h-7 animate-pulse" />
                <span className="text-sm font-semibold uppercase tracking-wider">Server is Offline</span>
                <span className="text-[10px] text-text-muted">Showing last captured screenshot</span>
              </div>
            ) : (
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <Maximize2 className="w-4 h-4 text-white/80" />
              </div>
            )}
          </React.Fragment>
        ) : isOffline ? (
          <div className="flex flex-col items-center text-status-error/70 gap-2">
            <WifiOff className="w-7 h-7" />
            <span className="text-sm font-medium">Server is offline</span>
            <span className="text-[10px] text-text-muted">No screenshot cache available</span>
          </div>
        ) : (
          <div className="flex flex-col items-center text-text-muted/50 gap-2">
            <TerminalSquare className="w-6 h-6 animate-pulse" />
            <span className="text-xs">Waiting for first screenshot…</span>
          </div>
        )}
      </div>

      {expanded && imageData && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setExpanded(false)}
        >
          <button
            onClick={() => setExpanded(false)}
            className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={`data:image/jpeg;base64,${imageData}`}
            alt="VPS Screenshot"
            className="max-w-full max-h-full object-contain rounded-lg"
          />
        </div>
      )}
    </>
  );
}
