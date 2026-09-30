import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { BacklogError } from "@/lib/validation/backlog";

export const requestKeyPattern = /^[a-zA-Z0-9_-]{8,100}$/;
export const processingLeaseMs = 60_000;

export function parseRequestKey(value: string | null) {
  if (value === null) return undefined;
  if (!requestKeyPattern.test(value)) throw new BacklogError("Päringu võti on vigane.", 400);
  return value;
}

export async function claimTransactionalRequest(tx: Prisma.TransactionClient, projectId: string, requestKey: string | undefined, scope: string) {
  if (!requestKey) return "run" as const;
  const existing = await tx.requestExecution.findUnique({ where: { projectId_requestKey: { projectId, requestKey } } });
  if (existing) {
    if (existing.scope !== scope) throw new BacklogError("Päringu võti on juba teise toimingu jaoks kasutatud.", 409);
    if (existing.status === "complete") return "complete" as const;
    throw new BacklogError("Päring on juba töös.", 409);
  }
  await tx.requestExecution.create({ data: { projectId, requestKey, scope, status: "processing" } });
  return "run" as const;
}

export async function completeTransactionalRequest(tx: Prisma.TransactionClient, projectId: string, requestKey: string | undefined) {
  if (requestKey) await tx.requestExecution.update({ where: { projectId_requestKey: { projectId, requestKey } }, data: { status: "complete", completedAt: new Date() } });
}
