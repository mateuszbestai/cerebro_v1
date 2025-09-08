import { useState, useEffect, useCallback, useRef } from 'react';
import { WebSocketService } from '../services/websocket';

interface UseWebSocketReturn {
  isConnected: boolean;
  sendMessage: (message: any) => void;
  lastMessage: string | null;
  error: string | null;
  reconnect: () => void;
}

export const useWebSocket = (url: string): UseWebSocketReturn => {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wsService = useRef<WebSocketService | null>(null);

  useEffect(() => {
    wsService.current = new WebSocketService(url);

    wsService.current.on('open', () => {
      setIsConnected(true);
      setError(null);
    });

    wsService.current.on('message', (data: string) => {
      setLastMessage(data);
    });

    wsService.current.on('error', (err: string) => {
      setError(err);
      setIsConnected(false);
    });

    wsService.current.on('close', () => {
      setIsConnected(false);
    });

    wsService.current.connect();

    return () => {
      wsService.current?.disconnect();
    };
  }, [url]);

  const sendMessage = useCallback((message: any) => {
    wsService.current?.send(message);
  }, []);

  const reconnect = useCallback(() => {
    wsService.current?.reconnect();
  }, []);

  return {
    isConnected,
    sendMessage,
    lastMessage,
    error,
    reconnect,
  };
};