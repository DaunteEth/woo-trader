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
    
    // Get simulation balance
    const balance = activeSimulation.balance;
    
    // Get all closed trades with PnL
    const trades = await prisma.trade.findMany({
      where: { 
        simulationId: activeSimulation.id,
        type: 'close',
        pnl: { not: null }
      }
    });
    
    // Calculate statistics
    const totalTrades = trades.length;
    const totalPnL = trades.reduce((sum, trade) => sum + (trade.pnl || 0), 0);
    const winningTrades = trades.filter(t => (t.pnl || 0) > 0);
    const losingTrades = trades.filter(t => (t.pnl || 0) < 0);
    
    const winRate = totalTrades > 0 ? winningTrades.length / totalTrades : 0;
    const averageWin = winningTrades.length > 0 
      ? winningTrades.reduce((sum, t) => sum + (t.pnl || 0), 0) / winningTrades.length 
      : 0;
    const averageLoss = losingTrades.length > 0
      ? losingTrades.reduce((sum, t) => sum + (t.pnl || 0), 0) / losingTrades.length
      : 0;
    const profitFactor = losingTrades.length > 0 && winningTrades.length > 0
      ? Math.abs(winningTrades.reduce((sum, t) => sum + (t.pnl || 0), 0) / 
                losingTrades.reduce((sum, t) => sum + (t.pnl || 0), 0))
      : 0;
    
    // Get strategy performance
    const signalStats = await prisma.signal.groupBy({
      by: ['strategy'],
      where: { 
        simulationId: activeSimulation.id,
        executed: true
      },
      _count: {
        id: true
      }
    });
    
    // Get daily PnL for chart
    const dailyPnL = await prisma.$queryRaw`
      SELECT 
        DATE(timestamp) as date,
        SUM(pnl) as dailyPnL
      FROM Trade
      WHERE userId = ${user.id}
        AND type = 'close'
        AND pnl IS NOT NULL
      GROUP BY DATE(timestamp)
      ORDER BY date DESC
      LIMIT 30
    `;
    
    // Get open positions for unrealized P&L
    const openPositions = await prisma.position.findMany({
      where: { simulationId: activeSimulation.id, closeTime: null }
    });
    
    const startingBalance = balance || 10000;
    const currentBalance = startingBalance + totalPnL;
    
    return NextResponse.json({
      stats: {
        startingBalance,
        currentBalance,
        totalTrades,
        totalPnL,
        winRate,
        winningTrades: winningTrades.length,
        losingTrades: losingTrades.length,
        averageWin,
        averageLoss,
        profitFactor,
        largestWin: winningTrades.length > 0 
          ? Math.max(...winningTrades.map(t => t.pnl || 0))
          : 0,
        largestLoss: losingTrades.length > 0
          ? Math.min(...losingTrades.map(t => t.pnl || 0))
          : 0,
        openPositions: openPositions.length
      },
      strategyStats: signalStats,
      dailyPnL
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}
