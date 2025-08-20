import { prisma } from '../lib/db';
import { createLogger } from './logger';

const logger = createLogger('StrategyLoader');

export interface StrategyDBConfig {
  name: string;
  enabled: boolean;
  weight: number;
  // Signal following configuration
  followOwnSignals?: boolean;
  followAISignals?: boolean;
  aiExecutionEnabled?: boolean;
  // Common parameters
  stopLossPercent?: number | null;
  takeProfitPercent?: number | null;
  // Scalping parameters
  emaPeriodFast?: number | null;
  emaPeriodSlow?: number | null;
  rsiPeriod?: number | null;
  rsiOverbought?: number | null;
  rsiOversold?: number | null;
  bbPeriod?: number | null;
  bbStdDev?: number | null;
  minSpread?: number | null;
  maxSpread?: number | null;
  // Momentum parameters
  vwapEnabled?: boolean | null;
  bbBreakoutStdDev?: number | null;
  momentumPeriod?: number | null;
  volumeMultiplier?: number | null;
  rsiMomentumThreshold?: number | null;
  trailingStopPercent?: number | null;
  // Arbitrage parameters
  minSpreadPercent?: number | null;
  maxSpreadPercent?: number | null;
  executionDelay?: number | null;
  feePercent?: number | null;
  minProfitPercent?: number | null;
  // FundingArbitrage parameters
  minFundingRate?: number | null;
  fundingThreshold?: number | null;
  hoursBeforeFunding?: number | null;
  maxPositionHoldTime?: number | null;
  spotFeePercent?: number | null;
  perpFeePercent?: number | null;
  // OrderBookArbitrage parameters
  minImbalance?: number | null;
  minVolumeRatio?: number | null;
  depthLevels?: number | null;
  minSpreadBps?: number | null;
  maxSpreadBps?: number | null;
  confidenceThreshold?: number | null;
}

export async function loadStrategyConfigs(simulationId?: string): Promise<StrategyDBConfig[]> {
  try {
    // If no simulationId provided, try to get the active simulation
    if (!simulationId) {
      const activeSimulation = await prisma.simulation.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: 'desc' }
      });
      
      if (!activeSimulation) {
        logger.warn('No active simulation found, using default configurations');
        return getDefaultConfigs();
      }
      
      simulationId = activeSimulation.id;
    }

    // Fetch strategy configurations from database
    const configs = await prisma.strategyConfig.findMany({
      where: { simulationId }
    });

    if (configs.length === 0) {
      logger.warn('No strategy configurations found, using defaults');
      return getDefaultConfigs();
    }

    // Convert database configs to the format expected by strategies
    return configs.map((config: StrategyDBConfig) => ({
      name: config.name,
      enabled: config.enabled,
      weight: config.weight,
      // Signal following configuration
      followOwnSignals: config.followOwnSignals ?? true,
      followAISignals: config.followAISignals ?? true,
      aiExecutionEnabled: config.aiExecutionEnabled ?? false,
      // Common parameters
      stopLossPercent: config.stopLossPercent,
      takeProfitPercent: config.takeProfitPercent,
      // Scalping parameters
      emaPeriodFast: config.emaPeriodFast,
      emaPeriodSlow: config.emaPeriodSlow,
      rsiPeriod: config.rsiPeriod,
      rsiOverbought: config.rsiOverbought,
      rsiOversold: config.rsiOversold,
      bbPeriod: config.bbPeriod,
      bbStdDev: config.bbStdDev,
      minSpread: config.minSpread,
      maxSpread: config.maxSpread,
      // Momentum parameters
      vwapEnabled: config.vwapEnabled,
      bbBreakoutStdDev: config.bbBreakoutStdDev,
      momentumPeriod: config.momentumPeriod,
      volumeMultiplier: config.volumeMultiplier,
      rsiMomentumThreshold: config.rsiMomentumThreshold,
      trailingStopPercent: config.trailingStopPercent,
      // Arbitrage parameters
      minSpreadPercent: config.minSpreadPercent,
      maxSpreadPercent: config.maxSpreadPercent,
      executionDelay: config.executionDelay,
      feePercent: config.feePercent,
      minProfitPercent: config.minProfitPercent,
      // FundingArbitrage parameters
      minFundingRate: config.minFundingRate,
      fundingThreshold: config.fundingThreshold,
      hoursBeforeFunding: config.hoursBeforeFunding,
      maxPositionHoldTime: config.maxPositionHoldTime,
      spotFeePercent: config.spotFeePercent,
      perpFeePercent: config.perpFeePercent,
      // OrderBookArbitrage parameters
      minImbalance: config.minImbalance,
      minVolumeRatio: config.minVolumeRatio,
      depthLevels: config.depthLevels,
      minSpreadBps: config.minSpreadBps,
      maxSpreadBps: config.maxSpreadBps,
      confidenceThreshold: config.confidenceThreshold,
    }));
  } catch (error) {
    logger.error('Failed to load strategy configurations', error);
    return getDefaultConfigs();
  }
}

function getDefaultConfigs(): StrategyDBConfig[] {
  return [
    {
      name: 'Scalping',
      enabled: true,
      weight: 0.4,
      // Signal following configuration
      followOwnSignals: true,
      followAISignals: true,
      aiExecutionEnabled: false,
      // Scalping parameters
      emaPeriodFast: 8, // Updated based on research
      emaPeriodSlow: 21, // Updated based on research
      rsiPeriod: 9, // Updated based on research
      rsiOverbought: 75, // Updated based on research
      rsiOversold: 25, // Updated based on research
      bbPeriod: 20,
      bbStdDev: 2.5, // Updated based on research
      minSpread: 0.0001,
      maxSpread: 0.001,
      stopLossPercent: 0.0015, // Updated based on research
      takeProfitPercent: 0.0025 // Updated based on research
    },
    {
      name: 'Momentum',
      enabled: true,
      weight: 0.3,
      // Signal following configuration
      followOwnSignals: true,
      followAISignals: true,
      aiExecutionEnabled: false,
      // Momentum parameters
      vwapEnabled: true,
      bbBreakoutStdDev: 2.0, // Updated based on research
      momentumPeriod: 14, // Updated based on research
      volumeMultiplier: 2.5, // Updated based on research
      rsiPeriod: 14,
      rsiMomentumThreshold: 60,
      stopLossPercent: 0.002, // Updated based on research
      takeProfitPercent: 0.003, // Updated based on research
      trailingStopPercent: 0.0015 // Updated based on research
    },
    {
      name: 'Arbitrage',
      enabled: true,
      weight: 0.3,
      // Signal following configuration
      followOwnSignals: true,
      followAISignals: true,
      aiExecutionEnabled: false,
      // Arbitrage parameters
      minSpreadPercent: 0.0005, // Updated based on research
      maxSpreadPercent: 0.001, // Updated based on research
      executionDelay: 20, // Updated based on research
      feePercent: 0.075,
      minProfitPercent: 0.0005, // Updated based on research
      stopLossPercent: 0.001, // Updated based on research
      takeProfitPercent: 0.0015 // Updated based on research
    },
    {
      name: 'FundingArbitrage',
      enabled: false,  // Disabled by default to avoid confusion
      weight: 0.0,
      // Signal following configuration
      followOwnSignals: true,
      followAISignals: true,
      aiExecutionEnabled: false,
      // FundingArbitrage parameters
      minFundingRate: 0.0001,
      fundingThreshold: 0.0003,
      hoursBeforeFunding: 1,
      maxPositionHoldTime: 28800000,
      minProfitPercent: 0.0002,
      spotFeePercent: 0.001,
      perpFeePercent: 0.0005,
      stopLossPercent: 0.005,
      takeProfitPercent: 0.01
    },
    {
      name: 'OrderBookArbitrage',
      enabled: false,  // Disabled by default to avoid confusion
      weight: 0.0,
      // Signal following configuration
      followOwnSignals: true,
      followAISignals: true,
      aiExecutionEnabled: false,
      // OrderBookArbitrage parameters
      minImbalance: 2.0,
      minVolumeRatio: 10000,
      depthLevels: 10,
      minSpreadBps: 5,
      maxSpreadBps: 50,
      confidenceThreshold: 0.7,
      stopLossPercent: 0.002,
      takeProfitPercent: 0.004
    }
  ];
}
