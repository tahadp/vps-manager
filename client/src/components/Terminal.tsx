"use client";
import React, { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import io from 'socket.io-client';

export default function WebPTY({ vpsId }: { vpsId: string }) {
  const terminalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new Terminal({ theme: { background: '#111827' } });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    fitAddon.fit();

    const socket = io(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000');
    socket.emit('subscribe_pty', vpsId);

    term.onData((data) => {
      socket.emit('pty_input', { vpsId, data });
    });

    socket.on('pty_output', (data) => {
      term.write(data);
    });

    return () => {
      socket.disconnect();
      term.dispose();
    };
  }, [vpsId]);

  return <div ref={terminalRef} style={{ width: '100%', height: '400px' }} className="rounded overflow-hidden border border-gray-700" />;
}
