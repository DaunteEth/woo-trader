import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getUserFromToken } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromToken(request.cookies.get('auth-token')?.value || '');
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const simulations = await prisma.simulation.findMany({
      where: { userId: user.id },
      include: {
        strategyConfigs: true,
        performanceStats: true,
        _count: {
          select: {
            signals: true,
            trades: true,
            positions: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json({ simulations });
  } catch (error) {
    console.error('Failed to fetch simulations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch simulations' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromToken(request.cookies.get('auth-token')?.value || '');
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { name, description } = await request.json();

    if (!name) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      );
    }

    // Check if simulation with same name exists
    const existing = await prisma.simulation.findFirst({
      where: {
        userId: user.id,
        name
      }
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Simulation with this name already exists' },
        { status: 400 }
      );
    }

    // Create simulation with strategy config
    const simulation = await prisma.simulation.create({
      data: {
        userId: user.id,
        name,
        description,
        balance: 10000, // Starting balance
        isActive: false,
        strategyConfigs: {
          create: [
            {
              name: 'Scalping',
              enabled: true,
              weight: 0.6,
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
              weight: 0.0,
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
              minFundingRate: 0.01,
              fundingThreshold: 0.03,
              stopLossPercent: 0.003,
              takeProfitPercent: 0.006
            },
            {
              name: 'OrderBookArbitrage',
              enabled: false,
              weight: 0.0,
              minImbalance: 60,
              minVolumeRatio: 2.0,
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

    return NextResponse.json({ simulation });
  } catch (error) {
    console.error('Failed to create simulation:', error);
    return NextResponse.json(
      { error: 'Failed to create simulation' },
      { status: 500 }
    );
  }
}


