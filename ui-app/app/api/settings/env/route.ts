import { NextResponse } from 'next/server';
import { apiRequest } from '@/lib/api';

export async function GET() {
  try {
    // Fetch current environment from backend
    const response = await apiRequest('/api/config/env');
    
    if (response.ok) {
      const envData = await response.json();
      
      // Filter sensitive values for display
      const filteredEnv = {
        EXCHANGE_NAME: 'woo',
        WOOX_API_KEY: envData.WOOX_API_KEY || '',
        WOOX_API_SECRET: envData.WOOX_API_SECRET || '',
        WOOX_APP_ID: envData.WOOX_APP_ID || '',
        EXCHANGE_TESTNET: envData.EXCHANGE_TESTNET || 'true',
        TRADING_PAIRS: envData.TRADING_PAIRS || 'PERP_BTC_USDT,PERP_ETH_USDT',
        TRADING_MODE: envData.TRADING_MODE || 'paper',
        API_PORT: '3006',
        JWT_SECRET: envData.JWT_SECRET || '',
        OPENAI_API_KEY: envData.OPENAI_API_KEY || '',
        OPENROUTER_API_KEY: envData.OPENROUTER_API_KEY || '',
        AI_MODEL: envData.AI_MODEL || 'openai/gpt-5-nano',
        RISK_PER_TRADE: envData.RISK_PER_TRADE || '0.02',
        MAX_POSITIONS: envData.MAX_POSITIONS || '3',
        LEVERAGE: envData.LEVERAGE || '1'
      };
      
      return NextResponse.json(filteredEnv);
    }
    
    // Fallback to process.env if backend not available
    return NextResponse.json({
      EXCHANGE_NAME: 'woo',
      WOOX_API_KEY: process.env.WOOX_API_KEY || '',
      WOOX_API_SECRET: process.env.WOOX_API_SECRET || '',
      WOOX_APP_ID: process.env.WOOX_APP_ID || '',
      EXCHANGE_TESTNET: process.env.EXCHANGE_TESTNET || 'true',
      TRADING_PAIRS: process.env.TRADING_PAIRS || 'PERP_BTC_USDT,PERP_ETH_USDT',
      TRADING_MODE: process.env.TRADING_MODE || 'paper',
      API_PORT: '3006',
      JWT_SECRET: process.env.JWT_SECRET || '',
      OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || '',
      AI_MODEL: process.env.AI_MODEL || 'openai/gpt-5-nano'
    });
  } catch (error) {
    console.error('Failed to fetch environment:', error);
    return NextResponse.json({}, { status: 500 });
  }
}
