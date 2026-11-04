import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse, notFound } from "@/lib/api";
import { createIssue } from "@/lib/issues";
import { formatIssueKey } from "@/lib/scrum/issueKey";
import { noteToTicketsSchema, parseBody, readJson } from "@/lib/validation";
import { logHistory } from "@/lib/history";

// Convierte puntos de una nota (acta de reunión, brief) en tareas del backlog.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiUser();
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const parsed = parseBody(noteToTicketsSchema, await readJson(req));
  if ("error" in parsed) return parsed.error;

  try {
    const note = await prisma.note.findUnique({ where: { id }, select: { id: true, title: true, projectId: true, project: { select: { key: true } } } });
    if (!note) return notFound("Nota no encontrada");

    const keys: string[] = [];
    for (const title of parsed.data.items) {
      const issue = await createIssue(note.projectId, { title, issueType: "TASK", description: `Creada desde la nota «${note.title}»` }, auth.user);
      keys.push(formatIssueKey(note.project.key, issue.number));
    }
    await logHistory({ projectId: note.projectId, field: "nota_a_tickets", oldValue: note.title, newValue: keys.join(", "), actor: auth.user });
    return NextResponse.json({ keys });
  } catch (e) {
    return errorResponse(e);
  }
}
