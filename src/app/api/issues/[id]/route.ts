import { NextResponse } from "next/server";
import { apiUser } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { deleteIssue, updateIssue } from "@/lib/issues";
import { parseBody, readJson, updateIssueSchema } from "@/lib/validation";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiUser({ issue: (await params).id });
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const parsed = parseBody(updateIssueSchema, await readJson(req));
  if ("error" in parsed) return parsed.error;

  try {
    const issue = await updateIssue(id, parsed.data, auth.user);
    return NextResponse.json(issue);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiUser({ issue: (await params).id });
  if ("error" in auth) return auth.error;
  const { id } = await params;

  try {
    await deleteIssue(id, auth.user);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
