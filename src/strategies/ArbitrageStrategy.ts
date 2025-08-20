import { BaseStrategy } from './BaseStrategy';
import { Signal, MarketData, Position } from '../types/trading';
import { TrendContext } from '../indicators/TrendAnalyzer';

// Interface for multi-exchange arbitrage (future enhancement)
// interface ArbitrageOpportunity {
//   buyExchange: string;
//   sellExchange: string;
//   spreadPercent: number;
//   buyPrice: number;
//   sellPrice: number;
// }

// NOTE: This is actually a Mean Reversion / Statistical Arbitrage strategy
// True arbitrage would require:
// 1. Cross-exchange arbitrage: Buy on exchange A, sell on exchange B simultaneously
// 2. Triangular arbitrage: BTC->ETH->USDT->BTC across multiple pairs
// 3. Funding arbitrage: Simultaneous spot + perpetual positions
// This strategy identifies price inefficiencies for directional trades
export class ArbitrageStrategy extends BaseStrategy {
  constructor() {
    super('Arbitrage', {
      minSpreadPercent: 0.1, // 0.1% minimum spread
      maxSpreadPercent: 2.0, // 2% maximum (might indicate stale data)
      executionDelay: 100, // ms estimate for execution
      feePercent: 0.075, // 0.075% taker fee
      minProfitPercent: 0.05 // 0.05% minimum profit after fees
    });
  }
  
  async analyze(marketData: MarketData[], _positions: Position[], trendContext?: TrendContext): Promise<Signal | null> {
    if (!this.enabled || marketData.length === 0) {
      return null;
    }
    
    // For single exchange, we look for temporal arbitrage (price inefficiencies)
    // In production, this would compare prices across multiple exchanges
    const latest = marketData[marketData.length - 1];
    const symbol = latest.symbol;
    
    // Check bid-ask spread arbitrage
    const spread = latest.ask - latest.bid;
    const spreadPercent = (spread / latest.bid) * 100;
    
    // Simple spread capture arbitrage
    if (spreadPercent > this.params.minSpreadPercent && 
        spreadPercent < this.params.maxSpreadPercent) {
      
      // Calculate profit after fees
      const buyFee = latest.bid * this.params.feePercent / 100;
      const sellFee = latest.ask * this.params.feePercent / 100;
      const netProfit = spread - buyFee - sellFee;
      const netProfitPercent = (netProfit / latest.bid) * 100;
      
      if (netProfitPercent > this.params.minProfitPercent) {
        // Generate arbitrage signal
        // const midPrice = (latest.bid + latest.ask) / 2;
        
        return this.generateSignal(
          'buy', // We'll buy at bid and sell at ask
          symbol,
          Math.min(1, netProfitPercent / 0.2), // Strength based on profit
          {
            type: 'spread_arbitrage',
            spreadPercent,
            netProfitPercent,
            bid: latest.bid,
            ask: latest.ask,
            bidSize: latest.bidSize,
            askSize: latest.askSize
          },
          latest.bid,
          latest.bid * 0.998, // 0.2% stop loss
          latest.bid * 1.004, // 0.4% take profit for 2:1 ratio
          trendContext
        );
      }
    }
    
    // Temporal arbitrage - detect price inefficiencies
    if (marketData.length >= 10) {
      const recentPrices = marketData.slice(-10).map(d => d.close);
      const avgPrice = recentPrices.reduce((a, b) => a + b, 0) / recentPrices.length;
      const priceDeviation = ((latest.close - avgPrice) / avgPrice) * 100;
      
      // If price deviates from recent average (lowered threshold for more signals)
      if (Math.abs(priceDeviation) > 0.05) { // 0.05% deviation (more sensitive)
        const isOversold = priceDeviation < -0.05;
        const isOverbought = priceDeviation > 0.05;
        
        if (isOversold && latest.bid > 0) {
          // Buy signal - price below recent average
          return this.generateSignal(
            'buy',
            symbol,
            0.7,
            {
              type: 'temporal_arbitrage',
              reason: 'oversold',
              priceDeviation,
              avgPrice,
              currentPrice: latest.close
            },
            latest.ask,
            latest.close * 0.997, // 0.3% stop loss
            latest.close * 1.009, // 0.9% take profit for 3:1 ratio
            trendContext
          );
        } else if (isOverbought && latest.ask > 0) {
          // Sell signal - price above recent average
          return this.generateSignal(
            'sell',
            symbol,
            0.7,
            {
              type: 'temporal_arbitrage',
              reason: 'overbought',
              priceDeviation,
              avgPrice,
              currentPrice: latest.close
            },
            latest.bid,
            latest.close * 1.01, // 1% stop loss (inverse for short)
            latest.close * 0.98, // 2% take profit (inverse for short)
            trendContext
          );
        }
      }
    }
    
    // Statistical arbitrage - detect price relationships
    if (marketData.length >= 30) {
      const prices = marketData.slice(-30).map(d => d.close);
      const volumes = marketData.slice(-30).map(d => d.volume);
      
      // Calculate price-volume correlation
      const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
      const highVolumeIndices = volumes
        .map((v, i) => ({ volume: v, index: i }))
        .filter(v => v.volume > avgVolume * 1.5)
        .map(v => v.index);
      
      if (highVolumeIndices.length >= 3) {
        // Check if high volume preceded price moves
        let bullishVolume = 0;
        let bearishVolume = 0;
        
        highVolumeIndices.forEach(idx => {
          if (idx < prices.length - 1) {
            const priceChange = prices[idx + 1] - prices[idx];
            if (priceChange > 0) bullishVolume++;
            else if (priceChange < 0) bearishVolume++;
          }
        });
        
        const volumeSignal = bullishVolume - bearishVolume;
        
        if (Math.abs(volumeSignal) >= 2) {
          const action = volumeSignal > 0 ? 'buy' : 'sell';
          const confidence = Math.min(1, Math.abs(volumeSignal) / 4);
          
          return this.generateSignal(
            action,
            symbol,
            confidence * 0.6,
            {
              type: 'volume_arbitrage',
              volumeSignal,
              bullishVolume,
              bearishVolume,
              currentVolume: latest.volume
            },
            action === 'buy' ? latest.ask : latest.bid,
            latest.close * (action === 'buy' ? 0.997 : 1.003), // 0.3% stop
            latest.close * (action === 'buy' ? 1.006 : 0.994), // 0.6% profit for 2:1
            trendContext
          );
        }
      }
    }
    
    return null;
  }
  
  getRequiredHistory(): number {
    return 30; // Need 30 candles for statistical arbitrage
  }
}
