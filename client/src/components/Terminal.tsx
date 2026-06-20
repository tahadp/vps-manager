"use client";
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useSocket } from '@/lib/socket';

interface WebPTYProps {
  vpsId: string;
  className?: string;
}

type ConnState = 'idle' | 'connecting' | 'connected' | 'closed';

export default function WebPTY({ vpsId, className }: WebPTYProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<any>(null);
  const fitRef = useRef<any>(null);
  const searchAddonRef = useRef<any>(null);
  const stateRef = useRef<ConnState>('idle');
  const currentSessionIdRef = useRef<string | null>(null);
  const [state, setState] = useState<ConnState>('idle');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { socket, connectionStatus } = useSocket();

  // Focus search input when opened
  useEffect(() => {
    if (searchOpen && searchInputRef.current) {
      searchInputRef.current.focus();
      searchInputRef.current.select();
    }
  }, [searchOpen]);

  const handleSearch = useCallback((text: string, direction: 'next' | 'previous' = 'next') => {
    const searchAddon = searchAddonRef.current;
    if (!searchAddon || !text) return;
    if (direction === 'next') {
      searchAddon.findNext(text);
    } else {
      searchAddon.findPrevious(text);
    }
  }, []);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchText('');
    const searchAddon = searchAddonRef.current;
    if (searchAddon) {
      searchAddon.clearDecorations();
    }
    // Re-focus terminal
    if (termRef.current) {
      termRef.current.focus();
    }
  }, []);

  useEffect(() => {
    if (!terminalRef.current) return;
    if (!socket) return;

    let cancelled = false;
    let xterm: any = null;
    let fitAddon: any = null;
    let webglAddon: any = null;
    let webLinksAddon: any = null;
    let searchAddon: any = null;
    const attachedHandlers: Array<[string, (...args: any[]) => void]> = [];

    const writeStatus = (term: any, msg: string, color: 'gray' | 'green' | 'red' | 'yellow' = 'gray') => {
      const codes: Record<string, string> = { gray: '90', green: '32', red: '31', yellow: '33' };
      try { term.write(`\x1b[${codes[color]}m${msg}\x1b[0m\r\n`); } catch {}
    };

    (async () => {
      const xtermPkg = await import('xterm');
      const fitPkg = await import('xterm-addon-fit');
      const webglPkg = await import('xterm-addon-webgl');
      const webLinksPkg = await import('xterm-addon-web-links');
      const searchPkg = await import('xterm-addon-search');
      await import('xterm/css/xterm.css');
      if (cancelled || !terminalRef.current) return;

      const Terminal = xtermPkg.Terminal;
      const FitAddon = fitPkg.FitAddon;
      const WebglAddon = webglPkg.WebglAddon;
      const WebLinksAddon = webLinksPkg.WebLinksAddon;
      const SearchAddon = searchPkg.SearchAddon;

      xterm = new Terminal({
        allowProposedApi: true,
        theme: {
          background: '#0a0a0b',
          foreground: '#e4e4e7',
          cursor: '#8251EE',
          cursorAccent: '#0a0a0b',
          selectionBackground: '#8251EE40',
          selectionForeground: '#ffffff',
          black: '#18181b',
          red: '#ef4444',
          green: '#22c55e',
          yellow: '#eab308',
          blue: '#3b82f6',
          magenta: '#a855f7',
          cyan: '#06b6d4',
          white: '#e4e4e7',
          brightBlack: '#3f3f46',
          brightRed: '#f87171',
          brightGreen: '#4ade80',
          brightYellow: '#facc15',
          brightBlue: '#60a5fa',
          brightMagenta: '#c084fc',
          brightCyan: '#22d3ee',
          brightWhite: '#fafafa',
        },
        fontFamily: "'Geist Mono', 'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'SF Mono', Menlo, Monaco, 'Courier New', monospace",
        fontSize: 14,
        fontWeight: '400',
        fontWeightBold: '700',
        lineHeight: 1.2,
        letterSpacing: 0,
        cursorBlink: true,
        cursorStyle: 'block',
        cursorWidth: 1,
        scrollback: 10000,
        tabStopWidth: 4,
        convertEol: true,
        drawBoldTextInBrightColors: true,
        minimumContrastRatio: 4.5,
        wordSeparator: ' ()[]{}\'",;:@<>/.\\|=+-*&^%$#@!~`',
      });

      fitAddon = new FitAddon();
      xterm.loadAddon(fitAddon);

      // WebGL renderer (GPU accelerated) with canvas fallback
      try {
        webglAddon = new WebglAddon();
        xterm.loadAddon(webglAddon);
      } catch {
        // Canvas fallback - still works, just not GPU accelerated
      }

      // Clickable URLs
      webLinksAddon = new WebLinksAddon((event: MouseEvent, uri: string) => {
        window.open(uri, '_blank', 'noopener,noreferrer');
      });
      xterm.loadAddon(webLinksAddon);

      // Search addon (Ctrl+Shift+F)
      searchAddon = new SearchAddon();
      xterm.loadAddon(searchAddon);
      searchAddonRef.current = searchAddon;

      xterm.open(terminalRef.current);
      termRef.current = xterm;
      fitRef.current = fitAddon;

      // Initial fit with delay for DOM to settle
      const fitTerminal = () => {
        if (terminalRef.current && terminalRef.current.offsetWidth > 0 && terminalRef.current.offsetHeight > 0) {
          try { fitAddon.fit(); } catch {}
        }
      };
      const fitTimeout = setTimeout(fitTerminal, 100);
      const resizeObserver = new ResizeObserver(fitTerminal);
      resizeObserver.observe(terminalRef.current);

      const setStateAndRef = (s: ConnState) => {
        stateRef.current = s;
        setState(s);
      };

      // Auto-connect
      if (socket.connected) {
        setStateAndRef('connecting');
        writeStatus(xterm, 'Authenticating, requesting PTY...', 'gray');
        socket.emit('shell:open', { vpsId });
      } else {
        setStateAndRef('connecting');
        writeStatus(xterm, 'Connecting to VPS...', 'gray');
      }

      // --- Socket event handlers ---
      const onConnect = () => {
        writeStatus(xterm, 'Authenticating, requesting PTY...', 'gray');
        socket.emit('shell:open', { vpsId });
      };
      const onConnectError = (err: any) => {
        setStateAndRef('closed');
        try { xterm.clear(); } catch {}
        writeStatus(xterm, `Connection failed: ${err?.message || 'unknown'}`, 'red');
      };
      const onDisconnect = (reason: string) => {
        setStateAndRef('closed');
        writeStatus(xterm, `Disconnected: ${reason}`, 'yellow');
      };
      const onShellOpened = (payload: { sessionId: string }) => {
        currentSessionIdRef.current = payload?.sessionId || null;
        setStateAndRef('connected');
        try { xterm.clear(); } catch {}
        xterm.focus();
      };
      const onShellClosed = () => {
        setStateAndRef('closed');
        writeStatus(xterm, 'Connection closed by server.', 'yellow');
      };
      const onShellOutput = (payload: { data: string }) => {
        try {
          if (!payload?.data) return;
          const decoded = atob(payload.data);
          const bytes = new Uint8Array(decoded.length);
          for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i);
          xterm.write(bytes);
        } catch {}
      };
      const onShellError = (payload: { error: string }) => {
        setStateAndRef('closed');
        writeStatus(xterm, `Error: ${payload?.error || 'unknown'}`, 'red');
      };

      socket.on('connect', onConnect);
      socket.on('connect_error', onConnectError);
      socket.on('disconnect', onDisconnect);
      socket.on('shell:opened', onShellOpened);
      socket.on('shell:closed', onShellClosed);
      socket.on('shell:output', onShellOutput);
      socket.on('shell:error', onShellError);
      attachedHandlers.push(
        ['connect', onConnect],
        ['connect_error', onConnectError],
        ['disconnect', onDisconnect],
        ['shell:opened', onShellOpened],
        ['shell:closed', onShellClosed],
        ['shell:output', onShellOutput],
        ['shell:error', onShellError]
      );

      // --- Keyboard input: forward all keystrokes to PTY ---
      xterm.onData((data: string) => {
        if (socket.connected && stateRef.current === 'connected' && currentSessionIdRef.current) {
          socket.emit('shell:input', { sessionId: currentSessionIdRef.current, data });
        }
      });

      // --- Title change handler ---
      xterm.onTitleChange((title: string) => {
        // Could update page title or status bar
        if (title) {
          document.title = `${title} - VPS Terminal`;
        }
      });

      // --- Cleanup ---
      (terminalRef.current as any).__cleanup = () => {
        clearTimeout(fitTimeout);
        resizeObserver.disconnect();
        for (const [ev, fn] of attachedHandlers) {
          socket.off(ev, fn);
        }
        if (currentSessionIdRef.current && socket.connected) {
          socket.emit('shell:close', { sessionId: currentSessionIdRef.current });
        }
        currentSessionIdRef.current = null;
        try { webglAddon?.dispose(); } catch {}
        try { webLinksAddon?.dispose(); } catch {}
        try { searchAddon?.dispose(); } catch {}
        try { xterm.dispose(); } catch {}
        termRef.current = null;
        fitRef.current = null;
        searchAddonRef.current = null;
      };
    })();

    return () => {
      cancelled = true;
      const cleanup = (terminalRef.current as any)?.__cleanup;
      if (cleanup) cleanup();
    };
  }, [vpsId, socket]);

  // --- Global keyboard shortcuts ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Shift+F: Open search
      if (e.ctrlKey && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }
      // Ctrl+Shift+C: Copy selection to clipboard
      if (e.ctrlKey && e.shiftKey && e.key === 'C') {
        e.preventDefault();
        const term = termRef.current;
        if (term && term.hasSelection()) {
          const selection = term.getSelection();
          navigator.clipboard.writeText(selection).catch(() => {});
        }
        return;
      }
      // Ctrl+Shift+V: Paste from clipboard
      if (e.ctrlKey && e.shiftKey && e.key === 'V') {
        e.preventDefault();
        navigator.clipboard.readText().then((text) => {
          if (text && socket?.connected && stateRef.current === 'connected' && currentSessionIdRef.current) {
            socket.emit('shell:input', { sessionId: currentSessionIdRef.current, data: text });
          }
        }).catch(() => {});
        return;
      }
      // Escape: Close search
      if (e.key === 'Escape' && searchOpen) {
        e.preventDefault();
        closeSearch();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [socket, searchOpen, closeSearch]);

  return (
    <div className="w-full h-full relative flex flex-col">
      {/* Status bar */}
      <div className="flex-shrink-0 px-3 py-1.5 text-[10px] uppercase font-bold tracking-wider bg-neutral-bg2 border-b border-border-subtle z-10 flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${
          state === 'connected' ? 'bg-status-success' :
          state === 'connecting' ? 'bg-status-warning animate-pulse' :
          state === 'closed' ? 'bg-status-error' : 'bg-text-muted'
        }`} />
        <span className="text-text-muted">{state}</span>
        <div className="flex-1" />
        <span className="text-text-muted/50 text-[9px]">
          Ctrl+Shift+F Search &middot; Ctrl+Shift+C Copy &middot; Ctrl+Shift+V Paste
        </span>
      </div>

      {/* Search bar */}
      {searchOpen && (
        <div className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 bg-neutral-bg2 border-b border-border-subtle z-20">
          <input
            ref={searchInputRef}
            type="text"
            value={searchText}
            onChange={(e) => {
              setSearchText(e.target.value);
              handleSearch(e.target.value, 'next');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSearch(searchText, e.shiftKey ? 'previous' : 'next');
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                closeSearch();
              }
            }}
            placeholder="Search terminal..."
            className="flex-1 bg-neutral-bg1 border border-border-subtle rounded px-2 py-1 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand"
          />
          <button
            onClick={() => handleSearch(searchText, 'previous')}
            className="p-1 text-text-muted hover:text-text-primary transition-colors"
            title="Previous (Shift+Enter)"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
          </button>
          <button
            onClick={() => handleSearch(searchText, 'next')}
            className="p-1 text-text-muted hover:text-text-primary transition-colors"
            title="Next (Enter)"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </button>
          <button
            onClick={closeSearch}
            className="p-1 text-text-muted hover:text-text-primary transition-colors"
            title="Close (Escape)"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}

      {/* Terminal container */}
      <div ref={terminalRef} className={className || 'flex-1 min-h-0'} />

      {/* Reconnection overlay */}
      {connectionStatus !== 'connected' && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 backdrop-blur-sm pointer-events-none">
          <div className="flex flex-col items-center gap-2 text-text-primary">
            <div className="w-3 h-3 rounded-full bg-status-warning animate-pulse" />
            <span className="text-xs uppercase font-bold tracking-wider text-text-secondary">
              {connectionStatus === 'reconnecting' ? 'Reconnecting...' : 'Disconnected'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
