import { Position, Signal, AccountInfo } from '../types/trading';
import { config } from '../utils/config';
import { createLogger } from '../utils/logger';

export class PositionManager {
  private positions: Map<string, Position> = new Map();
  private closedPositions: Position[] = [];
  private logger = createLogger('PositionManager');
  private totalBalance: number = 10000; // Default starting balance
  private initialBalance: number = 10000;
  
  constructor(initialBalance?: number) {
    if (initialBalance) {
      this.totalBalance = initialBalance;
      this.initialBalance = initialBalance;
    }
  }
  
  calculatePositionSize(
    signal: Signal, 
    currentPrice: number,
    accountInfo: AccountInfo
  ): number {
    const { risk } = config;
    const availableBalance = accountInfo.availableBalance;
    
    // Risk-based position sizing
    const riskAmount = availableBalance * risk.maxRiskPerTrade;
    
    // Calculate position size based on stop loss distance
    let positionSize = 0;
    
    if (signal.suggestedStopLoss) {
      const stopDistance = Math.abs(currentPrice - signal.suggestedStopLoss) / currentPrice;
      positionSize = riskAmount / stopDistance;
    } else {
      // Default position sizing if no stop loss
      positionSize = riskAmount / risk.stopLossPercent;
    }
    
    // Apply constraints
    positionSize = Math.max(config.trading.minOrderSize, positionSize);
    positionSize = Math.min(availableBalance * 0.9, positionSize); // Max 90% of available
    
    // Apply leverage
    positionSize = positionSize * config.trading.leverage;
    
    // Round to reasonable precision
    positionSize = Math.round(positionSize * 100) / 100;
    
    this.logger.info('Position size calculated', {
      signal: signal.id,
      size: positionSize,
      riskAmount,
      availableBalance
    });
    
    return positionSize;
  }
  
  updateBalance(newBalance: number): void {
    this.totalBalance = newBalance;
    this.logger.info('Balance updated', { 
      previousBalance: this.totalBalance, 
      newBalance 
    });
  }
  
  restorePosition(position: Position): void {
    this.positions.set(position.id, position);
    this.logger.info('Position restored from database', {
      id: position.id,
      symbol: position.symbol,
      side: position.side,
      pnl: position.pnl
    });
  }
  
  openPosition(
    orderId: string,
    symbol: string,
    side: 'long' | 'short',
    entryPrice: number,
    quantity: number,
    stopLoss?: number,
    takeProfit?: number
  ): Position {
    const position: Position = {
      id: orderId,
      symbol,
      side,
      entryPrice,
      currentPrice: entryPrice,
      quantity,
      value: quantity,
      pnl: 0,
      pnlPercent: 0,
      stopLoss: stopLoss || (
        side === 'long' 
          ? entryPrice * (1 - config.risk.stopLossPercent)
          : entryPrice * (1 + config.risk.stopLossPercent)
      ),
      takeProfit: takeProfit || (
        side === 'long'
          ? entryPrice * (1 + config.risk.takeProfitPercent)
          : entryPrice * (1 - config.risk.takeProfitPercent)
      ),
      openTime: new Date(),
      leverage: config.trading.leverage
    };
    
    this.positions.set(orderId, position);
    
    this.logger.info('Position opened', {
      position: orderId,
      symbol,
      side,
      entry: entryPrice,
      quantity
    });
    
    return position;
  }
  
  updatePosition(positionId: string, currentPrice: number): Position | null {
    const position = this.positions.get(positionId);
    if (!position) return null;
    
    position.currentPrice = currentPrice;
    
    // Calculate P&L
    if (position.side === 'long') {
      position.pnl = (currentPrice - position.entryPrice) * position.quantity;
    } else {
      position.pnl = (position.entryPrice - currentPrice) * position.quantity;
    }
    
    position.pnlPercent = (position.pnl / (position.entryPrice * position.quantity)) * 100;
    position.value = position.quantity * currentPrice;
    
    return position;
  }
  
  closePosition(positionId: string, exitPrice: number): Position | null {
    const position = this.positions.get(positionId);
    if (!position) return null;
    
    // Update final P&L
    this.updatePosition(positionId, exitPrice);
    
    // Move to closed positions
    this.closedPositions.push({ ...position });
    this.positions.delete(positionId);
    
    // Update balance
    this.totalBalance += position.pnl;
    
    this.logger.info('Position closed', {
      position: positionId,
      exitPrice,
      pnl: position.pnl,
      pnlPercent: position.pnlPercent
    });
    
    return position;
  }
  
  getOpenPositions(): Position[] {
    return Array.from(this.positions.values());
  }
  
  getPosition(positionId: string): Position | undefined {
    return this.positions.get(positionId);
  }
  
  getPositionBySymbol(symbol: string): Position | undefined {
    return Array.from(this.positions.values()).find(p => p.symbol === symbol);
  }
  
  hasPositionOnSymbol(symbol: string): boolean {
    return Array.from(this.positions.values()).some(p => p.symbol === symbol);
  }
  
  getPositionsCount(): number {
    return this.positions.size;
  }
  
  getTotalExposure(): number {
    return Array.from(this.positions.values())
      .reduce((total, pos) => total + pos.value, 0);
  }
  
  getAccountInfo(): AccountInfo {
    const openPositions = this.getOpenPositions();
    const unrealizedPnL = openPositions.reduce((total, pos) => total + pos.pnl, 0);
    
    // Calculate capital locked in positions
    // For futures with leverage, we need margin for each position
    const totalExposure = this.getTotalExposure();
    const marginUsed = totalExposure / config.trading.leverage;
    
    // Available balance = total balance - margin used for positions
    // This ensures we don't overallocate capital
    const availableBalance = this.totalBalance - marginUsed;
    
    // Log capital context for debugging
    this.logger.debug('Capital context', {
      totalBalance: this.totalBalance,
      marginUsed,
      availableBalance,
      unrealizedPnL,
      positionCount: openPositions.length,
      totalExposure
    });
    
    return {
      totalBalance: this.totalBalance + unrealizedPnL,
      availableBalance: Math.max(0, availableBalance), // Never negative
      marginBalance: marginUsed,
      unrealizedPnL,
      realizedPnL: this.totalBalance - this.initialBalance,
      positions: openPositions,
      openOrders: [] // Will be populated by OrderManager
    };
  }
  
  canOpenNewPosition(): boolean {
    return this.positions.size < config.trading.maxPositions;
  }
  
  updateStopLoss(positionId: string, newStopLoss: number): boolean {
    const position = this.positions.get(positionId);
    if (!position) return false;
    
    // Validate stop loss
    if (position.side === 'long' && newStopLoss >= position.currentPrice) {
      return false;
    }
    if (position.side === 'short' && newStopLoss <= position.currentPrice) {
      return false;
    }
    
    position.stopLoss = newStopLoss;
    this.logger.info('Stop loss updated', { position: positionId, newStopLoss });
    return true;
  }
  
  getPerformanceMetrics() {
    const totalTrades = this.closedPositions.length;
    const winningTrades = this.closedPositions.filter(p => p.pnl > 0);
    const losingTrades = this.closedPositions.filter(p => p.pnl < 0);
    
    const winRate = totalTrades > 0 ? winningTrades.length / totalTrades : 0;
    const avgWin = winningTrades.length > 0 
      ? winningTrades.reduce((sum, p) => sum + p.pnl, 0) / winningTrades.length 
      : 0;
    const avgLoss = losingTrades.length > 0
      ? Math.abs(losingTrades.reduce((sum, p) => sum + p.pnl, 0) / losingTrades.length)
      : 0;
    
    const profitFactor = avgLoss > 0 ? avgWin / avgLoss : 0;
    
    return {
      totalTrades,
      winRate,
      avgWin,
      avgLoss,
      profitFactor,
      totalPnL: this.totalBalance - this.initialBalance,
      totalReturn: ((this.totalBalance - this.initialBalance) / this.initialBalance) * 100
    };
  }

  // Alias for getPerformanceMetrics for backward compatibility
  getStats() {
    const metrics = this.getPerformanceMetrics();
    return {
      totalTrades: metrics.totalTrades,
      winRate: metrics.winRate,
      totalPnl: metrics.totalPnL
    };
  }
}
