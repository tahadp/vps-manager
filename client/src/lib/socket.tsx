"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode
} from "react";
import { io, Socket } from "socket.io-client";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

export type ConnectionStatus = "connected" | "reconnecting" | "disconnected";

interface SocketContextValue {
  socket: Socket | null;
  connectionStatus: ConnectionStatus;
  connectError: string | null;
}

const SocketContext = createContext<SocketContextValue>({
  socket: null,
  connectionStatus: "disconnected",
  connectError: null
});

interface SocketProviderProps {
  authenticated: boolean;
  children: ReactNode;
}

export function SocketProvider({ authenticated, children }: SocketProviderProps) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [connectError, setConnectError] = useState<string | null>(null);

  useEffect(() => {
    if (!authenticated) {
      setSocket(null);
      setConnectionStatus("disconnected");
      return;
    }

    const instance = io(API, {
      withCredentials: true,
      transports: ["websocket"],
      reconnection: true,
      reconnectionDelay: 1000 + Math.random() * 500,
      reconnectionDelayMax: 30000,
      randomizationFactor: 0.5
    });

    setSocket(instance);
    setConnectError(null);
    setConnectionStatus("disconnected");

    const onConnect = () => {
      setConnectionStatus("connected");
      setConnectError(null);
      instance.emit("subscribe_vps_list");
    };
    const onDisconnect = () => setConnectionStatus("disconnected");
    const onReconnectAttempt = () => setConnectionStatus("reconnecting");
    const onReconnect = () => {
      setConnectionStatus("connected");
      setConnectError(null);
      instance.emit("subscribe_vps_list");
    };
    const onConnectError = (err: Error) => {
      setConnectionStatus("reconnecting");
      setConnectError(err?.message || "Connection error");
    };

    instance.on("connect", onConnect);
    instance.on("disconnect", onDisconnect);
    instance.io.on("reconnect_attempt", onReconnectAttempt);
    instance.io.on("reconnect", onReconnect);
    instance.on("connect_error", onConnectError);

    if (instance.connected) onConnect();

    return () => {
      instance.off("connect", onConnect);
      instance.off("disconnect", onDisconnect);
      instance.io.off("reconnect_attempt", onReconnectAttempt);
      instance.io.off("reconnect", onReconnect);
      instance.off("connect_error", onConnectError);
      instance.disconnect();
      setSocket(null);
    };
  }, [authenticated]);

  const value = useMemo<SocketContextValue>(
    () => ({ socket, connectionStatus, connectError }),
    [socket, connectionStatus, connectError]
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket(): SocketContextValue {
  return useContext(SocketContext);
}
