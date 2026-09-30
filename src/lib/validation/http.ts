import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { BacklogError } from "@/lib/validation/backlog";
import { Prisma } from "@/generated/prisma/client";

export function apiError(error: unknown) {
  if (error instanceof BacklogError) return NextResponse.json({ error: error.message, issues: error.issues }, { status: error.status });
  if (error instanceof ZodError) return NextResponse.json({ error: error.issues[0]?.message ?? "Vigased andmed." }, { status: 400 });
  if (error instanceof SyntaxError) return NextResponse.json({ error: "Päringu sisu peab olema korrektne JSON." }, { status: 400 });
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
    return NextResponse.json({ error: "Projekti ei leitud." }, { status: 404 });
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return NextResponse.json({ error: "Sama päring on juba vastu võetud. Värskenda vaadet." }, { status: 409 });
  }
  console.error("Project request failed", error instanceof Error ? error.name : "UnknownError");
  return NextResponse.json({ error: "Andmete salvestamine ebaõnnestus. Proovi uuesti." }, { status: 500 });
}
