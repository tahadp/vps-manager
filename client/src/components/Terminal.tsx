"use client";
import React, { useEffect, useRef, useState } from 'react';
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
  const stateRef = useRef<ConnState>('idle');
  const currentSessionIdRef = useRef<string | null>(null);
  const [state, setState] = useState<ConnState>('idle');
  const { socket, connectionStatus } = useSocket();

  useEffect(() => {
    if (!terminalRef.current) return;
    if (!socket) return;

    let cancelled = false;
    let xterm: any = null;
    let fitAddon: any = null;
    const attachedHandlers: Array<[string, (...args: any[]) => void]> = [];

    const writeStatus = (term: any, msg: string, color: 'gray' | 'green' | 'red' | 'yellow' = 'gray') => {
      const codes: Record<string, string> = { gray: '90', green: '32', red: '31', yellow: '33' };
      try { term.write(`\x1b[${codes[color]}m${msg}\x1b[0m\r\n`); } catch {}
    };

    (async () => {
      const xtermPkg = await import('xterm');
      const fitPkg = await import('xterm-addon-fit');
      await import('xterm/css/xterm.css');
      if (cancelled || !terminalRef.current) return;

      const Terminal = xtermPkg.Terminal;
      const FitAddon = fitPkg.FitAddon;

      xterm = new Terminal({
        theme: { background: '#18181b', foreground: '#f4f4f5', cursor: '#8251EE' },
        fontFamily: "'Geist Mono', monospace",
        fontSize: 14,
        cursorBlink: true,
        convertEol: true
      });
      fitAddon = new FitAddon();
      xterm.loadAddon(fitAddon);
      xterm.open(terminalRef.current);
      termRef.current = xterm;
      fitRef.current = fitAddon;

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

      if (socket.connected) {
        setStateAndRef('connecting');
        writeStatus(xterm, 'Authenticating, requesting PTY…', 'gray');
        socket.emit('shell:open', { vpsId });
      } else {
        setStateAndRef('connecting');
        writeStatus(xterm, 'Connecting to VPS…', 'gray');
      }

      const onConnect = () => {
        writeStatus(xterm, 'Authenticating, requesting PTY…', 'gray');
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

      xterm.onData((data: string) => {
        if (socket.connected && stateRef.current === 'connected' && currentSessionIdRef.current) {
          socket.emit('shell:input', { sessionId: currentSessionIdRef.current, data });
        }
      });

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
        try { xterm.dispose(); } catch {}
        termRef.current = null;
        fitRef.current = null;
      };
    })();

    return () => {
      cancelled = true;
      const cleanup = (terminalRef.current as any)?.__cleanup;
      if (cleanup) cleanup();
    };
  }, [vpsId, socket]);

  return (
    <div className="w-full h-full relative">
      <div className="absolute top-0 left-0 right-0 px-3 py-1 text-[10px] uppercase font-bold tracking-wider bg-neutral-bg2 border-b border-border-subtle z-10 flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${
          state === 'connected' ? 'bg-status-success' :
          state === 'connecting' ? 'bg-status-warning animate-pulse' :
          state === 'closed' ? 'bg-status-error' : 'bg-text-muted'
        }`} />
        <span className="text-text-muted">{state}</span>
      </div>
      <div ref={terminalRef} className={className || 'w-full h-full pt-6'} />
      {connectionStatus !== 'connected' && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 backdrop-blur-sm pointer-events-none">
          <div className="flex flex-col items-center gap-2 text-text-primary">
            <div className="w-3 h-3 rounded-full bg-status-warning animate-pulse" />
            <span className="text-xs uppercase font-bold tracking-wider text-text-secondary">
              {connectionStatus === 'reconnecting' ? 'Reconnecting…' : 'Disconnected'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
