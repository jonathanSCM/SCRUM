import { NextResponse } from "next/server";
import { z } from "zod";
import { apiUser } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { shareDraft } from "@/lib/drafts";
import { parseBody, readJson } from "@/lib/validation";

// Comparte el borrador con el equipo: se crea el ticket real (en el backlog o en el sprint elegido) y el borrador desaparece.
export async function POST(req: Request, { params }: { params: Promise<{ id: string; draftId: string }> }) {
  const { id, draftId } = await params;
  const auth = await apiUser({ project: id });
  if ("error" in auth) return auth.error;
  const parsed = parseBody(z.object({ sprintId: z.string().min(1).nullish() }), await readJson(req).catch(() => ({})));
  if ("error" in parsed) return parsed.error;
  try {
    const issue = await shareDraft(id, draftId, auth.user, parsed.data.sprintId ?? null);
    return NextResponse.json({ id: issue.id, number: issue.number }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
