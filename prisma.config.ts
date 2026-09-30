import "dotenv/config";
import { defineConfig } from "prisma/config";
import { resolve } from "node:path";

const configuredUrl = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
const datasourceUrl = configuredUrl.startsWith("file:./")
  ? `file:${resolve(process.cwd(), configuredUrl.slice("file:".length))}`
  : configuredUrl;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "node --import tsx prisma/seed.ts" },
  datasource: { url: datasourceUrl },
});
