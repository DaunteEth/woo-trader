import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function DELETE() {
  try {
    // Check if running in Docker
    const isDocker = process.env.IS_DOCKER === 'true' || 
                    process.env.HOSTNAME?.includes('docker') ||
                    process.env.NEXT_PUBLIC_API_URL?.includes('localhost');
    
    // Clear output files
    if (isDocker) {
      // In Docker, use the container path
      await execAsync('rm -f /app/output/*.json');
    } else {
      // In local development, use relative path
      await execAsync('rm -f /output/*.json');
    }
    
    return NextResponse.json({ 
      message: 'Output files cleared successfully',
      cleared: true 
    });
  } catch (error) {
    console.error('Error clearing output files:', error);
    
    // Try alternative approach
    try {
      // Try using Docker exec if available
      await execAsync('docker exec hft-trading-bot rm -f /app/output/*.json');
      return NextResponse.json({ 
        message: 'Output files cleared successfully via Docker',
        cleared: true 
      });
    } catch (dockerError) {
      console.error('Docker exec failed:', dockerError);
      return NextResponse.json(
        { error: 'Failed to clear output files' },
        { status: 500 }
      );
    }
  }
}
