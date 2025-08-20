import { BaseStrategy } from './BaseStrategy';
import { Signal, MarketData, Position } from '../types/trading';
import { TrendContext } from '../indicators/TrendAnalyzer';

// interface OrderBookLevel {
//   price: number;
//   size: number;
// }

interface OrderBookImbalance {
  bidPressure: number;
  askPressure: number;
  imbalanceRatio: number;
  weightedMidPrice: number;
}

export class OrderBookArbitrageStrategy extends BaseStrategy {
  // private orderBookCache: Map<string, { bids: OrderBookLevel[], asks: OrderBookLevel[] }> = new Map();
  
  constructor() {
    super('OrderBookArbitrage', {
      minImbalanceRatio: 2.0, // Minimum bid/ask imbalance ratio
      depthLevels: 10, // Number of order book levels to analyze
      minSpreadBps: 5, // Minimum spread in basis points
      maxSpreadBps: 50, // Maximum spread (to avoid stale data)
      minVolumeImbalance: 10000, // Minimum volume imbalance in USDT
      stopLossPercent: 0.002, // 0.2% stop loss
      takeProfitPercent: 0.004, // 0.4% take profit
      confidenceThreshold: 0.7,
      enabled: true
    });
  }
  
  async analyze(marketData: MarketData[], _positions: Position[], trendContext?: TrendContext): Promise<Signal | null> {
    if (!this.enabled || marketData.length === 0) {
      return null;
    }
    
    const latest = marketData[marketData.length - 1];
    const symbol = latest.symbol;
    
    // Calculate spread in basis points
    const spreadBps = ((latest.ask - latest.bid) / latest.bid) * 10000;
    
    // Check if spread is within acceptable range
    if (spreadBps < this.params.minSpreadBps || spreadBps > this.params.maxSpreadBps) {
      return null;
    }
    
    // Analyze order book imbalance
    const imbalance = this.calculateOrderBookImbalance(latest);
    
    if (!imbalance) {
      return null;
    }
    
    // Microstructure analysis - detect order book pressure
    if (Math.abs(imbalance.imbalanceRatio) >= this.params.minImbalanceRatio) {
      const volumeImbalance = Math.abs(imbalance.bidPressure - imbalance.askPressure);
      
      if (volumeImbalance >= this.params.minVolumeImbalance) {
        // Strong bid pressure - likely price will move up
        if (imbalance.imbalanceRatio > this.params.minImbalanceRatio) {
          const confidence = this.calculateImbalanceConfidence(imbalance, spreadBps, marketData);
          
          if (confidence >= this.params.confidenceThreshold) {
            return this.generateSignal(
              'buy',
              symbol,
              Math.min(1, imbalance.imbalanceRatio / 3),
              {
                type: 'orderbook_imbalance',
                bidPressure: imbalance.bidPressure,
                askPressure: imbalance.askPressure,
                imbalanceRatio: imbalance.imbalanceRatio,
                spreadBps,
                confidence,
                weightedMidPrice: imbalance.weightedMidPrice
              },
              latest.ask, // Buy at ask
              latest.ask * (1 - this.params.stopLossPercent),
              latest.ask * (1 + this.params.takeProfitPercent),
              trendContext
            );
          }
        }
        // Strong ask pressure - likely price will move down
        else if (imbalance.imbalanceRatio < -this.params.minImbalanceRatio) {
          const confidence = this.calculateImbalanceConfidence(imbalance, spreadBps, marketData);
          
          if (confidence >= this.params.confidenceThreshold) {
            return this.generateSignal(
              'sell',
              symbol,
              Math.min(1, Math.abs(imbalance.imbalanceRatio) / 3),
              {
                type: 'orderbook_imbalance',
                bidPressure: imbalance.bidPressure,
                askPressure: imbalance.askPressure,
                imbalanceRatio: imbalance.imbalanceRatio,
                spreadBps,
                confidence,
                weightedMidPrice: imbalance.weightedMidPrice
              },
              latest.bid, // Sell at bid
              latest.bid * (1 + this.params.stopLossPercent),
              latest.bid * (1 - this.params.takeProfitPercent),
              trendContext
            );
          }
        }
      }
    }
    
    // Spread capture opportunity
    if (spreadBps > 10 && latest.bidSize > 0 && latest.askSize > 0) {
      const minSize = Math.min(latest.bidSize, latest.askSize);
      const potentialProfit = (spreadBps / 10000) - 0.001; // Minus fees
      
      if (potentialProfit > 0 && minSize * latest.bid > 1000) { // Minimum $1000 opportunity
        return this.generateSignal(
          'buy',
          symbol,
          0.5,
          {
            type: 'spread_capture',
            spreadBps,
            bidSize: latest.bidSize,
            askSize: latest.askSize,
            potentialProfit: potentialProfit * 100 // in percentage
          },
          latest.ask,
          latest.bid * 0.999, // Tight stop
          latest.bid * 1.001, // Quick profit target
          trendContext
        );
      }
    }
    
    return null;
  }
  
  private calculateOrderBookImbalance(marketData: MarketData): OrderBookImbalance | null {
    // Use full order book depth if available
    if (marketData.orderbook && marketData.orderbook.bids.length > 0 && marketData.orderbook.asks.length > 0) {
      const { bids, asks } = marketData.orderbook;
      const depthLevels = Math.min(this.params.depthLevels, bids.length, asks.length);
      
      let bidPressure = 0;
      let askPressure = 0;
      let weightedBidPrice = 0;
      let weightedAskPrice = 0;
      let totalBidVolume = 0;
      let totalAskVolume = 0;
      
      // Calculate pressure from multiple levels with exponential decay
      for (let i = 0; i < depthLevels; i++) {
        const weight = Math.exp(-i * 0.1); // Exponential decay for deeper levels
        const bidVolume = bids[i][1] * weight;
        const askVolume = asks[i][1] * weight;
        
        bidPressure += bidVolume * bids[i][0]; // volume * price
        askPressure += askVolume * asks[i][0];
        
        weightedBidPrice += bids[i][0] * bidVolume;
        weightedAskPrice += asks[i][0] * askVolume;
        totalBidVolume += bidVolume;
        totalAskVolume += askVolume;
      }
      
      // Calculate volume-weighted mid price
      const weightedMidPrice = (weightedBidPrice / totalBidVolume + weightedAskPrice / totalAskVolume) / 2;
      
      // Calculate imbalance ratio
      const imbalanceRatio = askPressure > 0 ? bidPressure / askPressure : 0;
      
      return {
        bidPressure,
        askPressure,
        imbalanceRatio: imbalanceRatio > 1 ? imbalanceRatio : -1 / imbalanceRatio,
        weightedMidPrice
      };
    }
    
    // Fallback to simple bid/ask if no orderbook
    if (!marketData.bidSize || !marketData.askSize) {
      return null;
    }
    
    const bidPressure = marketData.bidSize * marketData.bid;
    const askPressure = marketData.askSize * marketData.ask;
    const totalVolume = marketData.bidSize + marketData.askSize;
    const weightedMidPrice = (marketData.bid * marketData.askSize + marketData.ask * marketData.bidSize) / totalVolume;
    const imbalanceRatio = askPressure > 0 ? bidPressure / askPressure : 0;
    
    return {
      bidPressure,
      askPressure,
      imbalanceRatio: imbalanceRatio > 1 ? imbalanceRatio : -1 / imbalanceRatio,
      weightedMidPrice
    };
  }
  
  private calculateImbalanceConfidence(imbalance: OrderBookImbalance, spreadBps: number, marketData: MarketData[]): number {
    let confidence = 0.5;
    
    // Imbalance strength
    const imbalanceStrength = Math.min(Math.abs(imbalance.imbalanceRatio) / 5, 0.3);
    confidence += imbalanceStrength;
    
    // Spread quality (tighter spreads = more confidence)
    if (spreadBps < 10) {
      confidence += 0.2;
    } else if (spreadBps < 20) {
      confidence += 0.1;
    }
    
    // Recent price stability
    if (marketData.length >= 10) {
      const recentPrices = marketData.slice(-10).map(d => d.close);
      const priceStdDev = this.calculateStdDev(recentPrices);
      const priceStability = priceStdDev / recentPrices[recentPrices.length - 1];
      
      if (priceStability < 0.001) { // Less than 0.1% volatility
        confidence += 0.1;
      }
    }
    
    return Math.min(1, confidence);
  }
  
  private calculateStdDev(values: number[]): number {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }
  
  getRequiredHistory(): number {
    return 30; // Need some history for volatility calculation
  }
}
