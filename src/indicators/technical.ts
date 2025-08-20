export class TechnicalIndicators {
  // Exponential Moving Average
  static ema(values: number[], period: number): number[] {
    if (values.length < period) return [];
    
    const multiplier = 2 / (period + 1);
    const ema: number[] = [];
    
    // Start with SMA for first value
    let sum = 0;
    for (let i = 0; i < period; i++) {
      sum += values[i];
    }
    ema[period - 1] = sum / period;
    
    // Calculate EMA for remaining values
    for (let i = period; i < values.length; i++) {
      ema[i] = (values[i] - ema[i - 1]) * multiplier + ema[i - 1];
    }
    
    return ema;
  }
  
  // Relative Strength Index
  static rsi(values: number[], period: number = 14): number[] {
    if (values.length < period + 1) return [];
    
    const rsi: number[] = [];
    let gains = 0;
    let losses = 0;
    
    // Calculate initial average gain/loss
    for (let i = 1; i <= period; i++) {
      const change = values[i] - values[i - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }
    
    let avgGain = gains / period;
    let avgLoss = losses / period;
    
    // Calculate RSI
    for (let i = period; i < values.length; i++) {
      const change = values[i] - values[i - 1];
      
      if (change > 0) {
        avgGain = (avgGain * (period - 1) + change) / period;
        avgLoss = (avgLoss * (period - 1)) / period;
      } else {
        avgGain = (avgGain * (period - 1)) / period;
        avgLoss = (avgLoss * (period - 1) - change) / period;
      }
      
      const rs = avgGain / avgLoss;
      rsi[i] = 100 - (100 / (1 + rs));
    }
    
    return rsi;
  }
  
  // Bollinger Bands
  static bollingerBands(values: number[], period: number = 20, stdDev: number = 2): {
    upper: number[];
    middle: number[];
    lower: number[];
  } {
    const middle = this.sma(values, period);
    const upper: number[] = [];
    const lower: number[] = [];
    
    for (let i = period - 1; i < values.length; i++) {
      const slice = values.slice(i - period + 1, i + 1);
      const avg = middle[i - period + 1];
      const std = this.standardDeviation(slice, avg);
      
      upper[i] = avg + (stdDev * std);
      lower[i] = avg - (stdDev * std);
    }
    
    return { upper, middle, lower };
  }
  
  // Simple Moving Average
  static sma(values: number[], period: number): number[] {
    if (values.length < period) return [];
    
    const sma: number[] = [];
    for (let i = period - 1; i < values.length; i++) {
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += values[i - j];
      }
      sma[i - period + 1] = sum / period;
    }
    
    return sma;
  }
  
  // Standard Deviation
  static standardDeviation(values: number[], mean?: number): number {
    const avg = mean || values.reduce((a, b) => a + b, 0) / values.length;
    const squareDiffs = values.map(value => Math.pow(value - avg, 2));
    const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / values.length;
    return Math.sqrt(avgSquareDiff);
  }
  
  // VWAP (Volume Weighted Average Price)
  static vwap(prices: number[], volumes: number[]): number[] {
    if (prices.length !== volumes.length || prices.length === 0) return [];
    
    const vwap: number[] = [];
    let cumulativePV = 0;
    let cumulativeVolume = 0;
    
    for (let i = 0; i < prices.length; i++) {
      cumulativePV += prices[i] * volumes[i];
      cumulativeVolume += volumes[i];
      vwap[i] = cumulativeVolume > 0 ? cumulativePV / cumulativeVolume : prices[i];
    }
    
    return vwap;
  }
  
  // Stochastic Oscillator
  static stochastic(high: number[], low: number[], close: number[], 
                   kPeriod: number = 14, dPeriod: number = 3): {
    k: number[];
    d: number[];
  } {
    const k: number[] = [];
    
    for (let i = kPeriod - 1; i < close.length; i++) {
      const highestHigh = Math.max(...high.slice(i - kPeriod + 1, i + 1));
      const lowestLow = Math.min(...low.slice(i - kPeriod + 1, i + 1));
      
      if (highestHigh - lowestLow !== 0) {
        k[i] = ((close[i] - lowestLow) / (highestHigh - lowestLow)) * 100;
      } else {
        k[i] = 50; // Middle value when range is 0
      }
    }
    
    const d = this.sma(k.filter(v => v !== undefined), dPeriod);
    
    return { k, d };
  }
  
  // Order Book Imbalance
  static orderBookImbalance(bidSize: number, askSize: number): number {
    const total = bidSize + askSize;
    if (total === 0) return 0;
    return (bidSize - askSize) / total;
  }
  
  // Average True Range (ATR)
  static atr(highs: number[], lows: number[], closes: number[], period: number = 14): number[] {
    if (highs.length < period || lows.length < period || closes.length < period) {
      return [];
    }
    
    const tr: number[] = [];
    
    // Calculate True Range
    for (let i = 1; i < highs.length; i++) {
      const highLow = highs[i] - lows[i];
      const highClose = Math.abs(highs[i] - closes[i - 1]);
      const lowClose = Math.abs(lows[i] - closes[i - 1]);
      
      tr.push(Math.max(highLow, highClose, lowClose));
    }
    
    // Calculate ATR using Wilder's smoothing
    const atr: number[] = [];
    
    // First ATR is simple average of first period true ranges
    let sum = 0;
    for (let i = 0; i < period; i++) {
      sum += tr[i];
    }
    atr[period - 1] = sum / period;
    
    // Subsequent ATR values use Wilder's smoothing
    for (let i = period; i < tr.length; i++) {
      atr[i] = ((atr[i - 1] * (period - 1)) + tr[i]) / period;
    }
    
    return atr;
  }
}
