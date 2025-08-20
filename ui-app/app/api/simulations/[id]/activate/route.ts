import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getUserFromToken } from '@/lib/auth';

type RouteParams = {
  params: Promise<{ id: string }>;
};

export async function POST(
  request: NextRequest,
  context: RouteParams
) {
  try {
    const { id } = await context.params;
    
    const user = await getUserFromToken(request.cookies.get('auth-token')?.value || '');
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify simulation exists and belongs to user
    const simulation = await prisma.simulation.findFirst({
      where: {
        id: id,
        userId: user.id
      }
    });

    if (!simulation) {
      return NextResponse.json({ error: 'Simulation not found' }, { status: 404 });
    }

    // Deactivate all other simulations for this user
    await prisma.simulation.updateMany({
      where: {
        userId: user.id,
        id: { not: id }
      },
      data: { isActive: false }
    });

    // Activate the selected simulation
    const activated = await prisma.simulation.update({
      where: { id: id },
      data: { isActive: true },
      include: {
        strategyConfigs: true,
        performanceStats: true
      }
    });

    // Update user's active simulation
    await prisma.user.update({
      where: { id: user.id },
      data: { activeSimulationId: id }
    });

    return NextResponse.json({ 
      simulation: activated,
      message: 'Simulation activated successfully' 
    });
  } catch (error) {
    console.error('Failed to activate simulation:', error);
    return NextResponse.json(
      { error: 'Failed to activate simulation' },
      { status: 500 }
    );
  }
}
