"use client";

import { useEffect, useState } from "react";
import io from "socket.io-client";

export default function Home() {
  const [metrics, setMetrics] = useState<any>({ CPUUsage: 0, RAMUsage: 0, NetTx: 0, NetRx: 0 });
  const [vpsId] = useState("test-vps-123");

  useEffect(() => {
    // Backend API WebSocket bağlantısı
    const socket = io('http://localhost:5000');
    
    socket.on('connect', () => {
      console.log('Connected to WebSocket server');
      // Sadece kendi sahip olduğumuz sunucunun odasına katılıyoruz
      socket.emit('subscribe_vps', vpsId);
    });

    socket.on('telemetry_update', (data) => {
      setMetrics(data);
    });

    return () => {
      socket.disconnect();
    };
  }, [vpsId]);

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
      <header className="flex justify-between items-center mb-8 border-b border-gray-800 pb-4">
        <h1 className="text-3xl font-bold">VPS Dashboard</h1>
        <div className="flex gap-4">
          <button className="bg-gray-800 px-4 py-2 rounded hover:bg-gray-700 transition">Add VPS</button>
          <button className="bg-red-900 px-4 py-2 rounded hover:bg-red-800 text-red-100 transition">Logout</button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* VPS Card Component */}
        <div className="bg-gray-900 border border-gray-800 p-6 rounded-lg shadow-lg hover:border-gray-600 transition">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h2 className="text-xl font-semibold">Test VPS 1 (Ubuntu)</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                <span className="text-xs text-green-400">Online</span>
              </div>
            </div>
            <button className="bg-blue-600 text-xs px-3 py-1 rounded hover:bg-blue-500">Terminal (xterm.js)</button>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-400">CPU Usage</span>
                <span>{(metrics.CPUUsage || 0).toFixed(1)}%</span>
              </div>
              <div className="w-full bg-gray-800 rounded-full h-2">
                <div className="bg-blue-500 h-2 rounded-full transition-all duration-300" style={{ width: `${Math.min(metrics.CPUUsage || 0, 100)}%` }}></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-400">RAM Usage</span>
                <span>{(metrics.RAMUsage || 0).toFixed(1)}%</span>
              </div>
              <div className="w-full bg-gray-800 rounded-full h-2">
                <div className="bg-purple-500 h-2 rounded-full transition-all duration-300" style={{ width: `${Math.min(metrics.RAMUsage || 0, 100)}%` }}></div>
              </div>
            </div>
            
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-400">Network</span>
                <span>{(metrics.NetTx / 1024).toFixed(1)} KB/s Tx | {(metrics.NetRx / 1024).toFixed(1)} KB/s Rx</span>
              </div>
            </div>

            <div className="flex gap-4 mt-4 pt-4 border-t border-gray-800">
              <button className="flex-1 bg-gray-800 hover:bg-gray-700 py-2 rounded text-sm transition">Restart</button>
              <button className="flex-1 bg-gray-800 hover:bg-gray-700 py-2 rounded text-sm transition">Stop</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
