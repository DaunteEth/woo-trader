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
    const signals = await prisma.signal.findMany({
      where: { simulationId: activeSimulation.id },
      orderBy: { timestamp: 'desc' },
      take: limit,
      include: {
        trades: {
          select: {
            id: true,
            type: true,
            price: true,
            quantity: true,
            pnl: true,
            timestamp: true
          }
        }
      }
    });
    
    // Enhance signals with execution data
    const enhancedSignals = signals.map(signal => {
      const executedTrade = signal.trades.find(t => t.type === 'open');
      const closedTrade = signal.trades.find(t => t.type === 'close');
      const executionTime = executedTrade ? 
        new Date(executedTrade.timestamp).getTime() - new Date(signal.timestamp).getTime() : null;
      
      // Parse indicators to check for AI enhancement
      let indicators = {};
      try {
        indicators = typeof signal.indicators === 'string' 
          ? JSON.parse(signal.indicators) 
          : signal.indicators;
      } catch {
        // Handle parse error
      }
      
      return {
        ...signal,
        executed: !!executedTrade,
        executionTime,
        actualPnL: closedTrade?.pnl || null,
        aiEnhanced: (indicators as Record<string, unknown>).aiEnhanced || false,
        aiReasoning: (indicators as Record<string, unknown>).aiReasoning || null
      };
    });
    
    return NextResponse.json({ signals: enhancedSignals });
  } catch (error) {
    console.error('Error fetching signals:', error);
    return NextResponse.json(
      { error: 'Failed to fetch signals' },
      { status: 500 }
    );
  }
}
