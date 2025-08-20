import { prisma } from './db';

export async function getActiveSimulation(userId: string) {
  // First check if user has an active simulation set
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      activeSimulation: {
        include: {
          strategyConfigs: true,
          performanceStats: true
        }
      }
    }
  });

  if (user?.activeSimulation) {
    return user.activeSimulation;
  }

  // If no active simulation, find the first one or create a default
  const existingSimulation = await prisma.simulation.findFirst({
    where: { userId: userId },
    include: {
      strategyConfigs: true,
      performanceStats: true
    },
    orderBy: { createdAt: 'asc' }
  });

  if (existingSimulation) {
    // Activate it
    await prisma.simulation.update({
      where: { id: existingSimulation.id },
      data: { isActive: true }
    });

    await prisma.user.update({
      where: { id: userId },
      data: { activeSimulationId: existingSimulation.id }
    });

    return existingSimulation;
  }

  // Create a default simulation if none exists
  const newSimulation = await prisma.simulation.create({
    data: {
      userId,
      name: 'Default Simulation',
      description: 'Auto-generated default simulation',
      balance: 10000,
      isActive: true,
      strategyConfigs: {
        create: [
          {
            name: 'Scalping',
            enabled: true,
            weight: 0.6,
            // Scalping parameters
            emaPeriodFast: 9,
            emaPeriodSlow: 21,
            rsiPeriod: 7,
            rsiOverbought: 70,
            rsiOversold: 30,
            bbPeriod: 20,
            bbStdDev: 2,
            minSpread: 0.0001,
            maxSpread: 0.001,
            stopLossPercent: 0.003,
            takeProfitPercent: 0.006
          },
          {
            name: 'Momentum',
            enabled: true,
            weight: 0.3,
            // Momentum parameters
            vwapEnabled: true,
            bbBreakoutStdDev: 2,
            momentumPeriod: 10,
            volumeMultiplier: 1.5,
            rsiPeriod: 14,
            rsiMomentumThreshold: 60,
            stopLossPercent: 0.004,
            takeProfitPercent: 0.008,
            trailingStopPercent: 0.003
          },
          {
            name: 'Arbitrage',
            enabled: false,
            weight: 0.1,
            // Arbitrage parameters
            minSpreadPercent: 0.1,
            maxSpreadPercent: 2.0,
            executionDelay: 100,
            feePercent: 0.075,
            minProfitPercent: 0.05,
            stopLossPercent: 0.002,
            takeProfitPercent: 0.004
          },
          {
            name: 'FundingArbitrage',
            enabled: false,
            weight: 0.0,
            // Funding arbitrage parameters
            minFundingRate: 0.0001,
            fundingThreshold: 0.0003,
            hoursBeforeFunding: 2,
            maxPositionHoldTime: 10,
            spotFeePercent: 0.001,
            perpFeePercent: 0.0005,
            stopLossPercent: 0.003,
            takeProfitPercent: 0.006
          },
          {
            name: 'OrderBookArbitrage',
            enabled: false,
            weight: 0.0,
            // Order book arbitrage parameters
            minImbalance: 2.0,
            minVolumeRatio: 1.5,
            depthLevels: 15,
            minSpreadBps: 2,
            maxSpreadBps: 10,
            confidenceThreshold: 0.6,
            stopLossPercent: 0.002,
            takeProfitPercent: 0.004
          }
        ]
      },
      performanceStats: {
        create: {
          totalTrades: 0,
          winningTrades: 0,
          losingTrades: 0,
          totalPnL: 0,
          winRate: 0,
          avgWin: 0,
          avgLoss: 0
        }
      }
    },
    include: {
      strategyConfigs: true,
      performanceStats: true
    }
  });

  await prisma.user.update({
    where: { id: userId },
    data: { activeSimulationId: newSimulation.id }
  });

  return newSimulation;
}
