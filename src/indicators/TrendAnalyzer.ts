import { MarketData } from '../types/trading';
import { TechnicalIndicators } from './technical';

export interface TrendContext {
  trend: 'bullish' | 'bearish' | 'neutral';
  strength: number; // 0-1
  higherTimeframeTrend: 'bullish' | 'bearish' | 'neutral';
  trendAlignment: boolean;
  volatility: 'low' | 'medium' | 'high';
  tradingConditions: 'excellent' | 'good' | 'fair' | 'poor';
}

export class TrendAnalyzer {
  /**
   * Analyze trend across multiple timeframes
   * @param data1m - 1-minute market data (for entries)
   * @param data15m - 15-minute market data (medium-term trend)
   * @param data1h - 1-hour market data (short-term trend)
   * @param data4h - 4-hour market data (overall trend)
   */
  analyzeTrend(
    data1m: MarketData[],
    data15m?: MarketData[],
    data1h?: MarketData[],
    data4h?: MarketData[]
  ): TrendContext {
    // Analyze current timeframe (1m)
    const currentTrend = this.analyzeSingleTimeframe(data1m);
    
    // Analyze higher timeframes - default to neutral if no data
    const neutralTrend = { trend: 'neutral' as const, strength: 0 };
    const trend15m = data15m && data15m.length > 0 ? this.analyzeSingleTimeframe(data15m) : neutralTrend;
    const trend1h = data1h && data1h.length > 0 ? this.analyzeSingleTimeframe(data1h) : neutralTrend;
    const trend4h = data4h && data4h.length > 0 ? this.analyzeSingleTimeframe(data4h) : neutralTrend;
    
    // Determine overall higher timeframe trend
    const higherTimeframeTrend = this.combineHigherTimeframeTrends(trend15m, trend1h, trend4h);
    
    // Check trend alignment
    const trendAlignment = currentTrend.trend === higherTimeframeTrend.trend;
    
    // Calculate volatility
    const volatility = this.calculateVolatility(data1m);
    
    // Determine trading conditions
    const tradingConditions = this.assessTradingConditions(
      currentTrend,
      higherTimeframeTrend,
      trendAlignment,
      volatility
    );
    
    return {
      trend: currentTrend.trend,
      strength: currentTrend.strength,
      higherTimeframeTrend: higherTimeframeTrend.trend,
      trendAlignment,
      volatility,
      tradingConditions
    };
  }
  
  private analyzeSingleTimeframe(data: MarketData[]): { trend: 'bullish' | 'bearish' | 'neutral'; strength: number } {
    if (data.length < 50) {
      return { trend: 'neutral', strength: 0 };
    }
    
    const closes = data.map(d => d.close);
    
    // Calculate EMAs
    const ema20 = TechnicalIndicators.ema(closes, 20);
    const ema50 = TechnicalIndicators.ema(closes, 50);
    
    if (ema20.length < 2 || ema50.length < 2) {
      return { trend: 'neutral', strength: 0 };
    }
    
    const currentEma20 = ema20[ema20.length - 1];
    const currentEma50 = ema50[ema50.length - 1];
    const currentPrice = closes[closes.length - 1];
    
    // Calculate RSI for momentum
    const rsi = TechnicalIndicators.rsi(closes, 14);
    const currentRsi = rsi.length > 0 ? rsi[rsi.length - 1] : 50;
    
    // Determine trend
    let trend: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    let strength = 0;
    
    if (currentPrice > currentEma20 && currentEma20 > currentEma50 && currentRsi > 50) {
      trend = 'bullish';
      strength = Math.min(1, (currentRsi - 50) / 30); // Normalize RSI strength
    } else if (currentPrice < currentEma20 && currentEma20 < currentEma50 && currentRsi < 50) {
      trend = 'bearish';
      strength = Math.min(1, (50 - currentRsi) / 30);
    } else {
      // Check for potential trend start
      if (currentPrice > currentEma20 && currentRsi > 45) {
        trend = 'bullish';
        strength = 0.3; // Weak bullish
      } else if (currentPrice < currentEma20 && currentRsi < 55) {
        trend = 'bearish';
        strength = 0.3; // Weak bearish
      }
    }
    
    // Adjust strength based on EMA separation
    const emaSeparation = Math.abs(currentEma20 - currentEma50) / currentPrice;
    strength = strength * (1 + emaSeparation * 10); // Boost strength for wider EMA separation
    strength = Math.min(1, strength);
    
    return { trend, strength };
  }
  
  private combineHigherTimeframeTrends(
    trend15m: { trend: 'bullish' | 'bearish' | 'neutral'; strength: number },
    trend1h: { trend: 'bullish' | 'bearish' | 'neutral'; strength: number },
    trend4h: { trend: 'bullish' | 'bearish' | 'neutral'; strength: number }
  ): { trend: 'bullish' | 'bearish' | 'neutral'; strength: number } {
    // Weight higher timeframes more heavily
    const weights = { '15m': 0.2, '1h': 0.3, '4h': 0.5 };
    
    let bullishScore = 0;
    let bearishScore = 0;
    
    if (trend15m.trend === 'bullish') bullishScore += weights['15m'] * trend15m.strength;
    if (trend15m.trend === 'bearish') bearishScore += weights['15m'] * trend15m.strength;
    
    if (trend1h.trend === 'bullish') bullishScore += weights['1h'] * trend1h.strength;
    if (trend1h.trend === 'bearish') bearishScore += weights['1h'] * trend1h.strength;
    
    if (trend4h.trend === 'bullish') bullishScore += weights['4h'] * trend4h.strength;
    if (trend4h.trend === 'bearish') bearishScore += weights['4h'] * trend4h.strength;
    
    if (bullishScore > bearishScore && bullishScore > 0.3) {
      return { trend: 'bullish', strength: bullishScore };
    } else if (bearishScore > bullishScore && bearishScore > 0.3) {
      return { trend: 'bearish', strength: bearishScore };
    }
    
    return { trend: 'neutral', strength: 0 };
  }
  
  private calculateVolatility(data: MarketData[]): 'low' | 'medium' | 'high' {
    if (data.length < 20) return 'medium';
    
    const closes = data.slice(-20).map(d => d.close);
    const returns = [];
    
    for (let i = 1; i < closes.length; i++) {
      returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
    }
    
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    
    // Classify volatility based on standard deviation
    if (stdDev < 0.001) return 'low';      // < 0.1%
    if (stdDev < 0.003) return 'medium';   // < 0.3%
    return 'high';                          // >= 0.3%
  }
  
  private assessTradingConditions(
    currentTrend: { trend: 'bullish' | 'bearish' | 'neutral'; strength: number },
    higherTimeframeTrend: { trend: 'bullish' | 'bearish' | 'neutral'; strength: number },
    trendAlignment: boolean,
    volatility: 'low' | 'medium' | 'high'
  ): 'excellent' | 'good' | 'fair' | 'poor' {
    // Excellent: Strong aligned trends with medium volatility
    if (trendAlignment && 
        currentTrend.strength > 0.7 && 
        higherTimeframeTrend.strength > 0.6 &&
        volatility === 'medium') {
      return 'excellent';
    }
    
    // Good: Aligned trends with reasonable strength
    if (trendAlignment && 
        currentTrend.strength > 0.5 && 
        higherTimeframeTrend.strength > 0.4) {
      return 'good';
    }
    
    // Poor: Conflicting trends or very high volatility
    if (!trendAlignment || volatility === 'high') {
      return 'poor';
    }
    
    // If we don't have enough data (neutral trends), default to fair
    if (currentTrend.trend === 'neutral' || higherTimeframeTrend.trend === 'neutral') {
      return 'fair';
    }
    
    // Fair: Everything else
    return 'fair';
  }
}
