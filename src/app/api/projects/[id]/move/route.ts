import { NextResponse } from "next/server";
import { apiUser } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { moveIssue } from "@/lib/issues";
import { moveIssueSchema, parseBody, readJson } from "@/lib/validation";

// Drag & drop del backlog y del tablero: mueve un ticket a otro sprint / otra
// columna y/o a otra posición (entre prevId y nextId).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiUser();
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const parsed = parseBody(moveIssueSchema, await readJson(req));
  if ("error" in parsed) return parsed.error;

  try {
    const issue = await moveIssue(id, parsed.data, auth.user);
    return NextResponse.json(issue);
  } catch (e) {
    return errorResponse(e);
  }
}
