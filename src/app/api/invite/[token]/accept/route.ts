import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { errorResponse } from "@/lib/api";
import { hashInviteToken } from "@/lib/invitations";
import { findUserByEmail } from "@/lib/users";
import { setActiveWorkspace } from "@/lib/activeWorkspace";
import { invitationState, normalizeEmail, normalizeRole } from "@/lib/scrum/roles";
import { parseBody, readJson } from "@/lib/validation";

// Acepta una invitación.
//  - Con sesión: la cuenta debe ser la del email invitado; se une al equipo.
//  - Sin sesión y sin cuenta con ese email: crea la cuenta (nombre + contraseña) y la une al equipo.
//    Abrir el enlace enviado al correo prueba que la persona es dueña de ese email.
//  - Sin sesión y con cuenta existente: debe iniciar sesión primero (la página lo guía).
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const raw = await readJson(req).catch(() => ({}));

  try {
    const inv = await prisma.invitation.findUnique({ where: { tokenHash: hashInviteToken(token) } });
    if (!inv) return NextResponse.json({ error: "Invitación no encontrada" }, { status: 404 });
    const state = invitationState(inv);
    if (state !== "ok") {
      const msg = state === "expired" ? "La invitación venció: pedí que te manden otra." : state === "used" ? "Esta invitación ya se usó." : "Esta invitación fue cancelada.";
      return NextResponse.json({ error: msg }, { status: 410 });
    }

    const session = await getServerSession(authOptions);
    let userId: string;
    if (session?.user?.id) {
      if (normalizeEmail(session.user.email ?? "") !== normalizeEmail(inv.email)) {
        return NextResponse.json({ error: `Esta invitación es para ${inv.email}. Iniciaste sesión con otra cuenta.` }, { status: 403 });
      }
      userId = session.user.id;
    } else {
      const existing = await findUserByEmail(inv.email);
      if (existing) return NextResponse.json({ error: "Ya tenés una cuenta con ese email: iniciá sesión para aceptar." }, { status: 401 });
      const parsed = parseBody(z.object({ name: z.string().trim().min(1, "Nombre requerido").max(100), password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres").max(200) }), raw);
      if ("error" in parsed) return parsed.error;
      const created = await prisma.user.create({ data: { name: parsed.data.name, email: inv.email, passwordHash: await bcrypt.hash(parsed.data.password, 10) }, select: { id: true } });
      userId = created.id;
    }

    // Marcar como usada y crear la membresía de forma atómica (si dos personas abren el enlace a la vez, solo una gana).
    const result = await prisma.$transaction(async (tx) => {
      const claimed = await tx.invitation.updateMany({ where: { id: inv.id, acceptedAt: null, revokedAt: null }, data: { acceptedAt: new Date() } });
      if (claimed.count === 0) return false;
      await tx.membership.upsert({
        where: { userId_workspaceId: { userId, workspaceId: inv.workspaceId } },
        create: { userId, workspaceId: inv.workspaceId, role: normalizeRole(inv.role) },
        update: {},
      });
      return true;
    });
    if (!result) return NextResponse.json({ error: "Esta invitación ya se usó." }, { status: 410 });
    return setActiveWorkspace(NextResponse.json({ ok: true, loggedIn: !!session?.user?.id, email: inv.email }), inv.workspaceId);
  } catch (e) {
    return errorResponse(e);
  }
}
