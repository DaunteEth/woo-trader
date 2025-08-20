import { BaseStrategy } from './BaseStrategy';
import { Signal, MarketData, Position } from '../types/trading';
import { TrendContext } from '../indicators/TrendAnalyzer';
import { config } from '../utils/config';
import { WooXClient } from '../exchange/WooXClient';

interface FundingRate {
  symbol: string;
  rate: number;
  nextFundingTime: number;
  interval: number; // hours
}

export class FundingArbitrageStrategy extends BaseStrategy {
  private fundingRates: Map<string, FundingRate> = new Map();
  private lastFundingCheck: number = 0;
  private exchange: WooXClient | null = null;
  
  constructor() {
    super('FundingArbitrage', {
      minFundingRate: 0.0001, // 0.01% minimum funding rate to consider
      fundingThreshold: 0.0003, // 0.03% funding rate for strong signal
      hoursBeforeFunding: 1, // Enter position X hours before funding
      maxPositionHoldTime: 28800000, // 8 hours max hold time
      minProfitPercent: 0.0002, // 0.02% minimum profit after fees
      spotFeePercent: 0.001, // 0.1% spot trading fee
      perpFeePercent: 0.0005, // 0.05% perp trading fee
      enabled: true
    });
  }
  
  async analyze(marketData: MarketData[], positions: Position[], trendContext?: TrendContext): Promise<Signal | null> {
    if (!this.enabled || marketData.length === 0) {
      return null;
    }
    
    const latest = marketData[marketData.length - 1];
    const symbol = latest.symbol;
    
    // Update funding rates every 5 minutes
    if (Date.now() - this.lastFundingCheck > 300000) {
      await this.updateFundingRates();
      this.lastFundingCheck = Date.now();
    }
    
    const funding = this.fundingRates.get(symbol);
    if (!funding) {
      return null;
    }
    
    // Calculate time until next funding
    const timeUntilFunding = funding.nextFundingTime - Date.now();
    const hoursUntilFunding = timeUntilFunding / (1000 * 60 * 60);
    
    // Check if we should enter a position
    if (hoursUntilFunding > 0 && hoursUntilFunding <= this.params.hoursBeforeFunding) {
      const fundingRateAbs = Math.abs(funding.rate);
      
      // Only trade if funding rate is significant
      if (fundingRateAbs >= this.params.minFundingRate) {
        const totalFees = this.params.spotFeePercent + this.params.perpFeePercent;
        const expectedProfit = fundingRateAbs - totalFees;
        
        // Ensure profit after fees
        // In live mode, require explicit spot hedge enablement to avoid naked funding exposure
        const spotHedgeEnabled = process.env.SPOT_HEDGE_ENABLED === 'true';
        const isLive = config.trading.mode === 'live';
        if (isLive && !spotHedgeEnabled) {
          return null;
        }

        if (expectedProfit >= this.params.minProfitPercent) {
          const strength = Math.min(1, fundingRateAbs / this.params.fundingThreshold);
          
          // Positive funding: Shorts pay longs
          // Strategy: Short perp (receive funding) + Long spot (hedge)
          if (funding.rate > 0) {
            // NOTE: True funding arbitrage requires:
            // 1. Short perpetual (this signal)
            // 2. Simultaneously long spot (not implemented)
            // This would need a separate spot exchange client
            return this.generateSignal(
              'sell', // Short the perpetual
              symbol,
              strength,
              {
                type: 'funding_arbitrage',
                fundingRate: funding.rate,
                hoursUntilFunding,
                expectedProfit,
                direction: 'short_perp_long_spot',
                nextFundingTime: new Date(funding.nextFundingTime).toISOString(),
                note: 'Requires simultaneous spot long position for true arbitrage'
              },
              latest.bid,
              latest.close * 1.005, // 0.5% stop loss
              latest.close * 0.995, // Target is to hold until funding
              trendContext
            );
          }
          // Negative funding: Longs pay shorts
          // Strategy: Long perp (receive funding) + Short spot (hedge)
          else if (funding.rate < 0) {
            return this.generateSignal(
              'buy', // Long the perpetual
              symbol,
              strength,
              {
                type: 'funding_arbitrage',
                fundingRate: funding.rate,
                hoursUntilFunding,
                expectedProfit,
                direction: 'long_perp_short_spot',
                nextFundingTime: new Date(funding.nextFundingTime).toISOString()
              },
              latest.ask,
              latest.close * 0.995, // 0.5% stop loss
              latest.close * 1.005, // Target is to hold until funding
              trendContext
            );
          }
        }
      }
    }
    
    // Check if we should close existing positions after funding
    const openPosition = positions.find(p => p.symbol === symbol);
    if (openPosition) {
      const positionAge = Date.now() - openPosition.openTime.getTime();
      
      // Close position after funding time or max hold time
      if (Date.now() > funding.nextFundingTime || positionAge > this.params.maxPositionHoldTime) {
        return this.generateSignal(
          'close',
          symbol,
          0.9,
          {
            reason: 'funding_collected',
            fundingRate: funding.rate,
            holdTime: positionAge / 1000 / 60 // minutes
          },
          latest.close
        );
      }
    }
    
    return null;
  }
  
  setExchange(exchange: WooXClient): void {
    this.exchange = exchange;
  }
  
  private async updateFundingRates(): Promise<void> {
    try {
      if (!this.exchange) {
        this.logger.warn('Exchange client not set for funding arbitrage');
        return;
      }
      
      // Fetch real funding rates from exchange
      const fundingRatesMap = await this.exchange.fetchFundingRates();
      
      // Update our internal map
      fundingRatesMap.forEach((rateInfo, symbol) => {
        this.fundingRates.set(symbol, {
          symbol,
          rate: rateInfo.rate,
          nextFundingTime: rateInfo.nextFundingTime,
          interval: rateInfo.interval
        });
      });
      
      this.logger.info('Updated funding rates', {
        rates: Array.from(this.fundingRates.entries()).map(([symbol, rate]) => ({
          symbol,
          rate: rate.rate,
          nextFunding: new Date(rate.nextFundingTime).toISOString()
        }))
      });
    } catch (error) {
      this.logger.error('Failed to update funding rates', error);
    }
  }
  
  getRequiredHistory(): number {
    return 20; // Need minimal history for funding arbitrage
  }
}
