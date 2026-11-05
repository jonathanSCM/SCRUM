import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { findUserByEmail } from "@/lib/users";
import { apiUser } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { sendEmail, inviteEmailHtml } from "@/lib/mailer";
import { generateInviteToken, hashInviteToken, inviteUrl } from "@/lib/invitations";
import { INVITE_ROLES, ROLE_LABEL, invitationState, inviteExpiry, normalizeEmail, normalizeRole } from "@/lib/scrum/roles";
import { parseBody, readJson } from "@/lib/validation";

// Invitaciones pendientes del equipo activo (dueño o admin).
export async function GET() {
  const auth = await apiUser({ workspace: true, lead: true });
  if ("error" in auth) return auth.error;
  try {
    const rows = await prisma.invitation.findMany({
      where: { workspaceId: auth.user.workspaceId!, acceptedAt: null, revokedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, email: true, role: true, createdAt: true, expiresAt: true, invitedBy: { select: { name: true } } },
    });
    return NextResponse.json(rows.map((r) => ({ ...r, role: normalizeRole(r.role), expired: invitationState({ expiresAt: r.expiresAt, acceptedAt: null, revokedAt: null }) === "expired", invitedBy: r.invitedBy?.name ?? null })));
  } catch (e) {
    return errorResponse(e);
  }
}

// Invita a un email. Se manda el correo (si hay Resend) y se devuelve el enlace para poder copiarlo.
export async function POST(req: Request) {
  const auth = await apiUser({ workspace: true, lead: true });
  if ("error" in auth) return auth.error;
  const parsed = parseBody(z.object({ email: z.string().trim().email("Email inválido").max(200), role: z.enum(INVITE_ROLES).default("MEMBER") }), await readJson(req));
  if ("error" in parsed) return parsed.error;
  const email = normalizeEmail(parsed.data.email);
  const role = parsed.data.role ?? "MEMBER";
  const workspaceId = auth.user.workspaceId!;

  try {
    const existingUser = await findUserByEmail(email);
    if (existingUser && (await prisma.membership.count({ where: { workspaceId, userId: existingUser.id } })) > 0) {
      return NextResponse.json({ error: "Esa persona ya es parte del equipo" }, { status: 400 });
    }

    // Una sola invitación vigente por email: la anterior se reemplaza.
    await prisma.invitation.updateMany({ where: { workspaceId, email, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
    const token = generateInviteToken();
    const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { name: true } });
    await prisma.invitation.create({
      data: { email, role, tokenHash: hashInviteToken(token), expiresAt: inviteExpiry(), workspaceId, invitedById: auth.user.id },
    });
    const url = inviteUrl(token);
    await sendEmail({ to: email, subject: `${auth.user.name} te invitó a ${ws?.name ?? "un equipo"} en SCRUM ProShop`, html: inviteEmailHtml(auth.user.name, ws?.name ?? "un equipo", ROLE_LABEL[role], url) });
    return NextResponse.json({ email, role, url, emailed: !!process.env.RESEND_API_KEY }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
