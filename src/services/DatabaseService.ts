import { prisma } from '../lib/db';
import { Signal, Position } from '../types/trading';
import { SignalOutput } from '../SignalGenerator';
import { createLogger } from '../utils/logger';

export class DatabaseService {
  private logger = createLogger('DatabaseService');
  private userId: string = 'system'; // Default system user
  private simulationId: string | null = null;
  
  getUserId(): string {
    return this.userId;
  }
  
  constructor() {
    // Use the shared prisma instance from ui-app
  }
  
  async initialize(): Promise<void> {
    try {
      await prisma.$connect();
      this.logger.info('Database connected');
      
      // Ensure system user exists
      const systemUser = await prisma.user.findUnique({
        where: { email: 'system@hftbot.local' }
      });
      
      if (!systemUser) {
        this.logger.warn('System user not found, using hardcoded ID');
        // Use the system user ID we created
        this.userId = 'system-hft-bot';
      } else {
        this.userId = systemUser.id;
      }
      
      // Clean up stale positions on startup
      await this.cleanupStalePositions();
    } catch (error) {
      this.logger.error('Failed to initialize database', error);
      throw error;
    }
  }
  
  async cleanupStalePositions(): Promise<void> {
    try {
      // Get user's simulations
      const userSimulations = await prisma.simulation.findMany({
        where: { userId: this.userId },
        select: { id: true }
      });
      
      const simulationIds = userSimulations.map(s => s.id);
      
      // Close any positions that are still open from previous sessions
      const stalePositions = await prisma.position.updateMany({
        where: {
          simulationId: { in: simulationIds },
          closeTime: null,
          openTime: {
            lt: new Date(Date.now() - 1 * 60 * 60 * 1000) // Older than 1 hour
          }
        },
        data: {
          closeTime: new Date(),
          closedPnL: 0
        }
      });
      
      if (stalePositions.count > 0) {
        this.logger.info('Cleaned up stale positions', { count: stalePositions.count });
      }
    } catch (error) {
      this.logger.error('Failed to cleanup stale positions', error);
    }
  }
  
  setUserId(userId: string): void {
    this.userId = userId;
  }
  
  setSimulationId(simulationId: string): void {
    this.simulationId = simulationId;
  }
  
  async saveSignal(signal: Signal): Promise<void> {
    if (!this.simulationId) {
      this.logger.error('No simulationId set, cannot save signal');
      return;
    }
    
    try {
      await prisma.signal.create({
        data: {
          id: signal.id, // Preserve signal ID for tracking
          simulationId: this.simulationId,
          timestamp: signal.timestamp,
          symbol: signal.symbol,
          action: signal.action,
          strategy: signal.strategy,
          strength: signal.strength,
          confidence: signal.confidence,
          indicators: JSON.stringify(signal.indicators),
          suggestedEntry: signal.suggestedEntry,
          suggestedSL: signal.suggestedStopLoss,
          suggestedTP: signal.suggestedTakeProfit,
          positionSize: signal.positionSize,
          executed: false
        }
      });
      this.logger.info('Signal saved successfully', { signalId: signal.id });
    } catch (error: any) {
      this.logger.error('Failed to save signal', { 
        error: error.message || error,
        code: error.code,
        signalId: signal.id 
      });
    }
  }
  
  async saveSignalOutput(output: SignalOutput): Promise<void> {
    try {
      // Save all signals
      for (const signal of output.signals) {
        await this.saveSignal(signal);
      }
      
      // Save active positions as Position type
      // Note: activePositions in SignalOutput is a different format, 
      // so we skip updating positions from SignalOutput
    } catch (error) {
      this.logger.error('Failed to save signal output', error);
    }
  }
  
  async markSignalExecuted(signalId: string): Promise<void> {
    try {
      await prisma.signal.update({
        where: { id: signalId },
        data: { executed: true }
      });
    } catch (error) {
      this.logger.error('Failed to mark signal as executed', error);
    }
  }
  
  async saveTrade(trade: {
    id?: string;
    signalId?: string;
    symbol: string;
    type: 'open' | 'close';
    side: 'buy' | 'sell';
    price: number;
    quantity: number;
    pnl?: number;
    reason?: string;
    status?: string;
  }): Promise<void> {
    if (!this.simulationId) {
      this.logger.error('No simulationId set, cannot save trade');
      return;
    }
    
    this.logger.info('Saving trade to database', { trade, simulationId: this.simulationId });
    try {
      const result = await prisma.trade.create({
        data: {
          // Don't pass id, let Prisma generate it
          simulationId: this.simulationId,
          signalId: trade.signalId,
          symbol: trade.symbol,
          type: trade.type,
          side: trade.side,
          price: trade.price,
          quantity: trade.quantity,
          pnl: trade.pnl,
          reason: trade.reason,
          status: trade.status || 'filled',
          timestamp: new Date()
        }
      });
      this.logger.info('Trade saved successfully', { tradeId: result?.id || 'unknown' });
      
      // Update simulation balance if this is a closing trade with P&L
      if (trade.type === 'close' && trade.pnl !== undefined && trade.pnl !== null) {
        await this.updateSimulationBalance(trade.pnl);
      }
    } catch (error: any) {
      this.logger.error('Failed to save trade', { 
        error: error.message || error,
        code: error.code,
        trade 
      });
    }
  }

  async linkCloseToSignal(closeTradeId: string, openSignalId?: string): Promise<void> {
    try {
      if (!openSignalId) return;
      await prisma.trade.update({
        where: { id: closeTradeId },
        data: { signalId: openSignalId }
      });
    } catch (error) {
      this.logger.warn('Failed to link close trade to signal', { closeTradeId, openSignalId, error });
    }
  }
  
  async updatePosition(position: Position): Promise<void> {
    if (!this.simulationId) {
      this.logger.error('No simulationId set, cannot update position');
      return;
    }
    
    this.logger.info('Updating position in database', { position, simulationId: this.simulationId });
    try {
      const existingPosition = await prisma.position.findUnique({
        where: { id: position.id }
      });
      
      if (existingPosition) {
        await prisma.position.update({
          where: { id: position.id },
          data: {
            side: position.side,
            entryPrice: position.entryPrice,
            quantity: position.quantity,
            stopLoss: position.stopLoss,
            takeProfit: position.takeProfit,
            currentPrice: position.currentPrice,
            unrealizedPnL: position.pnl
          }
        });
      } else {
        await prisma.position.create({
          data: {
            simulationId: this.simulationId,
            symbol: position.symbol,
            side: position.side,
            entryPrice: position.entryPrice,
            quantity: position.quantity,
            stopLoss: position.stopLoss,
            takeProfit: position.takeProfit,
            openTime: position.openTime || new Date(),
            currentPrice: position.currentPrice,
            unrealizedPnL: position.pnl
          }
        });
        this.logger.info('Position created successfully');
      }
    } catch (error: any) {
      this.logger.error('Failed to update position', {
        error: error.message || error,
        code: error.code,
        position
      });
    }
  }
  
  async closePosition(positionId: string, closedPnL: number): Promise<void> {
    try {
      await prisma.position.update({
        where: { id: positionId },
        data: {
          closeTime: new Date(),
          closedPnL
        }
      });
    } catch (error) {
      this.logger.error('Failed to close position', error);
    }
  }
  
  async getRecentSignals(limit: number = 100): Promise<any[]> {
    if (!this.simulationId) {
      this.logger.error('No simulationId set, cannot get signals');
      return [];
    }
    
    try {
      return await prisma.signal.findMany({
        where: { simulationId: this.simulationId },
        orderBy: { timestamp: 'desc' },
        take: limit
      });
    } catch (error) {
      this.logger.error('Failed to get recent signals', error);
      return [];
    }
  }
  
  async getRecentTrades(limit: number = 100): Promise<any[]> {
    if (!this.simulationId) {
      this.logger.error('No simulationId set, cannot get trades');
      return [];
    }
    
    try {
      return await prisma.trade.findMany({
        where: { simulationId: this.simulationId },
        orderBy: { timestamp: 'desc' },
        take: limit,
        include: { signal: true }
      });
    } catch (error) {
      this.logger.error('Failed to get recent trades', error);
      return [];
    }
  }
  
  async getOpenPositions(): Promise<any[]> {
    if (!this.simulationId) {
      this.logger.error('No simulationId set, cannot get positions');
      return [];
    }
    
    try {
      return await prisma.position.findMany({
        where: { 
          simulationId: this.simulationId,
          closeTime: null 
        }
      });
    } catch (error) {
      this.logger.error('Failed to get open positions', error);
      return [];
    }
  }
  
  async getPerformanceStats(): Promise<any> {
    if (!this.simulationId) {
      this.logger.error('No simulationId set, cannot get performance stats');
      return {
        totalTrades: 0,
        totalPnL: 0,
        winRate: 0,
        averageWin: 0,
        averageLoss: 0,
        profitFactor: 0
      };
    }
    
    try {
      const trades = await prisma.trade.findMany({
        where: { 
          simulationId: this.simulationId,
          type: 'close',
          pnl: { not: null }
        }
      });
      
      const totalPnL = trades.reduce((sum: number, trade: any) => sum + (trade.pnl || 0), 0);
      const winningTrades = trades.filter((t: any) => (t.pnl || 0) > 0);
      const losingTrades = trades.filter((t: any) => (t.pnl || 0) < 0);
      
      const stats = {
        totalTrades: trades.length,
        totalPnL,
        winRate: trades.length > 0 ? winningTrades.length / trades.length : 0,
        averageWin: winningTrades.length > 0 ? 
          winningTrades.reduce((sum: number, t: any) => sum + (t.pnl || 0), 0) / winningTrades.length : 0,
        averageLoss: losingTrades.length > 0 ?
          losingTrades.reduce((sum: number, t: any) => sum + (t.pnl || 0), 0) / losingTrades.length : 0,
        profitFactor: losingTrades.length > 0 && winningTrades.length > 0 ?
          Math.abs(winningTrades.reduce((sum: number, t: any) => sum + (t.pnl || 0), 0) / 
                  losingTrades.reduce((sum: number, t: any) => sum + (t.pnl || 0), 0)) : 0
      };
      
      // Update performance stats in database
      await prisma.performanceStats.update({
        where: { simulationId: this.simulationId },
        data: {
          totalTrades: stats.totalTrades,
          winningTrades: winningTrades.length,
          losingTrades: losingTrades.length,
          totalPnL: stats.totalPnL,
          winRate: stats.winRate,
          avgWin: stats.averageWin,
          avgLoss: stats.averageLoss,
          profitFactor: stats.profitFactor
        }
      });
      
      return stats;
    } catch (error) {
      this.logger.error('Failed to get performance stats', error);
      return {
        totalTrades: 0,
        totalPnL: 0,
        winRate: 0,
        averageWin: 0,
        averageLoss: 0,
        profitFactor: 0
      };
    }
  }
  
  async updateSimulationBalance(pnlAmount: number): Promise<void> {
    if (!this.simulationId) {
      this.logger.error('No simulationId set, cannot update balance');
      return;
    }
    
    try {
      // Update simulation balance
      await prisma.simulation.update({
        where: { id: this.simulationId },
        data: {
          balance: {
            increment: pnlAmount
          }
        }
      });
      this.logger.info('Simulation balance updated', { 
        simulationId: this.simulationId, 
        pnlAmount 
      });
    } catch (error) {
      this.logger.error('Failed to update simulation balance', error);
    }
  }
  
  async disconnect(): Promise<void> {
    await prisma.$disconnect();
  }
}
