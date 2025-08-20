import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { hashPassword, generateToken } from '@/lib/auth';
import { z } from 'zod';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, name } = registerSchema.parse(body);

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'User already exists' },
        { status: 400 }
      );
    }

    // Create user with default simulation
    const hashedPassword = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        simulations: {
          create: {
            name: 'Default Simulation',
            description: 'Your first trading simulation',
            balance: 10000,
            isActive: true,
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
                  weight: 0.1,
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
          }
        }
      },
      include: {
        simulations: true
      }
    });

    // Generate token
    const token = generateToken({ userId: user.id, email: user.email });

    // Create response with token cookie
    const response = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });

    response.cookies.set('auth-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    });

    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.issues },
        { status: 400 }
      );
    }
    
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: 'Failed to register' },
      { status: 500 }
    );
  }
}
