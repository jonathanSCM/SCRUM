import { NextResponse } from "next/server";
import { apiUser } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { bulkUpdateIssues } from "@/lib/issues";
import { bulkIssuesSchema, parseBody, readJson } from "@/lib/validation";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiUser();
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const parsed = parseBody(bulkIssuesSchema, await readJson(req));
  if ("error" in parsed) return parsed.error;

  try {
    const updated = await bulkUpdateIssues(id, parsed.data.ids, parsed.data.patch, auth.user);
    return NextResponse.json({ updated });
  } catch (e) {
    return errorResponse(e);
  }
}
