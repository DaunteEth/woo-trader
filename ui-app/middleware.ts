// Middleware temporarily disabled due to Edge runtime compatibility issues with jsonwebtoken
// TODO: Implement Edge-compatible JWT verification or use jose library

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Middleware disabled - authentication handled client-side
  return NextResponse.next();
}

export const config = {
  matcher: [],
};
