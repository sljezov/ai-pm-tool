import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { apiError } from "@/lib/validation/http";
import { storyService } from "@/services/stories/service";
import { parseRequestKey } from "@/services/requests/idempotency";
type Context = { params: Promise<{ projectId: string }> };
export async function GET(_request: Request, context: Context) {
  try { return NextResponse.json(await storyService(db).get((await context.params).projectId)); }
  catch (error) { return apiError(error); }
}
export async function POST(request: Request, context: Context) {
  try { return NextResponse.json(await storyService(db).mutate((await context.params).projectId, await request.json(), parseRequestKey(request.headers.get("Idempotency-Key")))); }
  catch (error) { return apiError(error); }
}
