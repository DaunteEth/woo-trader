import { NextRequest, NextResponse } from 'next/server';
import { getUserFromToken } from '@/lib/auth';
import { getActiveSimulation } from '@/lib/simulation';

export async function GET(request: NextRequest) {
  const token = request.cookies.get('auth-token')?.value;
  
  if (!token) {
    return NextResponse.json({ authenticated: false });
  }
  
  const user = await getUserFromToken(token);
  
  if (!user) {
    return NextResponse.json({ authenticated: false });
  }
  
  // Get active simulation
  const activeSimulation = await getActiveSimulation(user.id);
  
  return NextResponse.json({
    authenticated: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      balance: user.balance
    },
    activeSimulation
  });
}
