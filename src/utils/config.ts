import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { TradingConfig } from '../types/config';
import { ConfigService } from '../services/ConfigService';

// Load environment variables from env.txt as per user preference
try {
  const envPath = path.join(process.cwd(), 'env.txt');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const envVars = dotenv.parse(envContent);
    Object.assign(process.env, envVars);
  }
} catch (error) {
  console.error('Failed to load env.txt:', error);
}

// Also load .env if exists
dotenv.config();

// Helper function to get config value
function getConfigValue(key: string, defaultValue: any = ''): any {
  try {
    const configService = ConfigService.getInstance();
    const value = configService.get(key);
    if (value !== undefined) {
      return value;
    }
  } catch {
    // ConfigService not initialized yet, fall back to process.env
  }
  return process.env[key] || defaultValue;
}

function getConfigNumber(key: string, defaultValue: number): number {
  const value = getConfigValue(key);
  if (!value) return defaultValue;
  const num = parseFloat(value);
  return isNaN(num) ? defaultValue : num;
}

// Commented out - not currently used but may be needed later
// function getConfigBoolean(key: string, defaultValue: boolean): boolean {
//   const value = getConfigValue(key);
//   if (!value) return defaultValue;
//   return value.toLowerCase() === 'true';
// }

// Create config object that dynamically reads from ConfigService or env
export const config: TradingConfig = {
  get exchange() {
    return {
      name: 'woox',
      appId: getConfigValue('WOOX_APP_ID'),
      apiKey: getConfigValue('WOOX_API_KEY'),
      apiSecret: getConfigValue('WOOX_API_SECRET'),
      testnet: getConfigValue('TRADING_MODE', 'paper') === 'paper'
    };
  },
  get trading() {
    return {
      mode: getConfigValue('TRADING_MODE', 'paper') as 'paper' | 'live',
      symbols: getConfigValue('TRADING_PAIRS', 'PERP_BTC_USDT,PERP_ETH_USDT').split(','),
      timeframes: [
        getConfigValue('PRIMARY_TIMEFRAME', '1m'),
        getConfigValue('SECONDARY_TIMEFRAME', '5m')
      ],
      leverage: getConfigNumber('LEVERAGE', 1),
      maxPositions: getConfigNumber('MAX_POSITIONS', 3),
      minOrderSize: 0.001, // 0.001 BTC/ETH minimum for futures
      orderTypes: ['market', 'limit']
    };
  },
  get risk() {
    return {
      maxRiskPerTrade: getConfigNumber('RISK_PER_TRADE', 0.02),
      maxDailyLoss: 0.05, // 5% daily loss limit
      maxDrawdown: 0.10, // 10% max drawdown
      stopLossPercent: 0.005, // 0.5% default stop loss for HFT
      takeProfitPercent: 0.01, // 1% default take profit
      positionSizing: 'risk_parity' as 'fixed' | 'kelly' | 'risk_parity',
      riskRewardRatio: 1.2 // 1:1.2 risk reward (more flexible for HFT)
    };
  },
  get strategies() {
    return [
      {
        name: 'Scalping',
        enabled: true,
        weight: 1.0,  // Increased for better signal confidence
        params: {}
      },
      {
        name: 'Momentum',
        enabled: true,
        weight: 0.8,  // Increased for better signal confidence
        params: {}
      },
      {
        name: 'Arbitrage',
        enabled: false,
        weight: 0.2,  // Deprioritize until proper cross-exchange engine
        params: {}
      }
    ];
  }
};

export const validateConfig = (): boolean => {
  const currentConfig = config; // This will trigger the getters
  
  if (!currentConfig.exchange.appId || !currentConfig.exchange.apiKey || !currentConfig.exchange.apiSecret) {
    throw new Error('Missing exchange credentials');
  }
  
  if (currentConfig.risk.maxRiskPerTrade > 0.05) {
    throw new Error('Risk per trade too high (max 5%)');
  }
  
  return true;
};