import { closeSync, existsSync, mkdirSync, openSync } from "node:fs";
import { dirname, resolve } from "node:path";

const databaseUrl = process.env.DATABASE_URL ?? "file:./prisma/dev.db";

if (databaseUrl.startsWith("file:")) {
  const configuredPath = decodeURIComponent(databaseUrl.slice("file:".length).split(/[?#]/, 1)[0]);
  const databasePath = configuredPath.startsWith("/") ? configuredPath : resolve(process.cwd(), configuredPath);
  mkdirSync(dirname(databasePath), { recursive: true });
  if (!existsSync(databasePath)) closeSync(openSync(databasePath, "a"));
}
