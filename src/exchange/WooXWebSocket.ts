import WebSocket from 'ws';
import EventEmitter from 'events';
import { createLogger } from '../utils/logger';
import { config } from '../utils/config';

export interface WsOrderBook {
  symbol: string;
  bids: [number, number][];
  asks: [number, number][];
  timestamp: number;
}

export interface WsTrade {
  symbol: string;
  price: number;
  quantity: number;
  side: 'buy' | 'sell';
  timestamp: number;
}

export class WooXWebSocket extends EventEmitter {
  private ws: WebSocket | null = null;
  private logger = createLogger('WooXWebSocket');
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private symbols: Set<string> = new Set();
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  
  constructor() {
    super();
  }
  
  connect(): void {
    try {
      // WOO WebSocket endpoint for public data
      const appId = process.env.WOOX_APP_ID || config.exchange.appId;
      if (!appId) {
        throw new Error('WOOX_APP_ID not configured');
      }
      this.ws = new WebSocket(`wss://wss.woo.network/ws/stream/${appId}`);
      // Using application ID from environment
      
      this.ws.on('open', () => {
        this.logger.info('WebSocket connected');
        this.isConnected = true;
        this.reconnectAttempts = 0; // Reset on successful connection
        this.emit('connected');
        
        // Start ping/pong heartbeat
        this.startHeartbeat();
        
        // Resubscribe to all symbols
        this.symbols.forEach(symbol => {
          this.subscribeToSymbol(symbol);
        });
      });
      
      this.ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(message);
        } catch (error) {
          this.logger.error('Failed to parse message', error);
        }
      });
      
      this.ws.on('error', (error) => {
        this.logger.error('WebSocket error', error);
        this.emit('error', error);
      });
      
      this.ws.on('close', () => {
        this.logger.warn('WebSocket disconnected');
        this.isConnected = false;
        this.emit('disconnected');
        this.stopHeartbeat();
        this.scheduleReconnect();
      });
      
    } catch (error) {
      this.logger.error('Failed to connect WebSocket', error);
      this.scheduleReconnect();
    }
  }
  
  private handleMessage(message: any): void {
    if (message.id && message.event === 'subscribe') {
      this.logger.info('Subscription confirmed', { topic: message.topic });
      return;
    }
    
    if (message.topic) {
      const [symbol, channel] = message.topic.split('@');
      
      if (channel === 'orderbook') {
        this.handleOrderBook(symbol, message.data);
      } else if (channel === 'trade') {
        this.handleTrade(symbol, message.data);
      } else if (channel === 'ticker') {
        this.handleTicker(symbol, message.data);
      }
    }
  }
  
  private handleOrderBook(symbol: string, data: any): void {
    const orderBook: WsOrderBook = {
      symbol: symbol.replace('SPOT_', '').replace('_', '/'),
      bids: data.bids || [],
      asks: data.asks || [],
      timestamp: data.timestamp || Date.now()
    };
    
    this.emit('orderbook', orderBook);
  }
  
  private handleTrade(symbol: string, data: any): void {
    const trade: WsTrade = {
      symbol: symbol.replace('SPOT_', '').replace('_', '/'),
      price: parseFloat(data.price),
      quantity: parseFloat(data.size),
      side: data.side,
      timestamp: data.timestamp || Date.now()
    };
    
    this.emit('trade', trade);
  }
  
  private handleTicker(symbol: string, data: any): void {
    const ticker = {
      symbol: symbol.replace('SPOT_', '').replace('_', '/'),
      bid: parseFloat(data.bid),
      ask: parseFloat(data.ask),
      last: parseFloat(data.last),
      volume: parseFloat(data.volume),
      timestamp: data.timestamp || Date.now()
    };
    
    this.emit('ticker', ticker);
  }
  
  subscribeToSymbol(symbol: string): void {
    this.symbols.add(symbol);
    
    if (!this.isConnected || !this.ws) {
      return;
    }
    
    // Convert symbol format: BTC/USDT -> SPOT_BTC_USDT
    // Handle both SPOT and PERP symbols
    const wsSymbol = symbol.includes('PERP_') ? symbol : `SPOT_${symbol.replace('/', '_')}`;
    
    // Subscribe to multiple channels
    const subscriptions = [
      { topic: `${wsSymbol}@orderbook` },
      { topic: `${wsSymbol}@trade` },
      { topic: `${wsSymbol}@ticker` }
    ];
    
    subscriptions.forEach(sub => {
      this.ws!.send(JSON.stringify({
        event: 'subscribe',
        ...sub
      }));
    });
    
    this.logger.info('Subscribed to symbol', { symbol, wsSymbol });
  }
  
  unsubscribeFromSymbol(symbol: string): void {
    this.symbols.delete(symbol);
    
    if (!this.isConnected || !this.ws) {
      return;
    }
    
    const wsSymbol = `SPOT_${symbol.replace('/', '_')}`;
    
    const unsubscriptions = [
      { topic: `${wsSymbol}@orderbook` },
      { topic: `${wsSymbol}@trade` },
      { topic: `${wsSymbol}@ticker` }
    ];
    
    unsubscriptions.forEach(unsub => {
      this.ws!.send(JSON.stringify({
        event: 'unsubscribe',
        ...unsub
      }));
    });
  }
  
  private startHeartbeat(): void {
    let pongReceived = true;
    
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        if (!pongReceived) {
          this.logger.warn('No pong received, reconnecting...');
          this.ws.close();
          return;
        }
        
        pongReceived = false;
        
        // Send ping message in WOO format
        this.ws.send(JSON.stringify({ event: 'ping' }));
        
        // Set timeout for pong response
        setTimeout(() => {
          if (!pongReceived && this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.logger.warn('Pong timeout, closing connection');
            this.ws.close();
          }
        }, 5000);
      }
    }, 20000); // Ping every 20 seconds
    
    // Handle pong in message handler
    const originalHandleMessage = this.handleMessage.bind(this);
    this.handleMessage = (message: any) => {
      if (message.event === 'pong') {
        pongReceived = true;
        return;
      }
      originalHandleMessage(message);
    };
  }
  
  private stopHeartbeat(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }
  
  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      return;
    }
    
    // Exponential backoff with jitter
    const baseDelay = 1000;
    const maxDelay = 30000;
    const attempts = this.reconnectAttempts || 0;
    const delay = Math.min(baseDelay * Math.pow(2, attempts) + Math.random() * 1000, maxDelay);
    
    this.reconnectAttempts = (this.reconnectAttempts || 0) + 1;
    
    this.logger.info(`Scheduling reconnect attempt ${this.reconnectAttempts} in ${delay}ms`);
    
    this.reconnectTimeout = setTimeout(() => {
      this.logger.info('Attempting to reconnect...');
      this.reconnectTimeout = null;
      this.connect();
    }, delay);
  }
  
  disconnect(): void {
    this.stopHeartbeat();
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.symbols.clear();
    this.isConnected = false;
  }
}
