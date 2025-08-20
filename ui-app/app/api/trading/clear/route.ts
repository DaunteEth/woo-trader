import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getUserFromToken } from '@/lib/auth';

export async function DELETE(request: Request) {
  try {
    const user = await getUserFromToken(request.headers.get('cookie') || '');
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Get active simulation
    const settings = await prisma.userSettings.findUnique({
      where: { userId: user.id }
    });
    
    if (!settings?.activeSimulationId) {
      return NextResponse.json({ error: 'No active simulation' }, { status: 400 });
    }
    
    const simulationId = settings.activeSimulationId;
    
    // Delete all trading data for this simulation
    await prisma.$transaction([
      // Delete trades
      prisma.trade.deleteMany({
        where: { simulationId }
      }),
      
      // Delete positions
      prisma.position.deleteMany({
        where: { simulationId }
      }),
      
      // Delete signals
      prisma.signal.deleteMany({
        where: { simulationId }
      }),
      
      // Reset performance stats
      prisma.performanceStats.deleteMany({
        where: { simulationId }
      })
    ]);
    
    // Create fresh performance stats
    await prisma.performanceStats.create({
      data: {
        simulationId,
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        totalPnL: 0,
        winRate: 0,
        avgWin: 0,
        avgLoss: 0
      }
    });
    
    return NextResponse.json({ 
      success: true,
      message: 'All trading data cleared successfully'
    });
  } catch (error) {
    console.error('Failed to clear trading data:', error);
    return NextResponse.json(
      { error: 'Failed to clear trading data' },
      { status: 500 }
    );
  }
}
