import { BaseStrategy } from './BaseStrategy';
import { Signal, MarketData, Position } from '../types/trading';
import { TechnicalIndicators } from '../indicators/technical';
import { TrendContext } from '../indicators/TrendAnalyzer';

export class MomentumStrategyEnhanced extends BaseStrategy {
  private positionMomentum: Map<string, number> = new Map();
  private highWaterMark: Map<string, number> = new Map();
  private lastSignalTime: Map<string, number> = new Map();
  
  constructor() {
    super('Momentum', {
      vwapEnabled: true,
      bbBreakoutStdDev: 2.0, // Standard deviation for breakout detection
      momentumPeriod: 14, // Aligned with RSI period for consistency
      volumeMultiplier: 1.5, // 1.5x average volume for confirmation
      rsiPeriod: 14,
      rsiMomentumThreshold: 60, // Momentum threshold (not overbought/oversold)
      stopLossPercent: 0.01, // 1% - dynamic based on volatility would be better
      takeProfitPercent: 0.02, // 2% - for 2:1 risk/reward ratio
      trailingStopPercent: 0.005, // 0.5% trailing stop
      minMomentum: 0.5, // Minimum momentum threshold (0.5% move)
      minHoldingPeriod: 60000, // 1 minute minimum
      signalCooldown: 120000, // 2 minutes between signals
      minConfidence: 0.45, // 45% minimum confidence (lowered for more signals)
      minStrength: 0.5 // 50% minimum strength (lowered for more signals)
    });
  }
  
  async analyze(marketData: MarketData[], positions: Position[], trendContext?: TrendContext): Promise<Signal | null> {
    if (!this.enabled || marketData.length < 100) {
      return null;
    }
    
    const latest = marketData[marketData.length - 1];
    const symbol = latest.symbol;
    const currentPrice = latest.close;
    
    // Check signal cooldown
    const lastSignal = this.lastSignalTime.get(symbol) || 0;
    if (Date.now() - lastSignal < this.params.signalCooldown) {
      return null;
    }
    
    // Check for open position
    const openPosition = positions.find(p => p.symbol === symbol);
    
    if (openPosition) {
      return this.handleOpenPosition(openPosition, marketData, currentPrice);
    }
    
    // Entry signal generation
    const signal = await this.generateEntrySignal(marketData, trendContext);
    
    if (signal) {
      this.lastSignalTime.set(symbol, Date.now());
    }
    
    return signal;
  }
  
  private handleOpenPosition(position: Position, marketData: MarketData[], currentPrice: number): Signal | null {
    const holdingTime = Date.now() - position.openTime.getTime();
    
    // Enforce minimum holding period
    if (holdingTime < this.params.minHoldingPeriod) {
      return null;
    }
    
    const pnlPercent = position.pnlPercent;
    const positionId = position.id;
    
    // Update high water mark for trailing stop
    let hwm = this.highWaterMark.get(positionId) || position.entryPrice;
    if (position.side === 'long' && currentPrice > hwm) {
      hwm = currentPrice;
      this.highWaterMark.set(positionId, hwm);
    } else if (position.side === 'short' && currentPrice < hwm) {
      hwm = currentPrice;
      this.highWaterMark.set(positionId, hwm);
    }
    
    // Calculate current momentum
    const momentum = this.calculateMomentum(marketData);
    const previousMomentum = this.positionMomentum.get(positionId) || momentum;
    this.positionMomentum.set(positionId, momentum);
    
    // Exit conditions
    let exitReason: string | null = null;
    
    // Take profit
    if (pnlPercent >= this.params.takeProfitPercent * 100) {
      exitReason = 'take_profit';
    }
    // Stop loss
    else if (pnlPercent <= -this.params.stopLossPercent * 100) {
      exitReason = 'stop_loss';
    }
    // Trailing stop based on high water mark
    else if (pnlPercent > 0) {
      const trailingStopPrice = position.side === 'long'
        ? hwm * (1 - this.params.trailingStopPercent)
        : hwm * (1 + this.params.trailingStopPercent);
        
      if ((position.side === 'long' && currentPrice <= trailingStopPrice) ||
          (position.side === 'short' && currentPrice >= trailingStopPrice)) {
        exitReason = 'trailing_stop';
      }
    }
    // Momentum reversal
    else if ((position.side === 'long' && momentum < -this.params.minMomentum && previousMomentum > 0) ||
             (position.side === 'short' && momentum > this.params.minMomentum && previousMomentum < 0)) {
      exitReason = 'momentum_reversal';
    }
    // Time exit for stale positions
    else if (holdingTime > 600000 && Math.abs(pnlPercent) < 0.3) { // 10 minutes with minimal movement
      exitReason = 'time_exit';
    }
    
    if (exitReason) {
      // Cleanup position data
      this.highWaterMark.delete(positionId);
      this.positionMomentum.delete(positionId);
      
      return this.generateSignal(
        'close',
        position.symbol,
        0.9,
        { 
          reason: exitReason,
          pnl: pnlPercent,
          momentum,
          holdingTime: holdingTime / 1000
        },
        currentPrice
      );
    }
    
    return null;
  }
  
  private async generateEntrySignal(marketData: MarketData[], trendContext?: TrendContext): Promise<Signal | null> {
    const latest = marketData[marketData.length - 1];
    const symbol = latest.symbol;
    const currentPrice = latest.close;
    
    const closes = marketData.map(d => d.close);
    const volumes = marketData.map(d => d.volume);
    
    // Calculate indicators
    const { upper, middle, lower } = TechnicalIndicators.bollingerBands(
      closes,
      20,
      this.params.bbBreakoutStdDev
    );
    
    const rsi = TechnicalIndicators.rsi(closes, this.params.rsiPeriod);
    const currentRsi = rsi[rsi.length - 1];
    
    // Volume analysis
    const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const volumeSurge = latest.volume > avgVolume * this.params.volumeMultiplier;
    
    // Momentum calculation
    const momentum = this.calculateMomentum(marketData);
    
    // VWAP if enabled
    let vwapValue = currentPrice;
    if (this.params.vwapEnabled) {
      vwapValue = this.calculateVWAP(marketData.slice(-20));
    }
    
    // Trend strength from context
    const trendStrength = trendContext?.tradingConditions === 'excellent' ? 1 : 
                         trendContext?.tradingConditions === 'good' ? 0.7 :
                         trendContext?.tradingConditions === 'fair' ? 0.5 : 0;
    
    let signal: Signal | null = null;
    
    // Log conditions for debugging
    this.logger.debug('Momentum conditions check', {
      symbol,
      priceAboveUpper: currentPrice > upper[upper.length - 1],
      upperBand: upper[upper.length - 1],
      currentPrice,
      momentum,
      minMomentum: this.params.minMomentum,
      momentumOk: momentum > this.params.minMomentum,
      currentRsi,
      rsiThreshold: this.params.rsiMomentumThreshold,
      rsiOk: currentRsi > this.params.rsiMomentumThreshold && currentRsi < 85,
      volumeSurge,
      vwapCheck: currentPrice > vwapValue,
      vwapValue
    });
    
    // Bullish breakout
    if (currentPrice > upper[upper.length - 1] &&
        momentum > this.params.minMomentum &&
        currentRsi > this.params.rsiMomentumThreshold &&
        currentRsi < 85 && // Not overbought
        volumeSurge &&
        currentPrice > vwapValue) {
      
      const strength = this.calculateSignalStrength({
        momentum,
        rsi: currentRsi,
        volumeSurge,
        trendStrength,
        pricePosition: (currentPrice - middle[middle.length - 1]) / (upper[upper.length - 1] - middle[middle.length - 1])
      });
      
      if (strength >= this.params.minStrength) {
        const confidence = this.calculateSignalConfidence({
          momentum,
          volumeSurge,
          trendAlignment: trendContext?.higherTimeframeTrend === 'bullish',
          volatility: this.calculateVolatility(closes.slice(-20))
        });
        
        this.logger.info('Momentum signal evaluation', {
          symbol,
          action: 'buy',
          strength,
          confidence,
          minStrength: this.params.minStrength,
          minConfidence: this.params.minConfidence,
          willGenerate: confidence >= this.params.minConfidence
        });
        
        if (confidence >= this.params.minConfidence) {
          const stopLoss = currentPrice * (1 - this.params.stopLossPercent);
          const takeProfit = currentPrice * (1 + this.params.takeProfitPercent);
          
          signal = this.generateSignal(
            'buy',
            symbol,
            strength,
            {
              type: 'momentum_breakout',
              momentum,
              rsi: currentRsi,
              volumeSurge,
              bbPosition: 'above_upper',
              vwapDelta: ((currentPrice - vwapValue) / vwapValue) * 100,
              confidence
            },
            latest.ask,
            stopLoss,
            takeProfit,
            trendContext
          );
        }
      }
    }
    // Bearish breakout
    else if (currentPrice < lower[lower.length - 1] &&
             momentum < -this.params.minMomentum &&
             currentRsi < (100 - this.params.rsiMomentumThreshold) &&
             currentRsi > 15 && // Not oversold
             volumeSurge &&
             currentPrice < vwapValue) {
      
      const strength = this.calculateSignalStrength({
        momentum: Math.abs(momentum),
        rsi: 100 - currentRsi,
        volumeSurge,
        trendStrength,
        pricePosition: Math.abs((currentPrice - middle[middle.length - 1]) / (middle[middle.length - 1] - lower[lower.length - 1]))
      });
      
      if (strength >= this.params.minStrength) {
        const confidence = this.calculateSignalConfidence({
          momentum: Math.abs(momentum),
          volumeSurge,
          trendAlignment: trendContext?.higherTimeframeTrend === 'bearish',
          volatility: this.calculateVolatility(closes.slice(-20))
        });
        
        if (confidence >= this.params.minConfidence) {
          const stopLoss = currentPrice * (1 + this.params.stopLossPercent);
          const takeProfit = currentPrice * (1 - this.params.takeProfitPercent);
          
          signal = this.generateSignal(
            'sell',
            symbol,
            strength,
            {
              type: 'momentum_breakout',
              momentum,
              rsi: currentRsi,
              volumeSurge,
              bbPosition: 'below_lower',
              vwapDelta: ((currentPrice - vwapValue) / vwapValue) * 100,
              confidence
            },
            latest.bid,
            stopLoss,
            takeProfit,
            trendContext
          );
        }
      }
    }
    
    return signal;
  }
  
  private calculateMomentum(marketData: MarketData[]): number {
    const period = this.params.momentumPeriod;
    if (marketData.length < period + 1) return 0;
    
    const current = marketData[marketData.length - 1].close;
    const previous = marketData[marketData.length - period - 1].close;
    
    return ((current - previous) / previous) * 100;
  }
  
  private calculateVWAP(marketData: MarketData[]): number {
    let totalVolume = 0;
    let totalVolumePrice = 0;
    
    for (const data of marketData) {
      const typicalPrice = (data.high + data.low + data.close) / 3;
      totalVolumePrice += typicalPrice * data.volume;
      totalVolume += data.volume;
    }
    
    return totalVolume > 0 ? totalVolumePrice / totalVolume : marketData[marketData.length - 1].close;
  }
  
  private calculateSignalStrength(factors: {
    momentum: number,
    rsi: number,
    volumeSurge: boolean,
    trendStrength: number,
    pricePosition: number
  }): number {
    let strength = 0.5; // Base strength
    
    // Momentum contribution (up to 0.2)
    strength += Math.min(0.2, factors.momentum / 10);
    
    // RSI contribution (up to 0.1)
    if (factors.rsi > 65 && factors.rsi < 85) {
      strength += 0.1;
    }
    
    // Volume surge (0.1)
    if (factors.volumeSurge) {
      strength += 0.1;
    }
    
    // Trend strength (up to 0.1)
    strength += factors.trendStrength * 0.1;
    
    // Price position (up to 0.1)
    strength += Math.min(0.1, factors.pricePosition * 0.1);
    
    return Math.min(1, strength);
  }
  
  private calculateSignalConfidence(factors: {
    momentum: number,
    volumeSurge: boolean,
    trendAlignment: boolean,
    volatility: number
  }): number {
    let confidence = 0.5; // Base confidence
    
    // Strong momentum
    if (factors.momentum > 1.5) {
      confidence += 0.2;
    }
    
    // Volume confirmation
    if (factors.volumeSurge) {
      confidence += 0.15;
    }
    
    // Trend alignment
    if (factors.trendAlignment) {
      confidence += 0.15;
    }
    
    // Low volatility (stable conditions)
    if (factors.volatility < 0.01) {
      confidence += 0.1;
    } else if (factors.volatility > 0.02) {
      confidence -= 0.1;
    }
    
    return Math.min(1, Math.max(0, confidence));
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
  
  getRequiredHistory(): number {
    return 100; // Need 100 candles for indicators
  }
}
