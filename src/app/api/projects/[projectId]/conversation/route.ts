import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { apiError } from "@/lib/validation/http";
import { conversationService } from "@/services/ai-orchestration/service";
import { proposalWorkflowService } from "@/services/proposals/workflow";
export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try { return NextResponse.json(await conversationService(db).get((await params).projectId)); } catch (error) { return apiError(error); }
}
export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const body = await request.text();
    if (body.length > 12_000) return NextResponse.json({ error: "Sõnum on liiga pikk." }, { status: 400 });
    return NextResponse.json(await conversationService(db).submit((await params).projectId, JSON.parse(body)));
  } catch (error) { return apiError(error); }
}
export async function PATCH(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const body = await request.text();
    if (body.length > 100_000) return NextResponse.json({ error: "Ettepanek on liiga suur." }, { status: 400 });
    const projectId = (await params).projectId;
    await proposalWorkflowService(db).confirm(projectId, JSON.parse(body));
    return NextResponse.json(await conversationService(db).get(projectId));
  } catch (error) { return apiError(error); }
}
