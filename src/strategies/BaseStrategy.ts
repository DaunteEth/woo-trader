import { Signal, MarketData, Position } from '../types/trading';
import { createLogger } from '../utils/logger';
import { TrendContext } from '../indicators/TrendAnalyzer';

export abstract class BaseStrategy {
  protected name: string;
  protected logger: ReturnType<typeof createLogger>;
  protected enabled: boolean = true;
  protected weight: number = 1.0;
  protected params: Record<string, any>;
  
  constructor(name: string, params: Record<string, any> = {}, weight: number = 1.0) {
    this.name = name;
    this.params = params;
    this.weight = weight;
    this.logger = createLogger(`Strategy:${name}`);
  }
  
  // Method to update parameters from database
  updateParams(params: Record<string, any>): void {
    this.params = { ...this.params, ...params };
    this.logger.info('Strategy parameters updated', { params: this.params });
  }
  
  abstract analyze(
    marketData: MarketData[], 
    positions: Position[],
    trendContext?: TrendContext
  ): Promise<Signal | null>;
  
  abstract getRequiredHistory(): number;
  
  enable(): void {
    this.enabled = true;
    this.logger.info('Strategy enabled');
  }
  
  disable(): void {
    this.enabled = false;
    this.logger.info('Strategy disabled');
  }
  
  isEnabled(): boolean {
    return this.enabled;
  }
  
  setWeight(weight: number): void {
    this.weight = Math.max(0, Math.min(1, weight));
  }
  
  getWeight(): number {
    return this.weight;
  }
  
  getName(): string {
    return this.name;
  }
  
  protected generateSignal(
    action: 'buy' | 'sell' | 'hold' | 'close',
    symbol: string,
    strength: number,
    indicators: Record<string, any>,
    suggestedEntry?: number,
    suggestedStopLoss?: number,
    suggestedTakeProfit?: number,
    trendContext?: TrendContext
  ): Signal {
    return {
      id: `${this.name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      symbol,
      action,
      strength: Math.max(0, Math.min(1, strength)),
      strategy: this.name,
      indicators,
      confidence: this.calculateConfidence(strength, trendContext),
      suggestedEntry,
      suggestedStopLoss,
      suggestedTakeProfit
    };
  }
  
  protected calculateConfidence(strength: number, trendContext?: TrendContext): number {
    // Base confidence on strength, not weight
    // Weight is already used for position sizing
    let confidence = strength;
    
    // Boost confidence if trend context is favorable
    if (trendContext) {
      if (trendContext.tradingConditions === 'excellent') {
        confidence *= 1.3;
      } else if (trendContext.tradingConditions === 'good') {
        confidence *= 1.15;
      } else if (trendContext.tradingConditions === 'fair') {
        confidence *= 1.0;
      } else if (trendContext.tradingConditions === 'poor') {
        confidence *= 0.85; // Less harsh reduction
      }
      
      // Further boost for trend alignment
      if (trendContext.trendAlignment) {
        confidence *= 1.15;
      }
    }
    
    // Add some randomness for variation (±5%)
    const variation = 0.95 + Math.random() * 0.1;
    confidence *= variation;
    
    return Math.max(0.3, Math.min(1, confidence)); // Minimum 30% confidence, execution threshold handled elsewhere
  }
}
