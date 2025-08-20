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
    
    const type = request.nextUrl.searchParams.get('type') || 'open';
    
    const where = type === 'open' 
      ? { simulationId: activeSimulation.id, closeTime: null }
      : { simulationId: activeSimulation.id, closeTime: { not: null } };
    
    const positions = await prisma.position.findMany({
      where,
      orderBy: { openTime: 'desc' }
    });
    
    // Fetch current prices from HFT bot for open positions
    const currentPrices: Record<string, number> = {};
    if (type === 'open') {
      try {
        const pricesResponse = await fetch('http://localhost:3006/api/market-data');
        if (pricesResponse.ok) {
          const marketData = await pricesResponse.json();
          // Convert market data to price map
          marketData.forEach((market: {symbol: string; price: number}) => {
            currentPrices[market.symbol] = market.price;
          });
        }
      } catch (error) {
        console.error('Failed to fetch current prices:', error);
      }
    }
    
    // Calculate current PnL for positions
    const positionsWithPnL = positions.map(position => {
      // Use real-time price if available, otherwise use entry price
      const currentPrice = currentPrices[position.symbol] || position.entryPrice;
      const unrealizedPnL = position.side === 'long'
        ? (currentPrice - position.entryPrice) * position.quantity
        : (position.entryPrice - currentPrice) * position.quantity;
      
      return {
        ...position,
        currentPrice,
        unrealizedPnL: position.closeTime ? null : unrealizedPnL,
        realizedPnL: position.closedPnL
      };
    });
    
    return NextResponse.json({ positions: positionsWithPnL });
  } catch (error) {
    console.error('Error fetching positions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch positions' },
      { status: 500 }
    );
  }
}
