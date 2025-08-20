import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getUserFromToken } from '@/lib/auth';
import { getActiveSimulation } from '@/lib/simulation';

export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromToken(request.cookies.get('auth-token')?.value || '');
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Get active simulation
    const activeSimulation = await getActiveSimulation(user.id);
    if (!activeSimulation) {
      return NextResponse.json({ error: 'No active simulation' }, { status: 400 });
    }
    
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '100');
    const trades = await prisma.trade.findMany({
      where: { simulationId: activeSimulation.id },
      orderBy: { timestamp: 'desc' },
      take: limit,
      include: {
        signal: {
          select: {
            id: true,
            strategy: true,
            confidence: true
          }
        }
      }
    });
    
    // Calculate cumulative PnL
    let cumulativePnL = 0;
    const tradesWithCumulative = trades.map(trade => {
      if (trade.pnl) {
        cumulativePnL += trade.pnl;
      }
      return {
        ...trade,
        cumulativePnL
      };
    });
    
    return NextResponse.json({ trades: tradesWithCumulative });
  } catch (error) {
    console.error('Error fetching trades:', error);
    return NextResponse.json(
      { error: 'Failed to fetch trades' },
      { status: 500 }
    );
  }
}
