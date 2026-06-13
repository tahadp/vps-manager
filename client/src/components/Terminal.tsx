"use client";
import React, { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import io, { Socket } from 'socket.io-client';

interface WebPTYProps {
  vpsId: string;
  className?: string;
}

type ConnState = 'idle' | 'connecting' | 'connected' | 'closed';

export default function WebPTY({ vpsId, className }: WebPTYProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const [state, setState] = useState<ConnState>('idle');

  useEffect(() => {
    if (!terminalRef.current) return;

    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    const socket = io(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000', {
      auth: { token },
      reconnection: true
    });
    socketRef.current = socket;

    const term = new XTerm({
      theme: {
        background: '#18181b',
        foreground: '#f4f4f5',
        cursor: '#8251EE'
      },
      fontFamily: "'Geist Mono', monospace",
      fontSize: 14,
      cursorBlink: true,
      convertEol: true
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);

    const fitTerminal = () => {
      if (terminalRef.current && terminalRef.current.offsetWidth > 0 && terminalRef.current.offsetHeight > 0) {
        try { fitAddon.fit(); } catch {}
      }
    };
    const fitTimeout = setTimeout(fitTerminal, 100);

    const resizeObserver = new ResizeObserver(fitTerminal);
    resizeObserver.observe(terminalRef.current);

    xtermRef.current = term;

    const writeStatus = (msg: string, color: 'gray' | 'green' | 'red' | 'yellow' = 'gray') => {
      const codes: Record<string, string> = { gray: '90', green: '32', red: '31', yellow: '33' };
      term.write(`\x1b[${codes[color]}m${msg}\x1b[0m\r\n`);
    };

    setState('connecting');
    writeStatus('Connecting to VPS…', 'gray');

    socket.on('connect', () => {
      writeStatus('Authenticating, requesting PTY…', 'gray');
      socket.emit('pty_connect', vpsId);
    });

    socket.on('connect_error', (err) => {
      setState('closed');
      term.clear();
      writeStatus(`Connection failed: ${err.message}`, 'red');
    });

    socket.on('disconnect', (reason) => {
      setState('closed');
      writeStatus(`Disconnected: ${reason}`, 'yellow');
    });

    socket.on('pty_connected', () => {
      setState('connected');
      term.clear();
    });

    socket.on('pty_closed', () => {
      setState('closed');
      writeStatus('Connection closed by server.', 'yellow');
    });

    socket.on('pty_output', (data: string) => {
      term.write(data);
    });

    socket.on('pty_error', (err: string) => {
      setState('closed');
      writeStatus(`Error: ${err}`, 'red');
    });

    term.onData((data) => {
      if (socket.connected && stateRef.current === 'connected') {
        socket.emit('pty_input', data);
      }
    });

    return () => {
      clearTimeout(fitTimeout);
      resizeObserver.disconnect();
      socket.disconnect();
      term.dispose();
      xtermRef.current = null;
      socketRef.current = null;
    };
  }, [vpsId]);

  // Use a ref so the term.onData callback always sees the latest state
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

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
