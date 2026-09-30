import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { apiError } from "@/lib/validation/http";
import { projectService } from "@/services/projects/service";

type Context = { params: Promise<{ projectId: string }> };
export async function GET(_request: Request, context: Context) {
  try {
    const project = await projectService(db).get((await context.params).projectId);
    return project ? NextResponse.json(project) : NextResponse.json({ error: "Projekti ei leitud." }, { status: 404 });
  } catch (error) { return apiError(error); }
}
export async function PATCH(request: Request, context: Context) {
  try { return NextResponse.json(await projectService(db).setStage((await context.params).projectId, await request.json())); }
  catch (error) { return apiError(error); }
}
