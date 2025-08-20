export interface Position {
  id: string;
  symbol: string;
  side: 'long' | 'short';
  entryPrice: number;
  currentPrice: number;
  quantity: number;
  value: number;
  pnl: number;
  pnlPercent: number;
  stopLoss: number;
  takeProfit: number;
  openTime: Date;
  leverage: number;
}

export interface Signal {
  id: string;
  timestamp: Date;
  symbol: string;
  action: 'buy' | 'sell' | 'hold' | 'close';
  strength: number; // 0-1
  strategy: string;
  indicators: Record<string, any>;
  confidence: number; // 0-1
  suggestedEntry?: number;
  suggestedStopLoss?: number;
  suggestedTakeProfit?: number;
  positionSize?: number;
  // Position context for signals on symbols with existing positions
  hasPosition?: boolean;
  positionSide?: 'long' | 'short';
  positionPnL?: number;
}

export type OrderStatus = 'pending' | 'filled' | 'partial' | 'cancelled' | 'rejected';

export interface Order {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop' | 'stop_limit';
  quantity: number;
  price?: number;
  stopPrice?: number;
  status: OrderStatus;
  filledQty: number;
  avgPrice: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface MarketData {
  symbol: string;
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  bid: number;
  ask: number;
  spread: number;
  bidSize: number;
  askSize: number;
  orderbook?: {
    bids: [number, number][];
    asks: [number, number][];
  };
  fetchedAt?: number;
  isLatest?: boolean;
}

export interface AccountInfo {
  totalBalance: number;
  availableBalance: number;
  marginBalance: number;
  unrealizedPnL: number;
  realizedPnL: number;
  positions: Position[];
  openOrders: Order[];
}

export interface RiskMetrics {
  currentDrawdown: number;
  maxDrawdown: number;
  sharpeRatio: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  currentRiskExposure: number;
  maxRiskExposure: number;
}
