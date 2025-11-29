import { PrismaClient } from '@/generated/client/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };
const isProduction = process.env.NODE_ENV === 'production';

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: isProduction ? [] : ['query'],
  });

if (!isProduction) globalForPrisma.prisma = prisma;
