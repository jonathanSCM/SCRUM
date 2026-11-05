import { NextResponse } from "next/server";
import { apiUser } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { createIssue } from "@/lib/issues";
import { createIssueSchema, parseBody, readJson } from "@/lib/validation";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiUser({ project: (await params).id });
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const parsed = parseBody(createIssueSchema, await readJson(req));
  if ("error" in parsed) return parsed.error;

  try {
    const issue = await createIssue(id, parsed.data, auth.user);
    return NextResponse.json(issue, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
