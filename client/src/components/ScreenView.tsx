"use client";
import React, { useState } from 'react';
import { TerminalSquare, Maximize2, X } from 'lucide-react';

interface ScreenViewProps {
  vpsId: string;
  imageData?: string | null;
  className?: string;
}

export default function ScreenView({ vpsId, imageData, className }: ScreenViewProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <div
        className={`relative cursor-pointer group overflow-hidden ${className || 'w-full h-36 bg-black/50 border-y border-border-subtle flex items-center justify-center'}`}
        onClick={() => imageData && setExpanded(true)}
      >
        {imageData ? (
          <>
            <img
              src={`data:image/jpeg;base64,${imageData}`}
              alt="VPS Screenshot"
              className="w-full h-full object-cover opacity-70 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 pointer-events-none" />
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <Maximize2 className="w-4 h-4 text-white/80" />
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center text-text-muted/50 gap-2">
            <TerminalSquare className="w-6 h-6" />
            <span className="text-xs">No display signal</span>
          </div>
        )}
      </div>

      {/* Fullscreen overlay */}
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
