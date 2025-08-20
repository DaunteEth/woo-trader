import { Position, Signal, RiskMetrics, AccountInfo } from '../types/trading';
import { config } from '../utils/config';
import { createLogger } from '../utils/logger';

export class RiskManager {
  private logger = createLogger('RiskManager');
  private dailyStartBalance: number = 0;
  private dailyPnL: number = 0;
  private maxDrawdown: number = 0;
  private peakBalance: number = 0;
  private tradingHalted: boolean = false;
  private lastResetDate: Date = new Date();
  
  constructor(initialBalance: number) {
    this.dailyStartBalance = initialBalance;
    this.peakBalance = initialBalance;
  }
  
  validateSignal(
    signal: Signal, 
    accountInfo: AccountInfo
  ): { valid: boolean; reason?: string } {
    // Check if trading is halted
    if (this.tradingHalted) {
      return { valid: false, reason: 'Trading halted due to risk limits' };
    }
    
    // Check daily loss limit
    const currentBalance = accountInfo.totalBalance;
    this.dailyPnL = currentBalance - this.dailyStartBalance;
    const dailyLossPercent = -this.dailyPnL / this.dailyStartBalance;
    
    if (dailyLossPercent >= config.risk.maxDailyLoss) {
      this.tradingHalted = true;
      this.logger.error('Daily loss limit reached', {
        dailyLoss: dailyLossPercent * 100,
        limit: config.risk.maxDailyLoss * 100
      });
      return { valid: false, reason: 'Daily loss limit reached' };
    }
    
    // Check max drawdown
    if (currentBalance > this.peakBalance) {
      this.peakBalance = currentBalance;
    }
    
    const drawdown = (this.peakBalance - currentBalance) / this.peakBalance;
    if (drawdown >= config.risk.maxDrawdown) {
      this.tradingHalted = true;
      this.logger.error('Max drawdown reached', {
        drawdown: drawdown * 100,
        limit: config.risk.maxDrawdown * 100
      });
      return { valid: false, reason: 'Maximum drawdown reached' };
    }
    
    // Check position limits only for NEW positions
    if ((signal.action === 'buy' || signal.action === 'sell') && !signal.hasPosition) {
      const openPositions = accountInfo.positions.length;
      if (openPositions >= config.trading.maxPositions) {
        return { valid: false, reason: 'Maximum positions limit reached' };
      }
    }
    
    // For signals on existing positions, validate based on position management rules
    if (signal.hasPosition) {
      // Allow close signals for existing positions
      if (signal.action === 'close') {
        return { valid: true };
      }
      
      // For other actions on existing positions, check if it makes sense
      const isSameDirection = 
        (signal.action === 'buy' && signal.positionSide === 'long') ||
        (signal.action === 'sell' && signal.positionSide === 'short');
      
      // Allow signals in opposite direction (potential reversal) or close signals
      if (!isSameDirection) {
        this.logger.info('Signal suggests position reversal', {
          symbol: signal.symbol,
          currentSide: signal.positionSide,
          signalAction: signal.action
        });
        return { valid: true }; // Let position management handle the reversal
      }
    }
    
    // Check risk/reward ratio
    if (signal.suggestedStopLoss && signal.suggestedTakeProfit && signal.suggestedEntry) {
      const risk = Math.abs(signal.suggestedEntry - signal.suggestedStopLoss);
      const reward = Math.abs(signal.suggestedTakeProfit - signal.suggestedEntry);
      const rrRatio = reward / risk;
      
      if (rrRatio < config.risk.riskRewardRatio) {
        return { 
          valid: false, 
          reason: `Risk/reward ratio ${rrRatio.toFixed(2)} below minimum ${config.risk.riskRewardRatio}` 
        };
      }
    }
    
    // Check available balance
    const marginRequired = this.estimateMarginRequired(signal, accountInfo);
    if (marginRequired > accountInfo.availableBalance) {
      return { valid: false, reason: 'Insufficient available balance' };
    }
    
    return { valid: true };
  }
  
  checkPositionRisk(position: Position): { 
    shouldClose: boolean; 
    reason?: string 
  } {
    // Check stop loss
    if (position.side === 'long' && position.currentPrice <= position.stopLoss) {
      return { shouldClose: true, reason: 'Stop loss hit' };
    }
    if (position.side === 'short' && position.currentPrice >= position.stopLoss) {
      return { shouldClose: true, reason: 'Stop loss hit' };
    }
    
    // Check take profit
    if (position.side === 'long' && position.currentPrice >= position.takeProfit) {
      return { shouldClose: true, reason: 'Take profit hit' };
    }
    if (position.side === 'short' && position.currentPrice <= position.takeProfit) {
      return { shouldClose: true, reason: 'Take profit hit' };
    }
    
    // Check position time (optional: close positions open too long)
    const positionAge = (Date.now() - position.openTime.getTime()) / 1000 / 60; // minutes
    if (positionAge > 60 && Math.abs(position.pnlPercent) < 0.1) {
      // Close flat positions after 1 hour
      return { shouldClose: true, reason: 'Position timeout' };
    }
    
    return { shouldClose: false };
  }
  
  private estimateMarginRequired(signal: Signal, accountInfo: AccountInfo): number {
    // Position sizing based on risk-to-stop and leverage-aware margin
    const availableBalance = Math.max(0, accountInfo.availableBalance);
    const riskAmount = availableBalance * config.risk.maxRiskPerTrade;

    // Determine stop distance percent
    const entry = signal.suggestedEntry;
    const stop = signal.suggestedStopLoss;
    const fallbackStopPct = Math.max(0.0005, config.risk.stopLossPercent);
    const stopDistancePct = entry && stop
      ? Math.max(0.0001, Math.abs(entry - stop) / entry)
      : fallbackStopPct;

    // Desired position notional to risk at most riskAmount
    const desiredNotional = stopDistancePct > 0 ? (riskAmount / stopDistancePct) : 0;

    // Required margin accounting for leverage
    const marginRequired = desiredNotional / Math.max(1, config.trading.leverage);
    return marginRequired;
  }
  
  getRiskMetrics(accountInfo: AccountInfo): RiskMetrics {
    const currentDrawdown = this.peakBalance > 0 
      ? (this.peakBalance - accountInfo.totalBalance) / this.peakBalance 
      : 0;
    
    // Calculate current risk exposure
    const totalExposure = accountInfo.positions.reduce((sum, pos) => sum + pos.value, 0);
    const currentRiskExposure = totalExposure / accountInfo.totalBalance;
    
    // Simple Sharpe ratio calculation (would need more history for accurate calculation)
    const returns = this.dailyPnL / this.dailyStartBalance;
    const sharpeRatio = returns > 0 ? returns / 0.02 : 0; // Assuming 2% daily volatility
    
    return {
      currentDrawdown,
      maxDrawdown: this.maxDrawdown,
      sharpeRatio,
      winRate: 0, // Will be calculated from position manager
      avgWin: 0,
      avgLoss: 0,
      profitFactor: 0,
      currentRiskExposure,
      maxRiskExposure: config.trading.maxPositions * config.risk.maxRiskPerTrade
    };
  }
  
  resetDaily(): void {
    const now = new Date();
    if (now.getDate() !== this.lastResetDate.getDate()) {
      this.dailyStartBalance = this.peakBalance; // Use peak balance as new start
      this.dailyPnL = 0;
      this.tradingHalted = false;
      this.lastResetDate = now;
      
      this.logger.info('Daily risk limits reset');
    }
  }
  
  updateMaxDrawdown(currentBalance: number): void {
    if (currentBalance > this.peakBalance) {
      this.peakBalance = currentBalance;
    }
    
    const drawdown = (this.peakBalance - currentBalance) / this.peakBalance;
    if (drawdown > this.maxDrawdown) {
      this.maxDrawdown = drawdown;
    }
  }
  
  emergencyStop(): void {
    this.tradingHalted = true;
    this.logger.error('Emergency stop activated');
  }
  
  resume(): void {
    this.tradingHalted = false;
    this.logger.info('Trading resumed');
  }
  
  isTradingHalted(): boolean {
    return this.tradingHalted;
  }
}
