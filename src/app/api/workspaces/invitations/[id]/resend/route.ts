import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse, notFound } from "@/lib/api";
import { sendEmail, inviteEmailHtml } from "@/lib/mailer";
import { generateInviteToken, hashInviteToken, inviteUrl } from "@/lib/invitations";
import { ROLE_LABEL, inviteExpiry, normalizeRole } from "@/lib/scrum/roles";

// Reenvía una invitación: genera un enlace nuevo (el anterior deja de servir) y renueva el plazo.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiUser({ lead: true, invitation: (await params).id });
  if ("error" in auth) return auth.error;
  const { id } = await params;
  try {
    const inv = await prisma.invitation.findUnique({ where: { id }, include: { workspace: { select: { name: true } } } });
    if (!inv || inv.acceptedAt || inv.revokedAt) return notFound("Invitación no encontrada");
    const token = generateInviteToken();
    await prisma.invitation.update({ where: { id }, data: { tokenHash: hashInviteToken(token), expiresAt: inviteExpiry() } });
    const url = inviteUrl(token);
    await sendEmail({ to: inv.email, subject: `${auth.user.name} te invitó a ${inv.workspace.name} en SCRUM ProShop`, html: inviteEmailHtml(auth.user.name, inv.workspace.name, ROLE_LABEL[normalizeRole(inv.role)], url) });
    return NextResponse.json({ email: inv.email, url, emailed: !!process.env.RESEND_API_KEY });
  } catch (e) {
    return errorResponse(e);
  }
}
