export interface TradingConfig {
  exchange: ExchangeConfig;
  trading: TradingParams;
  risk: RiskParams;
  strategies: StrategyConfig[];
}

export interface ExchangeConfig {
  name: string;
  appId: string;
  apiKey: string;
  apiSecret: string;
  testnet: boolean;
}

export interface TradingParams {
  mode: 'paper' | 'live';
  symbols: string[];
  timeframes: string[];
  leverage: number;
  maxPositions: number;
  minOrderSize: number;
  orderTypes: string[];
}

export interface RiskParams {
  maxRiskPerTrade: number;
  maxDailyLoss: number;
  maxDrawdown: number;
  stopLossPercent: number;
  takeProfitPercent: number;
  positionSizing: 'fixed' | 'kelly' | 'risk_parity';
  riskRewardRatio: number;
}

export interface StrategyConfig {
  name: string;
  enabled: boolean;
  weight: number;
  params: Record<string, any>;
  // Signal following configuration
  followOwnSignals?: boolean;
  followAISignals?: boolean;
  aiExecutionEnabled?: boolean;
  symbols?: string[];
  timeframes?: string[];
}
