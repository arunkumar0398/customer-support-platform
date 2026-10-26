import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

let cachedClient: PrismaClient | undefined;

export function getPrismaClient(): PrismaClient {
  if (cachedClient) return cachedClient;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL must be set before the API database client is created.');
  }

  const adapter = new PrismaPg({
    connectionString,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000,
    max: 10,
  });
  cachedClient = new PrismaClient({ adapter });
  return cachedClient;
}

export async function closePrismaClient(): Promise<void> {
  if (!cachedClient) return;
  const client = cachedClient;
  cachedClient = undefined;
  await client.$disconnect();
}
