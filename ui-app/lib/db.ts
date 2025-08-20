import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Ensure we use the correct DATABASE_URL
const DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres:password@localhost:5433/hft_trading?schema=public";

// Log the connection string (without password) in development
if (process.env.NODE_ENV === 'development') {
  const urlForLogging = DATABASE_URL.replace(/:password@/, ':***@');
  console.log('[Prisma] Connecting to:', urlForLogging);
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  datasources: {
    db: {
      url: DATABASE_URL
    }
  }
});

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
