import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const token = request.cookies.get('auth-token');
  
  return NextResponse.json({
    hasToken: !!token,
    tokenValue: token?.value || null,
    allCookies: request.cookies.getAll()
  });
}
