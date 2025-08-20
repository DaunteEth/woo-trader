import { createLogger } from '../utils/logger';
import { Signal, MarketData, Position } from '../types/trading';
import { TechnicalIndicators } from '../indicators/technical';

interface EntryExitRules {
  // Entry Rules
  minRiskRewardRatio: number;
  maxSpreadPercent: number;
  minVolume: number;
  confirmationCandles: number;
  
  // Exit Rules
  trailingStopPercent: number;
  breakEvenThreshold: number;
  partialTakeProfitPercent: number;
  maxHoldingTime: number; // minutes
  
  // Advanced Rules
  useATRForStops: boolean;
  useFibonacciLevels: boolean;
  useVolumeProfile: boolean;
}

export class EntryExitManager {
  private logger = createLogger('EntryExitManager');
  private rules: EntryExitRules;
  
  constructor() {
    this.rules = {
      minRiskRewardRatio: 1.5,
      maxSpreadPercent: 0.1,    // Tighten for scalping
      minVolume: 100,           // Lower threshold for initial testing
      confirmationCandles: 2,
      
      trailingStopPercent: 0.3,
      breakEvenThreshold: 0.5, // Move SL to breakeven at 50% of TP
      partialTakeProfitPercent: 0.5, // Take 50% profit at first TP
      maxHoldingTime: 30, // 30 minutes for scalps
      
      useATRForStops: true,
      useFibonacciLevels: true,
      useVolumeProfile: true
    };
  }
  
  validateEntry(signal: Signal, marketData: MarketData[]): {
    isValid: boolean;
    reason?: string;
    improvedEntry?: number;
  } {
    const latest = marketData[marketData.length - 1];
    
    // Check spread
    const spread = (latest.ask - latest.bid) / latest.bid;
    if (spread > this.rules.maxSpreadPercent / 100) {
      return { isValid: false, reason: 'Spread too wide' };
    }
    
    // Check volume - calculate 24h volume
    const volume24h = marketData.length > 1440 
      ? marketData.slice(-1440).reduce((sum, d) => sum + d.volume, 0)  // 24h at 1m candles
      : marketData.reduce((sum, d) => sum + d.volume, 0);  // Use all available data if less than 24h
      
    if (volume24h < this.rules.minVolume) {
      return { isValid: false, reason: `Insufficient volume: ${volume24h.toFixed(2)} < ${this.rules.minVolume}` };
    }
    
    // Calculate risk-reward ratio
    const entry = signal.suggestedEntry || latest.close;
    const stopLoss = signal.suggestedStopLoss || entry * 0.995;
    const takeProfit = signal.suggestedTakeProfit || entry * 1.01;
    
    const risk = Math.abs(entry - stopLoss);
    const reward = Math.abs(takeProfit - entry);
    const rrRatio = reward / risk;
    
    if (rrRatio < this.rules.minRiskRewardRatio) {
      return { isValid: false, reason: `RR ratio too low: ${rrRatio.toFixed(2)}` };
    }
    
    // Improve entry using limit order at better price
    let improvedEntry = entry;
    if (signal.action === 'buy') {
      // Try to buy at bid or slightly above
      improvedEntry = latest.bid + (spread * 0.1);
    } else {
      // Try to sell at ask or slightly below
      improvedEntry = latest.ask - (spread * 0.1);
    }
    
    return { isValid: true, improvedEntry };
  }
  
  calculateOptimalStopLoss(
    signal: Signal,
    marketData: MarketData[],
    useATR: boolean = true
  ): number {
    const latest = marketData[marketData.length - 1];
    const entry = signal.suggestedEntry || latest.close;
    
    if (useATR && this.rules.useATRForStops && marketData.length >= 14) {
      // Use ATR for dynamic stop loss
      const highs = marketData.map(d => d.high);
      const lows = marketData.map(d => d.low);
      const closes = marketData.map(d => d.close);
      
      const atr = TechnicalIndicators.atr(highs, lows, closes, 14);
      if (atr.length > 0) {
        const currentATR = atr[atr.length - 1];
        const atrMultiplier = 1.5; // 1.5x ATR for stop loss
        
        if (signal.action === 'buy') {
          return entry - (currentATR * atrMultiplier);
        } else {
          return entry + (currentATR * atrMultiplier);
        }
      }
    }
    
    // Fallback to percentage-based stop loss
    const stopPercent = 0.003; // 0.3%
    if (signal.action === 'buy') {
      return entry * (1 - stopPercent);
    } else {
      return entry * (1 + stopPercent);
    }
  }
  
  calculateOptimalTakeProfit(
    signal: Signal,
    marketData: MarketData[],
    stopLoss: number
  ): number[] {
    const latest = marketData[marketData.length - 1];
    const entry = signal.suggestedEntry || latest.close;
    
    // Calculate risk
    const risk = Math.abs(entry - stopLoss);
    
    // Multiple take profit levels
    const takeProfits: number[] = [];
    
    // TP1: 1:1 risk-reward
    if (signal.action === 'buy') {
      takeProfits.push(entry + risk);
    } else {
      takeProfits.push(entry - risk);
    }
    
    // TP2: 2:1 risk-reward
    if (signal.action === 'buy') {
      takeProfits.push(entry + (risk * 2));
    } else {
      takeProfits.push(entry - (risk * 2));
    }
    
    // TP3: 3:1 risk-reward
    if (signal.action === 'buy') {
      takeProfits.push(entry + (risk * 3));
    } else {
      takeProfits.push(entry - (risk * 3));
    }
    
    return takeProfits;
  }
  
  shouldExitPosition(
    position: Position,
    marketData: MarketData[],
    currentTime: Date
  ): {
    shouldExit: boolean;
    reason?: string;
    exitPrice?: number;
  } {
    const latest = marketData[marketData.length - 1];
    const currentPrice = latest.close;
    
    // Check max holding time
    const holdingTime = (currentTime.getTime() - position.openTime.getTime()) / 1000 / 60; // minutes
    if (holdingTime > this.rules.maxHoldingTime) {
      return { 
        shouldExit: true, 
        reason: 'Max holding time reached',
        exitPrice: position.side === 'long' ? latest.bid : latest.ask
      };
    }
    
    // Check if position hit stop loss
    if (position.side === 'long' && currentPrice <= position.stopLoss) {
      return { 
        shouldExit: true, 
        reason: 'Stop loss hit',
        exitPrice: position.stopLoss
      };
    }
    if (position.side === 'short' && currentPrice >= position.stopLoss) {
      return { 
        shouldExit: true, 
        reason: 'Stop loss hit',
        exitPrice: position.stopLoss
      };
    }
    
    // Check if position hit take profit
    if (position.side === 'long' && currentPrice >= position.takeProfit) {
      return { 
        shouldExit: true, 
        reason: 'Take profit hit',
        exitPrice: position.takeProfit
      };
    }
    if (position.side === 'short' && currentPrice <= position.takeProfit) {
      return { 
        shouldExit: true, 
        reason: 'Take profit hit',
        exitPrice: position.takeProfit
      };
    }
    
    return { shouldExit: false };
  }
  
  updateTrailingStop(position: Position, currentPrice: number): number | null {
    const profitPercent = position.pnlPercent;
    
    // Only trail if in profit above threshold
    if (profitPercent < this.rules.breakEvenThreshold) {
      return null;
    }
    
    // Calculate new trailing stop
    let newStopLoss: number;
    
    if (position.side === 'long') {
      newStopLoss = currentPrice * (1 - this.rules.trailingStopPercent / 100);
      // Only update if new stop is higher than current
      if (newStopLoss <= position.stopLoss) {
        return null;
      }
    } else {
      newStopLoss = currentPrice * (1 + this.rules.trailingStopPercent / 100);
      // Only update if new stop is lower than current
      if (newStopLoss >= position.stopLoss) {
        return null;
      }
    }
    
    this.logger.info('Trailing stop updated', {
      position: position.id,
      oldStop: position.stopLoss,
      newStop: newStopLoss,
      profitPercent
    });
    
    return newStopLoss;
  }
}
