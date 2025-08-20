import { BaseStrategy } from './BaseStrategy';
import { Signal, MarketData, Position } from '../types/trading';
import { TechnicalIndicators } from '../indicators/technical';
import { TrendContext } from '../indicators/TrendAnalyzer';

export class MomentumStrategy extends BaseStrategy {
  constructor() {
    super('Momentum', {
      vwapEnabled: true,
      bbBreakoutStdDev: 2,
      momentumPeriod: 10,
      volumeMultiplier: 1.5,
      rsiPeriod: 14,
      rsiMomentumThreshold: 60,
      stopLossPercent: 0.003, // 0.3% - tight stop loss for HFT
      takeProfitPercent: 0.006, // 0.6% - 2:1 risk-reward ratio
      trailingStopPercent: 0.003 // 0.3% - tighter trailing stop
    });
  }
  
  async analyze(marketData: MarketData[], positions: Position[], trendContext?: TrendContext): Promise<Signal | null> {
    if (!this.enabled || marketData.length < this.getRequiredHistory()) {
      return null;
    }
    
    // Don't skip based on conditions, let confidence handle it
    // Momentum works best in trending markets but can still generate signals
    
    const latest = marketData[marketData.length - 1];
    const closes = marketData.map(d => d.close);
    // const highs = marketData.map(d => d.high);
    // const lows = marketData.map(d => d.low);
    const volumes = marketData.map(d => d.volume);
    
    // Calculate indicators
    const rsi = TechnicalIndicators.rsi(closes, this.params.rsiPeriod);
    const bb = TechnicalIndicators.bollingerBands(closes, 20, this.params.bbBreakoutStdDev);
    const vwap = TechnicalIndicators.vwap(closes, volumes);
    
    if (rsi.length === 0 || vwap.length === 0) {
      return null;
    }
    
    const currentPrice = latest.close;
    const currentRsi = rsi[rsi.length - 1];
    const currentVwap = vwap[vwap.length - 1];
    const currentVolume = latest.volume;
    
    // Calculate average volume
    const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const volumeSurge = currentVolume > avgVolume * this.params.volumeMultiplier;
    
    // Calculate momentum
    const momentum = this.params.momentumPeriod > 0 
      ? (currentPrice - closes[closes.length - this.params.momentumPeriod - 1]) / 
        closes[closes.length - this.params.momentumPeriod - 1] * 100
      : 0;
    
    // Check for open positions
    const openPosition = positions.find(p => p.symbol === latest.symbol);
    
    if (openPosition) {
      // Trailing stop logic
      const pnlPercent = openPosition.pnlPercent;
      
      if (pnlPercent >= this.params.takeProfitPercent * 100) {
        // Move to trailing stop
        const trailingStop = openPosition.side === 'long'
          ? currentPrice * (1 - this.params.trailingStopPercent)
          : currentPrice * (1 + this.params.trailingStopPercent);
          
        if ((openPosition.side === 'long' && currentPrice <= trailingStop) ||
            (openPosition.side === 'short' && currentPrice >= trailingStop)) {
          return this.generateSignal(
            'close',
            latest.symbol,
            0.9,
            { reason: 'trailing_stop', pnl: pnlPercent },
            currentPrice
          );
        }
      }
      
      // Exit on momentum reversal
      if ((openPosition.side === 'long' && momentum < -1) ||
          (openPosition.side === 'short' && momentum > 1)) {
        return this.generateSignal(
          'close',
          latest.symbol,
          0.7,
          { reason: 'momentum_reversal', momentum },
          currentPrice
        );
      }
    }
    
    // Entry signals
    let signal: Signal | null = null;
    
    // Bollinger Band breakout with volume
    if (bb.upper.length > 0) {
      const upperBand = bb.upper[bb.upper.length - 1];
      const lowerBand = bb.lower[bb.lower.length - 1];
      // const middleBand = bb.middle[bb.middle.length - 1];
      
      // Bullish breakout
      if (currentPrice > upperBand && 
          volumeSurge && 
          currentRsi > this.params.rsiMomentumThreshold &&
          momentum > 0.5) {
        
        const strength = Math.min(1, 
          (currentRsi - this.params.rsiMomentumThreshold) / 20 * 
          (volumeSurge ? 1.3 : 1.0)
        );
        
        signal = this.generateSignal(
          'buy',
          latest.symbol,
          strength,
          {
            reason: 'bb_breakout_up',
            price: currentPrice,
            upperBand,
            rsi: currentRsi,
            momentum,
            volumeSurge
          },
          latest.ask,
          currentPrice * (1 - this.params.stopLossPercent),
          currentPrice * (1 + this.params.takeProfitPercent),
          trendContext
        );
      }
      // Bearish breakout
      else if (currentPrice < lowerBand && 
               volumeSurge && 
               currentRsi < (100 - this.params.rsiMomentumThreshold) &&
               momentum < -0.5) {
        
        const strength = Math.min(1, 
          ((100 - this.params.rsiMomentumThreshold) - currentRsi) / 20 * 
          (volumeSurge ? 1.3 : 1.0)
        );
        
        signal = this.generateSignal(
          'sell',
          latest.symbol,
          strength,
          {
            reason: 'bb_breakout_down',
            price: currentPrice,
            lowerBand,
            rsi: currentRsi,
            momentum,
            volumeSurge
          },
          latest.bid,
          currentPrice * (1 + this.params.stopLossPercent),
          currentPrice * (1 - this.params.takeProfitPercent),
          trendContext
        );
      }
    }
    
    // VWAP momentum
    if (!signal && this.params.vwapEnabled && currentVwap > 0) {
      const vwapDistance = (currentPrice - currentVwap) / currentVwap * 100;
      
      // Strong upward momentum above VWAP
      if (vwapDistance > 0.1 && momentum > 0.3 && volumeSurge) {
        signal = this.generateSignal(
          'buy',
          latest.symbol,
          0.6,
          {
            reason: 'vwap_momentum',
            vwapDistance,
            momentum,
            volumeSurge
          },
          latest.ask,
          currentVwap, // Stop at VWAP
          currentPrice * (1 + this.params.takeProfitPercent)
        );
      }
      // Strong downward momentum below VWAP
      else if (vwapDistance < -0.1 && momentum < -0.3 && volumeSurge) {
        signal = this.generateSignal(
          'sell',
          latest.symbol,
          0.6,
          {
            reason: 'vwap_momentum',
            vwapDistance,
            momentum,
            volumeSurge
          },
          latest.bid,
          currentVwap, // Stop at VWAP
          currentPrice * (1 - this.params.takeProfitPercent)
        );
      }
    }
    
    return signal;
  }
  
  getRequiredHistory(): number {
    return Math.max(
      this.params.momentumPeriod + 1,
      this.params.rsiPeriod + 1,
      30 // For volume average and BB
    );
  }
}
