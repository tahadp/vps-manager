"use client";
import React, { useEffect, useRef, useState } from 'react';
import io, { Socket } from 'socket.io-client';

interface WebPTYProps {
  vpsId: string;
  className?: string;
}

type ConnState = 'idle' | 'connecting' | 'connected' | 'closed';

export default function WebPTY({ vpsId, className }: WebPTYProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<any>(null);
  const fitRef = useRef<any>(null);
  const socketRef = useRef<Socket | null>(null);
  const stateRef = useRef<ConnState>('idle');
  const [state, setState] = useState<ConnState>('idle');

  useEffect(() => {
    if (!terminalRef.current) return;

    let cancelled = false;
    let xterm: any = null;
    let fitAddon: any = null;
    let socket: Socket | null = null;

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

      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      socket = io(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000', {
        auth: { token },
        reconnection: true
      });
      socketRef.current = socket;

      const setStateAndRef = (s: ConnState) => {
        stateRef.current = s;
        setState(s);
      };

      setStateAndRef('connecting');
      writeStatus(xterm, 'Connecting to VPS…', 'gray');

      socket.on('connect', () => {
        writeStatus(xterm, 'Authenticating, requesting PTY…', 'gray');
        socket?.emit('pty_connect', vpsId);
      });
      socket.on('connect_error', (err: any) => {
        setStateAndRef('closed');
        try { xterm.clear(); } catch {}
        writeStatus(xterm, `Connection failed: ${err.message}`, 'red');
      });
      socket.on('disconnect', (reason: string) => {
        setStateAndRef('closed');
        writeStatus(xterm, `Disconnected: ${reason}`, 'yellow');
      });
      socket.on('pty_connected', () => {
        setStateAndRef('connected');
        try { xterm.clear(); } catch {}
      });
      socket.on('pty_closed', () => {
        setStateAndRef('closed');
        writeStatus(xterm, 'Connection closed by server.', 'yellow');
      });
      socket.on('pty_output', (data: string) => {
        try { xterm.write(data); } catch {}
      });
      socket.on('pty_error', (err: string) => {
        setStateAndRef('closed');
        writeStatus(xterm, `Error: ${err}`, 'red');
      });

      xterm.onData((data: string) => {
        if (socket?.connected && stateRef.current === 'connected') {
          socket.emit('pty_input', data);
        }
      });

      (terminalRef.current as any).__cleanup = () => {
        clearTimeout(fitTimeout);
        resizeObserver.disconnect();
        socket?.disconnect();
        try { xterm.dispose(); } catch {}
        termRef.current = null;
        fitRef.current = null;
        socketRef.current = null;
      };
    })();

    return () => {
      cancelled = true;
      const cleanup = (terminalRef.current as any)?.__cleanup;
      if (cleanup) cleanup();
    };
  }, [vpsId]);

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
    </div>
  );
}
