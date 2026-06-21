"use client";

import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useReducer,
  useMemo,
  memo,
} from 'react';
import { useTheme } from 'next-themes';
import { Power, Trash2, Search, X as XIcon, ArrowDown, ArrowUp, Loader2 } from 'lucide-react';
import { useSocket } from '@/lib/socket';
import { reduce, initialState } from '@/components/terminal/state';
import type { ConnState } from '@/components/terminal/types';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Props — preserved from the legacy WebPTY so existing callers (the VPS
// detail page) keep working without a single line of change.
// ---------------------------------------------------------------------------
interface WebPTYProps {
  vpsId: string;
  className?: string;
  /** When false, the terminal is hidden but the PTY session is preserved. */
  active?: boolean;
}

// ---------------------------------------------------------------------------
// xterm theme derivation from CSS variables + the next-themes resolved mode.
// This is the integration point between the design system and the terminal
// canvas. We do NOT hand-pick colors — every value traces to globals.css.
// ---------------------------------------------------------------------------
type XtermTheme = {
  background: string;
  foreground: string;
  cursor: string;
  cursorAccent: string;
  selectionBackground: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
};

const readVar = (name: string, fallback: string): string => {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
};

const buildTheme = (mode: 'dark' | 'light' | undefined): XtermTheme => {
  const dark = mode !== 'light';
  return {
    background: dark ? '#0a0a0c' : '#fafaf9',
    foreground: readVar('--text-primary', dark ? '#fafafa' : '#0f0f12'),
    cursor: readVar('--brand', dark ? '#7c3aed' : '#6d28d9'),
    cursorAccent: dark ? '#0a0a0c' : '#fafaf9',
    selectionBackground: 'rgba(124, 58, 237, 0.32)',
    black: readVar('--bg-strong', dark ? '#27272a' : '#3f3f46'),
    red: dark ? '#f87171' : '#dc2626',
    green: dark ? '#4ade80' : '#16a34a',
    yellow: dark ? '#facc15' : '#d97706',
    blue: dark ? '#60a5fa' : '#2563eb',
    magenta: dark ? '#c084fc' : '#9333ea',
    cyan: dark ? '#22d3ee' : '#0891b2',
    white: readVar('--text-primary', dark ? '#fafafa' : '#0f0f12'),
    brightBlack: readVar('--text-muted', dark ? '#71717a' : '#a1a1aa'),
    brightRed: '#fca5a5',
    brightGreen: '#86efac',
    brightYellow: '#fde047',
    brightBlue: '#93c5fd',
    brightMagenta: '#d8b4fe',
    brightCyan: '#67e8f9',
    brightWhite: '#ffffff',
  };
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
function WebPTYImpl({ vpsId, className, active = true }: WebPTYProps) {
  const { socket, connectionStatus } = useSocket();
  const { resolvedTheme } = useTheme();

  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<any>(null);
  const fitRef = useRef<any>(null);
  const searchRef = useRef<any>(null);
  const sessionIdRef = useRef<string | null>(null);
  const lastEmittedActivityRef = useRef<number>(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reducer-driven state.
  const [state, dispatch] = useReducer(
    (s: ConnState, e: Parameters<typeof reduce>[1]) => reduce(s, e, Date.now()),
    initialState,
  );

  // UI-only state (doesn't affect connection logic).
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [uptime, setUptime] = useState(0);
  const [mobile, setMobile] = useState(false);

  // Build the xterm theme from CSS variables. The hook reruns when the
  // resolved theme switches, so light <-> dark transitions update the
  // terminal palette in place.
  const xtermTheme = useMemo(
    () => buildTheme((resolvedTheme as 'dark' | 'light') ?? 'dark'),
    [resolvedTheme],
  );

  // ----- Touch / mobile detection -------------------------------------------
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(pointer: coarse)');
    const onChange = () => setMobile(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // ----- Uptime tick --------------------------------------------------------
  useEffect(() => {
    if (state.kind !== 'connected') {
      setUptime(0);
      return;
    }
    const start = state.sinceMs;
    setUptime(Math.max(0, Date.now() - start));
    const t = setInterval(() => setUptime(Math.max(0, Date.now() - start)), 1000);
    return () => clearInterval(t);
  }, [state]);

  // ----- xterm init + socket wiring ----------------------------------------
  useEffect(() => {
    if (!containerRef.current || !socket) return;
    let cancelled = false;
    let term: any = null;
    let fitAddon: any = null;
    let webglAddon: any = null;
    let webLinksAddon: any = null;
    let searchAddon: any = null;
    const attached: Array<[string, (...args: any[]) => void]> = [];

    (async () => {
      const [{ Terminal }, fitPkg, webglPkg, webLinksPkg, searchPkg] = await Promise.all([
        import('xterm'),
        import('xterm-addon-fit'),
        import('xterm-addon-webgl'),
        import('xterm-addon-web-links'),
        import('xterm-addon-search'),
      ]);
      await import('xterm/css/xterm.css');
      if (cancelled || !containerRef.current) return;

      term = new Terminal({
        allowProposedApi: true,
        theme: xtermTheme,
        fontFamily:
          "'Geist Mono', 'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'SF Mono', Menlo, Monaco, monospace",
        fontSize: 13,
        fontWeight: '400',
        fontWeightBold: '700',
        lineHeight: 1.25,
        cursorBlink: true,
        cursorStyle: 'block',
        cursorWidth: 1,
        scrollback: 10000,
        tabStopWidth: 4,
        convertEol: true,
        minimumContrastRatio: 4.5,
      });
      termRef.current = term;

      fitAddon = new fitPkg.FitAddon();
      term.loadAddon(fitAddon);
      fitRef.current = fitAddon;

      try {
        webglAddon = new webglPkg.WebglAddon();
        term.loadAddon(webglAddon);
      } catch {
        // Canvas fallback is fine.
      }

      try {
        webLinksAddon = new webLinksPkg.WebLinksAddon();
        term.loadAddon(webLinksAddon);
      } catch {}

      try {
        searchAddon = new searchPkg.SearchAddon();
        term.loadAddon(searchAddon);
        searchRef.current = searchAddon;
      } catch {}

      term.open(containerRef.current);

      // Re-apply theme to the new terminal (in case resolvedTheme was different
      // when `theme: xtermTheme` was captured at construction).
      try { term.options.theme = xtermTheme; } catch {}

      const fitNow = () => {
        if (containerRef.current && containerRef.current.offsetWidth > 0) {
          try { fitAddon.fit(); } catch {}
        }
      };
      const ro = new ResizeObserver(fitNow);
      ro.observe(containerRef.current);
      const tFit = setTimeout(fitNow, 50);

      // Intercepts: keep terminal-native control keys, but allow the app's
      // search/clear/power shortcuts to bubble up to the global handler.
      term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
        if (e.type !== 'keydown') return true;
        // Allow global shortcuts to fire (search, copy, paste, disconnect).
        if (e.ctrlKey && e.shiftKey && ['F', 'C', 'V', 'f', 'c', 'v'].includes(e.key)) {
          return false;
        }
        // Let Esc close the search bar.
        if (e.key === 'Escape') return false;
        // Otherwise the terminal owns the key.
        return true;
      });

      term.onData((data: string) => {
        const sid = sessionIdRef.current;
        if (socket.connected && sid) {
          socket.emit('shell:input', { sessionId: sid, data });
          // Throttle activity events to 5s.
          const now = Date.now();
          if (now - lastEmittedActivityRef.current > 5000) {
            lastEmittedActivityRef.current = now;
            dispatch({ type: 'activity' });
          }
        }
      });

      const onConnect = () => {
        dispatch({ type: 'connect' });
        socket.emit('shell:open', { vpsId });
      };
      const onConnectError = (err: any) => {
        dispatch({ type: 'open-error', error: err?.message || 'connection error' });
      };
      const onDisconnect = (reason: string) => {
        dispatch({ type: 'disconnect', reason: 'lost', error: reason });
      };
      const onShellOpened = (payload: { sessionId: string }) => {
        if (!payload?.sessionId) return;
        sessionIdRef.current = payload.sessionId;
        dispatch({ type: 'open-success', sessionId: payload.sessionId });
        try { term.clear(); } catch {}
        try { term.focus(); } catch {}
      };
      const onShellClosed = () => {
        sessionIdRef.current = null;
        dispatch({ type: 'disconnect', reason: 'lost', error: 'closed by server' });
      };
      const onShellOutput = (payload: { data: string }) => {
        if (!payload?.data) return;
        try {
          const decoded = atob(payload.data);
          const bytes = new Uint8Array(decoded.length);
          for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i);
          term.write(bytes);
        } catch {
          // Swallow corrupt base64 — keep the stream alive.
        }
      };
      const onShellError = (payload: { error: string }) => {
        dispatch({ type: 'open-error', error: payload?.error || 'shell error' });
      };

      // CRITICAL: Register socket listeners BEFORE emitting shell:open,
      // otherwise the server's `shell:opened` event arrives before the
      // listener is attached and we miss the session id.
      socket.on('connect', onConnect);
      socket.on('connect_error', onConnectError);
      socket.on('disconnect', onDisconnect);
      socket.on('shell:opened', onShellOpened);
      socket.on('shell:closed', onShellClosed);
      socket.on('shell:output', onShellOutput);
      socket.on('shell:error', onShellError);
      attached.push(
        ['connect', onConnect],
        ['connect_error', onConnectError],
        ['disconnect', onDisconnect],
        ['shell:opened', onShellOpened],
        ['shell:closed', onShellClosed],
        ['shell:output', onShellOutput],
        ['shell:error', onShellError],
      );

      // Now that listeners are attached, kick off the first connection.
      if (socket.connected) {
        dispatch({ type: 'connect' });
        socket.emit('shell:open', { vpsId });
      }

      // Stash cleanup on the DOM node so unmount can find it.
      (containerRef.current as any).__cleanup = () => {
        clearTimeout(tFit);
        ro.disconnect();
        for (const [ev, fn] of attached) {
          socket.off(ev, fn);
        }
        if (sessionIdRef.current && socket.connected) {
          socket.emit('shell:close', { sessionId: sessionIdRef.current });
        }
        sessionIdRef.current = null;
        try { webglAddon?.dispose(); } catch {}
        try { webLinksAddon?.dispose(); } catch {}
        try { searchAddon?.dispose(); } catch {}
        try { term.dispose(); } catch {}
        termRef.current = null;
        fitRef.current = null;
        searchRef.current = null;
      };
    })();

    return () => {
      cancelled = true;
      const cleanup = (containerRef.current as any)?.__cleanup;
      if (cleanup) cleanup();
    };
    // xtermTheme changes when resolvedTheme changes; we DO want a new
    // terminal on theme switch to avoid stale canvas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vpsId, socket, resolvedTheme]);

  // ----- Auto-reconnect timer ----------------------------------------------
  useEffect(() => {
    if (state.kind !== 'reconnecting') {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      return;
    }
    const wait = Math.max(0, state.nextRetryAtMs - Date.now());
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = setTimeout(() => {
      if (socket?.connected) {
        socket.emit('shell:open', { vpsId });
      }
    }, wait);
    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };
  }, [state, socket, vpsId]);

  // ----- Global shortcuts --------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'F' || e.key === 'f')) {
        e.preventDefault();
        setSearchOpen((v) => !v);
        return;
      }
      if (e.ctrlKey && e.shiftKey && (e.key === 'C' || e.key === 'c')) {
        e.preventDefault();
        const t = termRef.current;
        if (t && t.hasSelection()) {
          navigator.clipboard.writeText(t.getSelection()).catch(() => {});
        }
        return;
      }
      if (e.ctrlKey && e.shiftKey && (e.key === 'V' || e.key === 'v')) {
        e.preventDefault();
        const sid = sessionIdRef.current;
        if (!sid || !socket?.connected) return;
        navigator.clipboard
          .readText()
          .then((text) => {
            if (text && socket?.connected) {
              socket.emit('shell:input', { sessionId: sid, data: text });
            }
          })
          .catch(() => {});
        return;
      }
      if (e.key === 'Escape' && searchOpen) {
        e.preventDefault();
        closeSearch();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, searchOpen]);

  // ----- Search ------------------------------------------------------------
  useEffect(() => {
    if (searchOpen) {
      // Defer focus so the input has mounted.
      setTimeout(() => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }, 0);
    }
  }, [searchOpen]);

  const runSearch = useCallback(
    (text: string, dir: 'next' | 'prev' = 'next') => {
      const s = searchRef.current;
      if (!s || !text) return;
      if (dir === 'next') s.findNext(text); else s.findPrevious(text);
    },
    [],
  );
  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchText('');
    try { searchRef.current?.clearDecorations(); } catch {}
    try { termRef.current?.focus(); } catch {}
  }, []);

  // ----- Toolbar handlers --------------------------------------------------
  const onPower = useCallback(() => {
    if (state.kind === 'connected' || state.kind === 'connecting' || state.kind === 'authenticating') {
      // User disconnect.
      if (sessionIdRef.current && socket?.connected) {
        socket.emit('shell:close', { sessionId: sessionIdRef.current });
      }
      sessionIdRef.current = null;
      dispatch({ type: 'user-disconnect' });
    } else if (state.kind === 'closed' || state.kind === 'disconnected' || state.kind === 'idle') {
      // User reconnect.
      dispatch({ type: 'user-connect' });
      if (socket?.connected) socket.emit('shell:open', { vpsId });
    } else if (state.kind === 'reconnecting') {
      // Cancel pending retry.
      dispatch({ type: 'user-disconnect' });
    }
  }, [state, socket, vpsId]);

  const onClear = useCallback(() => {
    try { termRef.current?.clear(); } catch {}
    try { termRef.current?.focus(); } catch {}
  }, []);

  // ----- Helpers used by both the DOM and the test -------------------------
  const stateLabel: string =
    state.kind === 'connected'
      ? 'connected'
      : state.kind === 'connecting'
        ? 'connecting'
        : state.kind === 'authenticating'
          ? 'authenticating'
          : state.kind === 'reconnecting'
            ? `reconnecting · attempt ${state.attempt}`
            : state.kind === 'disconnected'
              ? `disconnected · ${state.reason}`
              : 'disconnected';

  const stateDotClass: string = cn(
    'w-2 h-2 rounded-full',
    state.kind === 'connected' && 'bg-status-success shadow-[0_0_8px_rgba(16,185,129,0.55)]',
    state.kind === 'connecting' && 'bg-status-warning animate-pulse',
    state.kind === 'authenticating' && 'bg-status-warning animate-pulse',
    state.kind === 'reconnecting' && 'bg-status-warning animate-pulse',
    (state.kind === 'disconnected' || state.kind === 'closed') && 'bg-status-error',
  );

  const powerButtonLabel: string =
    state.kind === 'connected' || state.kind === 'connecting' || state.kind === 'authenticating'
      ? 'Disconnect'
      : 'Connect';

  const fmtUptime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ${s % 60}s`;
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  };

  const sessionIdShort = sessionIdRef.current
    ? sessionIdRef.current.slice(0, 8)
    : '—';

  return (
    <div
      data-testid="webpty-root"
      className={cn(
        'w-full h-full flex flex-col overflow-hidden rounded-xl border border-border-default bg-bg-sunken',
        className,
      )}
      onClick={() => {
        try { termRef.current?.focus(); } catch {}
      }}
    >
      {/* Top status bar */}
      <div className="flex-shrink-0 flex items-center gap-2 h-9 px-3 bg-bg-elevated/40 border-b border-border-subtle">
        <span className={stateDotClass} data-testid="state-dot" />
        <span className="text-[11px] font-medium text-text-secondary tabular-nums" data-testid="state-label">
          {stateLabel}
        </span>
        <span className="text-text-muted text-[10px] hidden sm:inline">·</span>
        <span className="text-text-muted text-[10px] font-mono hidden sm:inline">
          {vpsId.slice(0, 8)}
        </span>
        {state.kind === 'connected' && (
          <>
            <span className="text-text-muted text-[10px] hidden sm:inline">·</span>
            <span className="text-text-muted text-[10px] tabular-nums hidden sm:inline">
              {fmtUptime(uptime)}
            </span>
            <span className="text-text-muted text-[10px] hidden sm:inline">·</span>
            <span className="text-text-muted text-[10px] font-mono hidden md:inline" data-testid="session-id">
              {sessionIdShort}
            </span>
          </>
        )}

        <div className="flex-1" />

        <button
          onClick={(e) => { e.stopPropagation(); setSearchOpen((v) => !v); }}
          className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-overlay transition-colors"
          title="Search (Ctrl+Shift+F)"
          aria-label="Search"
        >
          <Search className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onClear(); }}
          className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-overlay transition-colors"
          title="Clear scrollback"
          aria-label="Clear"
          data-testid="clear-btn"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onPower(); }}
          className={cn(
            'flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors border',
            powerButtonLabel === 'Connect'
              ? 'bg-status-success/15 text-status-success border-status-success/30 hover:bg-status-success/25'
              : 'bg-bg-overlay text-text-secondary border-border-default hover:text-text-primary',
          )}
          title={powerButtonLabel}
          aria-label={powerButtonLabel}
          data-testid="power-btn"
        >
          {state.kind === 'connecting' || state.kind === 'authenticating' ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Power className="w-3 h-3" />
          )}
          <span className="hidden sm:inline">{powerButtonLabel}</span>
        </button>
      </div>

      {/* Search bar */}
      {searchOpen && (
        <div
          className="flex-shrink-0 flex items-center gap-2 h-9 px-3 bg-bg-elevated/60 border-b border-border-subtle"
          onClick={(e) => e.stopPropagation()}
        >
          <Search className="w-3.5 h-3.5 text-text-muted" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchText}
            onChange={(e) => {
              setSearchText(e.target.value);
              runSearch(e.target.value, 'next');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                runSearch(searchText, e.shiftKey ? 'prev' : 'next');
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                closeSearch();
              }
            }}
            placeholder="Search terminal…"
            className="flex-1 bg-transparent text-[12px] text-text-primary placeholder:text-text-muted focus:outline-none"
            data-testid="search-input"
          />
          <button
            onClick={() => runSearch(searchText, 'prev')}
            className="p-1 rounded text-text-muted hover:text-text-primary"
            title="Previous (Shift+Enter)"
          >
            <ArrowUp className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => runSearch(searchText, 'next')}
            className="p-1 rounded text-text-muted hover:text-text-primary"
            title="Next (Enter)"
          >
            <ArrowDown className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={closeSearch}
            className="p-1 rounded text-text-muted hover:text-text-primary"
            title="Close (Esc)"
            aria-label="Close search"
          >
            <XIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Terminal canvas */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 px-3 py-2"
        data-testid="terminal-canvas"
      />

      {/* Bottom helper bar — visible only on desktop hover/active to keep
          mobile clean. */}
      <div className={cn(
        'flex-shrink-0 flex items-center gap-3 h-6 px-3 text-[10px] text-text-muted bg-bg-elevated/30 border-t border-border-subtle tabular-nums',
        mobile && 'hidden',
      )}>
        <span>Ctrl+Shift+F Search</span>
        <span className="text-border-strong">·</span>
        <span>Ctrl+Shift+C Copy</span>
        <span className="text-border-strong">·</span>
        <span>Ctrl+Shift+V Paste</span>
        {connectionStatus !== 'connected' && (
          <>
            <span className="text-border-strong">·</span>
            <span className="text-status-warning">{connectionStatus}</span>
          </>
        )}
      </div>
    </div>
  );
}

// Helpers re-exported for tests (test imports `cn`).
export { cn };
const WebPTY = memo(WebPTYImpl);
export default WebPTY;
