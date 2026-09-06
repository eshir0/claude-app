import "server-only";
import { PrismaClient } from "@/generated/prisma/client.js";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set. See .env.example.");
}

// Same DATABASE_URL string prisma.config.ts hands to the migration CLI —
// both must point at the same file, or migrations and the running app end
// up writing to two different SQLite files.
const adapter = new PrismaBetterSqlite3({ url: databaseUrl });

declare global {
   
  var __prisma: PrismaClient | undefined;
}

export const prisma = globalThis.__prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}
