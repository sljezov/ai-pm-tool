import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";

const db = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? "file:./prisma/dev.db" }) });
try {
  await db.project.upsert({
    where: { id: "demo-sports-club" },
    update: {},
    create: { id: "demo-sports-club", name: "Spordiklubi broneeringud", description: "Soovin spordiklubile rakendust, kus liikmed saavad treeninguid leida ja neile koha broneerida." },
  });
  console.log("Näidisprojekt on valmis.");
} finally { await db.$disconnect(); }
