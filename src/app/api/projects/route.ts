import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { apiError } from "@/lib/validation/http";
import { projectService } from "@/services/projects/service";

export async function GET() {
  try { return NextResponse.json(await projectService(db).list()); }
  catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  try { return NextResponse.json(await projectService(db).create(await request.json()), { status: 201 }); }
  catch (error) { return apiError(error); }
}
