import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { membersOf } from "@/lib/workspace";
import { findUserByEmail } from "@/lib/users";
import { parseBody, createUserSchema, readJson } from "@/lib/validation";

// Personas del equipo activo.
export async function GET() {
  const auth = await apiUser({ workspace: true });
  if ("error" in auth) return auth.error;
  try {
    return NextResponse.json(await membersOf(auth.user.workspaceId!));
  } catch (e) {
    return errorResponse(e);
  }
}

// Solo un líder (dueño o admin) del equipo crea cuentas, y las crea directo: la contraseña
// temporal se devuelve una sola vez. La cuenta nace como miembro de ESTE equipo.
export async function POST(req: Request) {
  const auth = await apiUser({ workspace: true, lead: true });
  if ("error" in auth) return auth.error;

  const parsed = parseBody(createUserSchema, await readJson(req));
  if ("error" in parsed) return parsed.error;
  const { name, email, password, role } = parsed.data;

  try {
    const existing = await findUserByEmail(email);
    if (existing) return NextResponse.json({ error: "Ya existe una cuenta con ese email" }, { status: 400 });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        name,
        email: email.toLowerCase(),
        passwordHash,
        role: role === "LEAD" ? "LEAD" : "MEMBER", // legacy: el rol real vive en la membresía
        memberships: { create: { workspaceId: auth.user.workspaceId!, role: role === "LEAD" ? "ADMIN" : "MEMBER" } },
      },
      select: { id: true, name: true, email: true, role: true },
    });
    return NextResponse.json(user, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
