import "server-only";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";

export function createDatabaseClient(url: string) {
  return new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });
}

const globalDb = globalThis as unknown as { prisma?: PrismaClient };
export const db = globalDb.prisma ?? createDatabaseClient(process.env.DATABASE_URL ?? "file:./prisma/dev.db");
if (process.env.NODE_ENV !== "production") globalDb.prisma = db;
