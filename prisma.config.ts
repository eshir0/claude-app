import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Same DATABASE_URL the app runtime uses (src/lib/prisma.ts) so the
    // migration CLI and the running app always point at the same file.
    url: env("DATABASE_URL"),
  },
});
