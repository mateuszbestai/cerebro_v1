import { EventEmitter } from 'events';

export class WebSocketService extends EventEmitter {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectInterval: number = 5000;
  private shouldReconnect: boolean = true;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(url?: string) {
    super();
    // Use Vite env variable
    this.url = url || import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws';
  }

  connect(): void {
    try {
      this.ws = new WebSocket(this.url);
      
      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.emit('open');
        this.clearReconnectTimer();
      };

      this.ws.onmessage = (event) => {
        this.emit('message', event.data);
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.emit('error', 'WebSocket connection error');
      };

      this.ws.onclose = () => {
        console.log('WebSocket disconnected');
        this.emit('close');
        
        if (this.shouldReconnect) {
          this.scheduleReconnect();
        }
      };
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      this.emit('error', 'Failed to create WebSocket connection');
    }
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.clearReconnectTimer();
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  send(data: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      console.error('WebSocket is not connected');
      this.emit('error', 'WebSocket is not connected');
    }
  }

  reconnect(): void {
    this.disconnect();
    this.shouldReconnect = true;
    this.connect();
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer();
    
    this.reconnectTimer = setTimeout(() => {
      console.log('Attempting to reconnect WebSocket...');
      this.connect();
    }, this.reconnectInterval);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}