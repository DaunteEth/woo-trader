import { BaseStrategy } from './BaseStrategy';
import { Signal, MarketData, Position } from '../types/trading';
import { TechnicalIndicators } from '../indicators/technical';
import { TrendContext } from '../indicators/TrendAnalyzer';

export class ScalpingStrategy extends BaseStrategy {
  constructor() {
    super('Scalping', {
      emaPeriodFast: 9,
      emaPeriodSlow: 21,
      rsiPeriod: 7,
      rsiOverbought: 70,
      rsiOversold: 30,
      bbPeriod: 20,
      bbStdDev: 2,
      minSpread: 0.0001, // 0.01%
      maxSpread: 0.001,  // 0.1%
      stopLossPercent: 0.003, // 0.3% - tight stop loss for HFT
      takeProfitPercent: 0.006  // 0.6% - 2:1 risk-reward ratio
    });
  }
  
  async analyze(marketData: MarketData[], positions: Position[], trendContext?: TrendContext): Promise<Signal | null> {
    if (!this.enabled || marketData.length < this.getRequiredHistory()) {
      return null;
    }
    
    // Don't skip in poor conditions, let confidence handle it
    // Removed condition check to allow signals in all market conditions
    
    const latest = marketData[marketData.length - 1];
    const closes = marketData.map(d => d.close);
    // const volumes = marketData.map(d => d.volume);
    
    // Calculate indicators
    const emaFast = TechnicalIndicators.ema(closes, this.params.emaPeriodFast);
    const emaSlow = TechnicalIndicators.ema(closes, this.params.emaPeriodSlow);
    const rsi = TechnicalIndicators.rsi(closes, this.params.rsiPeriod);
    const bb = TechnicalIndicators.bollingerBands(closes, this.params.bbPeriod, this.params.bbStdDev);
    
    if (emaFast.length < 2 || emaSlow.length < 2 || rsi.length === 0) {
      return null;
    }
    
    const currentEmaFast = emaFast[emaFast.length - 1];
    const currentEmaSlow = emaSlow[emaSlow.length - 1];
    const prevEmaFast = emaFast[emaFast.length - 2];
    const prevEmaSlow = emaSlow[emaSlow.length - 2];
    const currentRsi = rsi[rsi.length - 1];
    const currentPrice = latest.close;
    
    // Check spread conditions
    const spread = (latest.ask - latest.bid) / latest.bid;
    if (spread > this.params.maxSpread) {
      this.logger.debug('Spread too wide', { spread, maxSpread: this.params.maxSpread });
      return null;
    }
    
    // Check if we have an open position
    const openPosition = positions.find(p => p.symbol === latest.symbol);
    
    // Exit signals for open positions
    if (openPosition) {
      // Take profit or stop loss check
      const pnlPercent = openPosition.pnlPercent;
      
      if (pnlPercent >= this.params.takeProfitPercent * 100 || 
          pnlPercent <= -this.params.stopLossPercent * 100) {
        return this.generateSignal(
          'close',
          latest.symbol,
          1.0,
          { reason: pnlPercent > 0 ? 'take_profit' : 'stop_loss', pnl: pnlPercent },
          currentPrice
        );
      }
      
      // Exit on reversal signals
      if ((openPosition.side === 'long' && currentRsi > this.params.rsiOverbought) ||
          (openPosition.side === 'short' && currentRsi < this.params.rsiOversold)) {
        return this.generateSignal(
          'close',
          latest.symbol,
          0.8,
          { reason: 'rsi_reversal', rsi: currentRsi },
          currentPrice
        );
      }
    }
    
    // Entry signals
    let signal: Signal | null = null;
    
    // EMA crossover with RSI confirmation
    const emaCrossUp = prevEmaFast <= prevEmaSlow && currentEmaFast > currentEmaSlow;
    const emaCrossDown = prevEmaFast >= prevEmaSlow && currentEmaFast < currentEmaSlow;
    
    // Bollinger Band squeeze detection
    const bbWidth = bb.upper[bb.upper.length - 1] - bb.lower[bb.lower.length - 1];
    const avgBbWidth = bb.upper.slice(-20).reduce((sum, upper, i) => 
      sum + (upper - bb.lower[bb.lower.length - 20 + i]), 0) / 20;
    const bbSqueeze = bbWidth < avgBbWidth * 0.8;
    
    // Only trade in the direction of the higher timeframe trend if available
    const trendFilter = !trendContext || 
                       (trendContext.higherTimeframeTrend !== 'bearish' && trendContext.tradingConditions !== 'poor');
    const reverseTrendFilter = !trendContext || 
                              (trendContext.higherTimeframeTrend !== 'bullish' && trendContext.tradingConditions !== 'poor');
    
    if (emaCrossUp && currentRsi < 50 && currentRsi > this.params.rsiOversold && trendFilter) {
      // Bullish signal
      const strength = Math.max(0.6, (50 - currentRsi) / 15 * (bbSqueeze ? 1.2 : 1.0));
      const stopLoss = currentPrice * (1 - this.params.stopLossPercent);
      const takeProfit = currentPrice * (1 + this.params.takeProfitPercent);
      
      signal = this.generateSignal(
        'buy',
        latest.symbol,
        strength,
        {
          emaFast: currentEmaFast,
          emaSlow: currentEmaSlow,
          rsi: currentRsi,
          bbSqueeze,
          spread
        },
        latest.ask, // Entry at ask for market buy
        stopLoss,
        takeProfit,
        trendContext
      );
    } else if (emaCrossDown && currentRsi > 50 && currentRsi < this.params.rsiOverbought && reverseTrendFilter) {
      // Bearish signal - SHORT position
      const strength = Math.max(0.6, (currentRsi - 50) / 15 * (bbSqueeze ? 1.2 : 1.0));
      const stopLoss = currentPrice * (1 + this.params.stopLossPercent); // Stop ABOVE for short
      const takeProfit = currentPrice * (1 - this.params.takeProfitPercent); // TP BELOW for short
      
      signal = this.generateSignal(
        'sell',
        latest.symbol,
        strength,
        {
          emaFast: currentEmaFast,
          emaSlow: currentEmaSlow,
          rsi: currentRsi,
          bbSqueeze,
          spread
        },
        latest.bid, // Entry at bid for market sell
        stopLoss,
        takeProfit,
        trendContext
      );
    }
    
    // Range trading at Bollinger Bands
    if (!signal && bb.upper.length > 0) {
      const upperBand = bb.upper[bb.upper.length - 1];
      const lowerBand = bb.lower[bb.lower.length - 1];
      const middleBand = bb.middle[bb.middle.length - 1];
      
      if (currentPrice > upperBand && currentRsi > this.params.rsiOverbought) {
        // Short at upper band
        signal = this.generateSignal(
          'sell',
          latest.symbol,
          0.65,
          { reason: 'bb_upper', price: currentPrice, upperBand, rsi: currentRsi },
          latest.bid,
          currentPrice * (1 + this.params.stopLossPercent), // Stop ABOVE for short
          middleBand // TP at middle band
        );
      } else if (currentPrice < lowerBand && currentRsi < this.params.rsiOversold) {
        // Long at lower band
        signal = this.generateSignal(
          'buy',
          latest.symbol,
          0.65,
          { reason: 'bb_lower', price: currentPrice, lowerBand, rsi: currentRsi },
          latest.ask,
          currentPrice * (1 - this.params.stopLossPercent),
          middleBand
        );
      }
    }
    
    // Additional micro-scalping opportunities - quick mean reversion
    if (!signal && !openPosition) {
      const shortTermAvg = closes.slice(-5).reduce((a, b) => a + b, 0) / 5;
      const deviation = (currentPrice - shortTermAvg) / shortTermAvg;
      
      // Quick mean reversion trades
      if (Math.abs(deviation) > 0.0005) { // 0.05% deviation
        if (deviation < -0.0005 && currentRsi < 45) {
          // Price below short-term average, potential quick bounce
          signal = this.generateSignal(
            'buy',
            latest.symbol,
            0.55,
            { reason: 'mean_reversion', deviation, rsi: currentRsi },
            latest.ask,
            currentPrice * (1 - 0.002), // Tight 0.2% stop
            currentPrice * (1 + 0.003), // Quick 0.3% profit
            trendContext
          );
        } else if (deviation > 0.0005 && currentRsi > 55) {
          // Price above short-term average, potential quick pullback
          signal = this.generateSignal(
            'sell',
            latest.symbol,
            0.55,
            { reason: 'mean_reversion', deviation, rsi: currentRsi },
            latest.bid,
            currentPrice * (1 + 0.002), // Tight 0.2% stop
            currentPrice * (1 - 0.003), // Quick 0.3% profit
            trendContext
          );
        }
      }
    }
    
    return signal;
  }
  
  getRequiredHistory(): number {
    return Math.max(
      this.params.emaPeriodSlow * 2,
      this.params.rsiPeriod + 1,
      this.params.bbPeriod + 20 // For BB squeeze calculation
    );
  }
}
