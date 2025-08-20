import { Position } from '../types/trading';
import { createLogger } from '../utils/logger';

interface PositionMetrics {
  averageWinSize: number;
  averageLossSize: number;
  consecutiveWins: number;
  consecutiveLosses: number;
  maxDrawdownFromPeak: number;
  timeInProfit: number;
  timeInLoss: number;
}

export class AdvancedPositionManager {
  private logger = createLogger('AdvancedPositionManager');
  private positionMetrics: Map<string, PositionMetrics> = new Map();
  
  constructor(positionManager: any) {
    // Initialize with current balance
    const initialBalance = positionManager.getAccountInfo().totalBalance;
    this.logger.info('AdvancedPositionManager initialized', { initialBalance });
  }
  
  /**
   * Optimize position management based on current market conditions and performance
   */
  optimizePosition(position: Position, marketData: any, trendContext?: any): {
    action: 'hold' | 'close' | 'adjust';
    reason: string;
    adjustments?: {
      newStopLoss?: number;
      newTakeProfit?: number;
    };
  } {
    const currentPrice = marketData[marketData.length - 1].close;
    const positionAge = (Date.now() - position.openTime.getTime()) / 1000 / 60; // minutes
    
    // 1. Trailing Stop Loss for profitable positions
    if (position.pnlPercent > 0.5) { // Position is in profit
      const trailingStopPercent = 0.3; // Trail by 0.3%
      const newStopLoss = position.side === 'long' 
        ? currentPrice * (1 - trailingStopPercent / 100)
        : currentPrice * (1 + trailingStopPercent / 100);
      
      // Only adjust if new stop loss is better than current
      const shouldAdjust = position.side === 'long' 
        ? newStopLoss > position.stopLoss
        : newStopLoss < position.stopLoss;
      
      if (shouldAdjust) {
        this.logger.info('Adjusting trailing stop loss', {
          position: position.id,
          oldStopLoss: position.stopLoss,
          newStopLoss,
          pnlPercent: position.pnlPercent
        });
        
        return {
          action: 'adjust',
          reason: 'Trailing stop loss',
          adjustments: { newStopLoss }
        };
      }
    }
    
    // 2. Early profit taking in poor market conditions
    if (trendContext && trendContext.tradingConditions === 'poor' && position.pnlPercent > 0.3) {
      return {
        action: 'close',
        reason: 'Early profit taking - poor market conditions'
      };
    }
    
    // 3. Scale out partially when hitting certain profit levels
    if (position.pnlPercent > 1.0 && positionAge > 5) { // 1% profit after 5 minutes
      // In real implementation, you'd partially close here
      this.logger.info('Consider partial close', {
        position: position.id,
        pnlPercent: position.pnlPercent,
        age: positionAge
      });
    }
    
    // 4. Time-based stop loss tightening
    if (positionAge > 30 && Math.abs(position.pnlPercent) < 0.2) {
      // Position has been open for 30 minutes with minimal movement
      const tighterStopPercent = 0.2; // Tighten to 0.2%
      const newStopLoss = position.side === 'long'
        ? position.entryPrice * (1 - tighterStopPercent / 100)
        : position.entryPrice * (1 + tighterStopPercent / 100);
      
      return {
        action: 'adjust',
        reason: 'Time-based stop tightening',
        adjustments: { newStopLoss }
      };
    }
    
    // 5. Volatility-based adjustments
    const volatility = this.calculateVolatility(marketData);
    if (volatility > 0.005) { // High volatility (>0.5%)
      // Widen stops in high volatility
      const volAdjustedStopPercent = 0.5; // 0.5% for high volatility
      const newStopLoss = position.side === 'long'
        ? position.entryPrice * (1 - volAdjustedStopPercent / 100)
        : position.entryPrice * (1 + volAdjustedStopPercent / 100);
      
      // Only widen if current stop is tighter
      const shouldWiden = position.side === 'long'
        ? newStopLoss < position.stopLoss
        : newStopLoss > position.stopLoss;
      
      if (shouldWiden && position.pnlPercent > -0.1) { // Don't widen if already losing
        return {
          action: 'adjust',
          reason: 'Volatility-based stop adjustment',
          adjustments: { newStopLoss }
        };
      }
    }
    
    // 6. Breakeven stop when position reaches certain profit
    if (position.pnlPercent > 0.3 && !this.isBreakevenStop(position)) {
      const breakevenPrice = position.entryPrice * (position.side === 'long' ? 1.0001 : 0.9999); // Small buffer
      
      return {
        action: 'adjust',
        reason: 'Breakeven stop',
        adjustments: { newStopLoss: breakevenPrice }
      };
    }
    
    // 7. Momentum-based exit
    const momentum = this.calculateMomentum(marketData);
    if (position.side === 'long' && momentum < -0.5 && position.pnlPercent > 0) {
      return {
        action: 'close',
        reason: 'Negative momentum - protect profits'
      };
    } else if (position.side === 'short' && momentum > 0.5 && position.pnlPercent > 0) {
      return {
        action: 'close',
        reason: 'Positive momentum - protect profits'
      };
    }
    
    return { action: 'hold', reason: 'No adjustments needed' };
  }
  
  private calculateVolatility(marketData: any[]): number {
    if (marketData.length < 20) return 0.002; // Default
    
    const returns = [];
    for (let i = 1; i < Math.min(20, marketData.length); i++) {
      returns.push((marketData[i].close - marketData[i-1].close) / marketData[i-1].close);
    }
    
    const avg = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avg, 2), 0) / returns.length;
    
    return Math.sqrt(variance);
  }
  
  private calculateMomentum(marketData: any[]): number {
    if (marketData.length < 10) return 0;
    
    const recent = marketData.slice(-10);
    const older = marketData.slice(-20, -10);
    
    const recentAvg = recent.reduce((sum, d) => sum + d.close, 0) / recent.length;
    const olderAvg = older.reduce((sum, d) => sum + d.close, 0) / older.length;
    
    return (recentAvg - olderAvg) / olderAvg;
  }
  
  private isBreakevenStop(position: Position): boolean {
    return Math.abs(position.stopLoss - position.entryPrice) < position.entryPrice * 0.0001;
  }
  
  /**
   * Update position metrics for learning and optimization
   */
  updateMetrics(position: Position, closed: boolean = false): void {
    const symbol = position.symbol;
    let metrics = this.positionMetrics.get(symbol) || {
      averageWinSize: 0,
      averageLossSize: 0,
      consecutiveWins: 0,
      consecutiveLosses: 0,
      maxDrawdownFromPeak: 0,
      timeInProfit: 0,
      timeInLoss: 0
    };
    
    if (closed) {
      if (position.pnl > 0) {
        metrics.averageWinSize = (metrics.averageWinSize + position.pnlPercent) / 2;
        metrics.consecutiveWins++;
        metrics.consecutiveLosses = 0;
      } else {
        metrics.averageLossSize = (metrics.averageLossSize + Math.abs(position.pnlPercent)) / 2;
        metrics.consecutiveLosses++;
        metrics.consecutiveWins = 0;
      }
    }
    
    this.positionMetrics.set(symbol, metrics);
  }
  
  /**
   * Get position sizing recommendation based on recent performance
   */
  getOptimalPositionSize(symbol: string, baseSize: number): number {
    const metrics = this.positionMetrics.get(symbol);
    if (!metrics) return baseSize;
    
    let sizeMultiplier = 1.0;
    
    // Reduce size after consecutive losses
    if (metrics.consecutiveLosses >= 3) {
      sizeMultiplier *= 0.5;
    } else if (metrics.consecutiveLosses >= 2) {
      sizeMultiplier *= 0.75;
    }
    
    // Increase size slightly after consecutive wins (but cap it)
    if (metrics.consecutiveWins >= 3) {
      sizeMultiplier *= 1.2;
    } else if (metrics.consecutiveWins >= 2) {
      sizeMultiplier *= 1.1;
    }
    
    // Cap multiplier
    sizeMultiplier = Math.min(1.5, Math.max(0.5, sizeMultiplier));
    
    return baseSize * sizeMultiplier;
  }
}
