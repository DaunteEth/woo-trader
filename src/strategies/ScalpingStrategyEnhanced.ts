import { BaseStrategy } from './BaseStrategy';
import { Signal, MarketData, Position } from '../types/trading';
import { TechnicalIndicators } from '../indicators/technical';
import { TrendContext } from '../indicators/TrendAnalyzer';

export class ScalpingStrategyEnhanced extends BaseStrategy {
  private lastTradeTime: Map<string, number> = new Map();
  private trailingStops: Map<string, number> = new Map();
  
  constructor() {
    super('Scalping', {
      emaPeriodFast: 9,
      emaPeriodSlow: 21,
      rsiPeriod: 9, // Short period for quick scalping signals
      rsiOverbought: 75, // Higher threshold for crypto volatility
      rsiOversold: 25, // Lower threshold for crypto volatility
      bbPeriod: 20,
      bbStdDev: 2,
      minSpread: 0.0001, // 0.01%
      maxSpread: 0.001,  // 0.1%
      stopLossPercent: 0.005, // 0.5% - increased from 0.3%
      takeProfitPercent: 0.01, // 1% - increased from 0.6%
      trailingStopPercent: 0.004, // 0.4% trailing stop
      minHoldingPeriod: 30000, // 30 seconds minimum
      cooldownPeriod: 60000, // 1 minute between trades on same symbol
      minConfidence: 0.45, // 45% minimum confidence (lowered for more signals)
      minStrength: 0.5 // 50% minimum strength (lowered for more signals)
    });
  }
  
  async analyze(marketData: MarketData[], positions: Position[], trendContext?: TrendContext): Promise<Signal | null> {
    if (!this.enabled || marketData.length < 50) {
      return null;
    }
    
    const latest = marketData[marketData.length - 1];
    const symbol = latest.symbol;
    const currentPrice = latest.close;
    
    // Check cooldown period
    const lastTrade = this.lastTradeTime.get(symbol) || 0;
    if (Date.now() - lastTrade < this.params.cooldownPeriod) {
      return null;
    }
    
    // Check for existing position
    const openPosition = positions.find(p => p.symbol === symbol);
    
    if (openPosition) {
      // Check minimum holding period
      const holdingTime = Date.now() - openPosition.openTime.getTime();
      if (holdingTime < this.params.minHoldingPeriod) {
        return null; // Don't close too quickly
      }
      
      // Implement trailing stop logic
      const pnlPercent = openPosition.pnlPercent;
      let trailingStop = this.trailingStops.get(openPosition.id);
      
      if (pnlPercent > 0) {
        // Position is profitable - update trailing stop
        const newTrailingStop = openPosition.side === 'long'
          ? currentPrice * (1 - this.params.trailingStopPercent)
          : currentPrice * (1 + this.params.trailingStopPercent);
          
        if (!trailingStop || 
            (openPosition.side === 'long' && newTrailingStop > trailingStop) ||
            (openPosition.side === 'short' && newTrailingStop < trailingStop)) {
          trailingStop = newTrailingStop;
          this.trailingStops.set(openPosition.id, trailingStop);
        }
      }
      
      // Check exit conditions
      const shouldExit = this.checkExitConditions(openPosition, currentPrice, trailingStop);
      if (shouldExit) {
        this.lastTradeTime.set(symbol, Date.now());
        this.trailingStops.delete(openPosition.id);
        return this.generateSignal(
          'close',
          symbol,
          0.9,
          { 
            reason: shouldExit.reason,
            pnl: pnlPercent,
            holdingTime: holdingTime / 1000 // seconds
          },
          currentPrice
        );
      }
      
      return null; // Hold position
    }
    
    // Entry logic with enhanced filters
    const closes = marketData.map(d => d.close);
    const volumes = marketData.map(d => d.volume);
    
    // Calculate indicators
    const emaFast = TechnicalIndicators.ema(closes, this.params.emaPeriodFast);
    const emaSlow = TechnicalIndicators.ema(closes, this.params.emaPeriodSlow);
    const rsi = TechnicalIndicators.rsi(closes, this.params.rsiPeriod);
    const { upper, lower } = TechnicalIndicators.bollingerBands(
      closes, 
      this.params.bbPeriod, 
      this.params.bbStdDev
    );
    
    const currentEmaFast = emaFast[emaFast.length - 1];
    const currentEmaSlow = emaSlow[emaSlow.length - 1];
    const prevEmaFast = emaFast[emaFast.length - 2];
    const prevEmaSlow = emaSlow[emaSlow.length - 2];
    const currentRsi = rsi[rsi.length - 1];
    
    // Enhanced trend filters
    const emaCrossUp = prevEmaFast <= prevEmaSlow && currentEmaFast > currentEmaSlow;
    const emaCrossDown = prevEmaFast >= prevEmaSlow && currentEmaFast < currentEmaSlow;
    
    // Bollinger Band squeeze detection
    const bbWidth = upper[upper.length - 1] - lower[lower.length - 1];
    const avgBbWidth = upper.slice(-20).reduce((sum, val, idx) => 
      sum + (val - lower[lower.length - 20 + idx]), 0) / 20;
    const bbSqueeze = bbWidth < avgBbWidth * 0.8;
    
    // Volume confirmation
    const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const volumeConfirmation = latest.volume > avgVolume * 1.2;
    
    let signal: Signal | null = null;
    
    // Bullish signal with stricter conditions
    if (emaCrossUp && 
        currentRsi < 60 && 
        currentRsi > this.params.rsiOversold &&
        volumeConfirmation) {
      
      const strength = this.calculateSignalStrength({
        rsi: currentRsi,
        bbSqueeze,
        volumeConfirmation,
        trendAlignment: trendContext?.higherTimeframeTrend === 'bullish'
      });
      
      if (strength >= this.params.minStrength) {
        const confidence = this.calculateSignalConfidence(marketData, 'buy');
        
        if (confidence >= this.params.minConfidence) {
          const stopLoss = currentPrice * (1 - this.params.stopLossPercent);
          const takeProfit = currentPrice * (1 + this.params.takeProfitPercent);
          
          signal = this.generateSignal(
            'buy',
            symbol,
            strength,
            {
              emaFast: currentEmaFast,
              emaSlow: currentEmaSlow,
              rsi: currentRsi,
              bbSqueeze,
              volumeConfirmation,
              confidence
            },
            latest.ask,
            stopLoss,
            takeProfit,
            trendContext
          );
          
          this.lastTradeTime.set(symbol, Date.now());
        }
      }
    }
    // Bearish signal with stricter conditions
    else if (emaCrossDown && 
             currentRsi > 40 && 
             currentRsi < this.params.rsiOverbought &&
             volumeConfirmation) {
      
      const strength = this.calculateSignalStrength({
        rsi: currentRsi,
        bbSqueeze,
        volumeConfirmation,
        trendAlignment: trendContext?.higherTimeframeTrend === 'bearish'
      });
      
      if (strength >= this.params.minStrength) {
        const confidence = this.calculateSignalConfidence(marketData, 'sell');
        
        if (confidence >= this.params.minConfidence) {
          const stopLoss = currentPrice * (1 + this.params.stopLossPercent);
          const takeProfit = currentPrice * (1 - this.params.takeProfitPercent);
          
          signal = this.generateSignal(
            'sell',
            symbol,
            strength,
            {
              emaFast: currentEmaFast,
              emaSlow: currentEmaSlow,
              rsi: currentRsi,
              bbSqueeze,
              volumeConfirmation,
              confidence
            },
            latest.bid,
            stopLoss,
            takeProfit,
            trendContext
          );
          
          this.lastTradeTime.set(symbol, Date.now());
        }
      }
    }
    
    return signal;
  }
  
  private checkExitConditions(position: Position, currentPrice: number, trailingStop?: number): {reason: string} | null {
    const pnlPercent = position.pnlPercent;
    
    // Take profit hit
    if (pnlPercent >= this.params.takeProfitPercent * 100) {
      return { reason: 'take_profit' };
    }
    
    // Stop loss hit
    if (pnlPercent <= -this.params.stopLossPercent * 100) {
      return { reason: 'stop_loss' };
    }
    
    // Trailing stop hit
    if (trailingStop) {
      if ((position.side === 'long' && currentPrice <= trailingStop) ||
          (position.side === 'short' && currentPrice >= trailingStop)) {
        return { reason: 'trailing_stop' };
      }
    }
    
    // Time-based exit for positions held too long
    const holdingTime = Date.now() - position.openTime.getTime();
    if (holdingTime > 300000 && Math.abs(pnlPercent) < 0.2) { // 5 minutes with minimal movement
      return { reason: 'time_exit' };
    }
    
    return null;
  }
  
  private calculateSignalStrength(factors: {
    rsi: number,
    bbSqueeze: boolean,
    volumeConfirmation: boolean,
    trendAlignment: boolean
  }): number {
    let strength = 0.6; // Base strength
    
    // RSI contribution
    if (factors.rsi < 30 || factors.rsi > 70) {
      strength += 0.1;
    }
    
    // Bollinger Band squeeze
    if (factors.bbSqueeze) {
      strength += 0.1;
    }
    
    // Volume confirmation
    if (factors.volumeConfirmation) {
      strength += 0.1;
    }
    
    // Trend alignment
    if (factors.trendAlignment) {
      strength += 0.1;
    }
    
    return Math.min(1, strength);
  }
  
  private calculateSignalConfidence(marketData: MarketData[], direction: 'buy' | 'sell'): number {
    const prices = marketData.slice(-20).map(d => d.close);
    const volatility = this.calculateVolatility(prices);
    
    // Base confidence
    let confidence = 0.5;
    
    // Lower volatility = higher confidence
    if (volatility < 0.005) { // Less than 0.5%
      confidence += 0.2;
    } else if (volatility < 0.01) { // Less than 1%
      confidence += 0.1;
    }
    
    // Price trend consistency
    const trend = this.calculateTrend(prices);
    if ((direction === 'buy' && trend > 0) || (direction === 'sell' && trend < 0)) {
      confidence += 0.2;
    }
    
    // Recent price action
    const recentMomentum = (prices[prices.length - 1] - prices[prices.length - 5]) / prices[prices.length - 5];
    if (Math.abs(recentMomentum) > 0.002 && Math.abs(recentMomentum) < 0.01) {
      confidence += 0.1; // Good momentum but not overextended
    }
    
    return Math.min(1, confidence);
  }
  
  private calculateVolatility(prices: number[]): number {
    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }
    
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    
    return Math.sqrt(variance);
  }
  
  private calculateTrend(prices: number[]): number {
    // Simple linear regression slope
    const n = prices.length;
    const sumX = (n * (n - 1)) / 2;
    const sumY = prices.reduce((a, b) => a + b, 0);
    const sumXY = prices.reduce((sum, price, i) => sum + i * price, 0);
    const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    return slope / (sumY / n); // Normalized slope
  }
  
  getRequiredHistory(): number {
    return 100; // Need 100 candles for indicators
  }
}
