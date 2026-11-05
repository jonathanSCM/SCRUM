import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashInviteToken } from "@/lib/invitations";
import { findUserByEmail } from "@/lib/users";
import { ROLE_LABEL, invitationState, normalizeRole } from "@/lib/scrum/roles";

// Datos públicos de una invitación (quien tiene el enlace secreto). No requiere sesión.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await prisma.invitation.findUnique({
    where: { tokenHash: hashInviteToken(token) },
    select: { email: true, role: true, expiresAt: true, acceptedAt: true, revokedAt: true, workspace: { select: { name: true } }, invitedBy: { select: { name: true } } },
  });
  // Mismo mensaje si no existe o si el enlace es inválido: no se confirma nada a quien adivina.
  if (!inv) return NextResponse.json({ error: "Invitación no encontrada" }, { status: 404 });
  const state = invitationState(inv);
  const account = state === "ok" ? await findUserByEmail(inv.email) : null;
  return NextResponse.json({ state, workspaceName: inv.workspace.name, role: normalizeRole(inv.role), roleLabel: ROLE_LABEL[normalizeRole(inv.role)], email: inv.email, invitedBy: inv.invitedBy?.name ?? null, accountExists: !!account });
}
