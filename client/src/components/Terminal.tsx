"use client";
import React, { useEffect, useRef } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import io, { Socket } from 'socket.io-client';

interface WebPTYProps {
  vpsId: string;
  className?: string;
}

export default function WebPTY({ vpsId, className }: WebPTYProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!terminalRef.current) return;

    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    const socket = io(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000', {
      auth: { token }
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
      cursorBlink: true
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    fitAddon.fit();
    xtermRef.current = term;

    socket.on('connect', () => {
      socket.emit('pty_connect', vpsId);
    });

    term.onData((data) => {
      socket.emit('pty_input', data);
    });

    socket.on('pty_output', (data: string) => {
      term.write(data);
    });

    socket.on('pty_error', (err: string) => {
      term.write(`\r\n\x1b[31mError: ${err}\x1b[0m\r\n`);
    });

    const handleResize = () => fitAddon.fit();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      socket.disconnect();
      term.dispose();
      xtermRef.current = null;
      socketRef.current = null;
    };
  }, [vpsId]);

  return (
    <div 
      ref={terminalRef} 
      className={className || 'w-full h-full'}
    />
  );
}
