import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import type { Simulation, StrategyConfig as PrismaStrategyConfig } from '@prisma/client';

type StrategyRow = PrismaStrategyConfig & {
  // FundingArbitrage
  minFundingRate?: number | null;
  fundingThreshold?: number | null;
  hoursBeforeFunding?: number | null;
  maxPositionHoldTime?: number | null;
  spotFeePercent?: number | null;
  perpFeePercent?: number | null;
  // OrderBookArbitrage
  minImbalance?: number | null;
  minVolumeRatio?: number | null;
  depthLevels?: number | null;
  minSpreadBps?: number | null;
  maxSpreadBps?: number | null;
  confidenceThreshold?: number | null;
};
import { getUserFromToken } from '@/lib/auth';
import { getActiveSimulation } from '@/lib/simulation';

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('auth-token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await getUserFromToken(token);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get active simulation with strategy configs
    const activeSimulation = (await getActiveSimulation(user.id)) as unknown as (Simulation & { strategyConfigs: PrismaStrategyConfig[] });
    if (!activeSimulation || !activeSimulation.strategyConfigs) {
      return NextResponse.json([]);
    }

    // Return all strategy configs
    const strategies = activeSimulation.strategyConfigs.map((config: StrategyRow) => ({
      id: config.id,
      name: config.name,
      enabled: config.enabled,
      weight: config.weight,
      // Common parameters
      stopLossPercent: config.stopLossPercent,
      takeProfitPercent: config.takeProfitPercent,
      // Strategy-specific parameters
      ...(config.name === 'Scalping' && {
        emaPeriodFast: config.emaPeriodFast,
        emaPeriodSlow: config.emaPeriodSlow,
        rsiPeriod: config.rsiPeriod,
        rsiOverbought: config.rsiOverbought,
        rsiOversold: config.rsiOversold,
        bbPeriod: config.bbPeriod,
        bbStdDev: config.bbStdDev,
        minSpread: config.minSpread,
        maxSpread: config.maxSpread,
      }),
      ...(config.name === 'Momentum' && {
        vwapEnabled: config.vwapEnabled,
        bbBreakoutStdDev: config.bbBreakoutStdDev,
        momentumPeriod: config.momentumPeriod,
        volumeMultiplier: config.volumeMultiplier,
        rsiPeriod: config.rsiPeriod,
        rsiMomentumThreshold: config.rsiMomentumThreshold,
        trailingStopPercent: config.trailingStopPercent,
      }),
      ...(config.name === 'Arbitrage' && {
        minSpreadPercent: config.minSpreadPercent,
        maxSpreadPercent: config.maxSpreadPercent,
        executionDelay: config.executionDelay,
        feePercent: config.feePercent,
        minProfitPercent: config.minProfitPercent,
      }),
      ...(config.name === 'FundingArbitrage' && {
        minFundingRate: config.minFundingRate,
        fundingThreshold: config.fundingThreshold,
        hoursBeforeFunding: config.hoursBeforeFunding,
        maxPositionHoldTime: config.maxPositionHoldTime,
        spotFeePercent: config.spotFeePercent,
        perpFeePercent: config.perpFeePercent,
        stopLossPercent: config.stopLossPercent,
        takeProfitPercent: config.takeProfitPercent,
      }),
      ...(config.name === 'OrderBookArbitrage' && {
        minImbalance: config.minImbalance,
        minVolumeRatio: config.minVolumeRatio,
        depthLevels: config.depthLevels,
        minSpreadBps: config.minSpreadBps,
        maxSpreadBps: config.maxSpreadBps,
        confidenceThreshold: config.confidenceThreshold,
        stopLossPercent: config.stopLossPercent,
        takeProfitPercent: config.takeProfitPercent,
      }),
    }));

    return NextResponse.json(strategies);
  } catch (error) {
    console.error('Failed to fetch strategies:', error);
    return NextResponse.json(
      { error: 'Failed to fetch strategies' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get('auth-token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await getUserFromToken(token);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get active simulation
    const activeSimulation = await getActiveSimulation(user.id);
    if (!activeSimulation) {
      return NextResponse.json({ error: 'No active simulation' }, { status: 400 });
    }

    const strategies = await request.json();

    // Update all strategy configs
    for (const strategy of strategies) {
      const updateData: Record<string, unknown> = {
        enabled: strategy.enabled,
        weight: strategy.weight,
        stopLossPercent: strategy.stopLossPercent,
        takeProfitPercent: strategy.takeProfitPercent,
      };

      // Add strategy-specific parameters
      if (strategy.name === 'Scalping') {
        Object.assign(updateData, {
          emaPeriodFast: strategy.emaPeriodFast,
          emaPeriodSlow: strategy.emaPeriodSlow,
          rsiPeriod: strategy.rsiPeriod,
          rsiOverbought: strategy.rsiOverbought,
          rsiOversold: strategy.rsiOversold,
          bbPeriod: strategy.bbPeriod,
          bbStdDev: strategy.bbStdDev,
          minSpread: strategy.minSpread,
          maxSpread: strategy.maxSpread,
        });
      } else if (strategy.name === 'Momentum') {
        Object.assign(updateData, {
          vwapEnabled: strategy.vwapEnabled,
          bbBreakoutStdDev: strategy.bbBreakoutStdDev,
          momentumPeriod: strategy.momentumPeriod,
          volumeMultiplier: strategy.volumeMultiplier,
          rsiPeriod: strategy.rsiPeriod,
          rsiMomentumThreshold: strategy.rsiMomentumThreshold,
          trailingStopPercent: strategy.trailingStopPercent,
        });
      } else if (strategy.name === 'Arbitrage') {
        Object.assign(updateData, {
          minSpreadPercent: strategy.minSpreadPercent,
          maxSpreadPercent: strategy.maxSpreadPercent,
          executionDelay: strategy.executionDelay,
          feePercent: strategy.feePercent,
          minProfitPercent: strategy.minProfitPercent,
        });
      } else if (strategy.name === 'FundingArbitrage') {
        Object.assign(updateData, {
          minFundingRate: strategy.minFundingRate,
          fundingThreshold: strategy.fundingThreshold,
          hoursBeforeFunding: strategy.hoursBeforeFunding,
          maxPositionHoldTime: strategy.maxPositionHoldTime,
          spotFeePercent: strategy.spotFeePercent,
          perpFeePercent: strategy.perpFeePercent,
        });
      } else if (strategy.name === 'OrderBookArbitrage') {
        Object.assign(updateData, {
          minImbalance: strategy.minImbalance,
          minVolumeRatio: strategy.minVolumeRatio,
          depthLevels: strategy.depthLevels,
          minSpreadBps: strategy.minSpreadBps,
          maxSpreadBps: strategy.maxSpreadBps,
          confidenceThreshold: strategy.confidenceThreshold,
        });
      }

      // Update or create the strategy config
      await prisma.strategyConfig.upsert({
        where: {
          simulationId_name: {
            simulationId: activeSimulation.id,
            name: strategy.name
          }
        },
        update: updateData,
        create: {
          simulationId: activeSimulation.id,
          name: strategy.name,
          ...updateData
        }
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to save strategies:', error);
    return NextResponse.json(
      { error: 'Failed to save strategies' },
      { status: 500 }
    );
  }
}