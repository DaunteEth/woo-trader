import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getUserFromToken } from '@/lib/auth';

type RouteParams = {
  params: Promise<{ id: string }>;
};

export async function GET(
  request: NextRequest,
  context: RouteParams
) {
  try {
    const { id } = await context.params;
    
    const user = await getUserFromToken(request.cookies.get('auth-token')?.value || '');
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const simulation = await prisma.simulation.findFirst({
      where: {
        id: id,
        userId: user.id
      },
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
      }
    });

    if (!simulation) {
      return NextResponse.json({ error: 'Simulation not found' }, { status: 404 });
    }

    return NextResponse.json({ simulation });
  } catch (error) {
    console.error('Failed to fetch simulation:', error);
    return NextResponse.json(
      { error: 'Failed to fetch simulation' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  context: RouteParams
) {
  try {
    const { id } = await context.params;
    
    const user = await getUserFromToken(request.cookies.get('auth-token')?.value || '');
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { name, description } = await request.json();

    // Verify ownership
    const simulation = await prisma.simulation.findFirst({
      where: {
        id: id,
        userId: user.id
      },
      include: {
        strategyConfigs: true
      }
    });

    if (!simulation) {
      return NextResponse.json({ error: 'Simulation not found' }, { status: 404 });
    }

    // Update simulation
    const updated = await prisma.simulation.update({
      where: { id: id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description })
      },
      include: {
        strategyConfigs: true,
        performanceStats: true
      }
    });

    // Strategy configs should be updated through the /api/strategies endpoint

    return NextResponse.json({ simulation: updated });
  } catch (error) {
    console.error('Failed to update simulation:', error);
    return NextResponse.json(
      { error: 'Failed to update simulation' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: RouteParams
) {
  try {
    const { id } = await context.params;
    
    const user = await getUserFromToken(request.cookies.get('auth-token')?.value || '');
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify ownership
    const simulation = await prisma.simulation.findFirst({
      where: {
        id: id,
        userId: user.id
      }
    });

    if (!simulation) {
      return NextResponse.json({ error: 'Simulation not found' }, { status: 404 });
    }

    // Check if it's the active simulation
    if (simulation.isActive) {
      return NextResponse.json(
        { error: 'Cannot delete active simulation' },
        { status: 400 }
      );
    }

    // Delete simulation (cascade will handle related data)
    await prisma.simulation.delete({
      where: { id: id }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete simulation:', error);
    return NextResponse.json(
      { error: 'Failed to delete simulation' },
      { status: 500 }
    );
  }
}
