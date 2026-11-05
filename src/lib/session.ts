import { headers } from "next/headers";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { resolveApiToken } from "@/lib/apiToken";

export type SessionUser = { id: string; name: string; email: string; role: "LEAD" | "MEMBER" };

export async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  return session;
}

export async function requireLead() {
  const session = await requireSession();
  if (session.user.role !== "LEAD") redirect("/projects");
  return session;
}

// Para las rutas de la API: devuelve el usuario o la respuesta de error lista
// para retornar.
export async function apiUser(options: { lead?: boolean } = {}): Promise<{ user: SessionUser } | { error: NextResponse }> {
  // Token IA ("Authorization: Bearer …"): actúa como su dueño, con sus mismos permisos y a su nombre.
  // El middleware ya limitó las rutas permitidas (src/lib/aiAccess.ts).
  const h = await headers();
  const authz = h.get("authorization");
  if (authz && /^bearer\s/i.test(authz)) {
    const owner = await resolveApiToken(authz.replace(/^bearer\s+/i, "").trim(), h.get("x-token-route"));
    if (!owner) return { error: NextResponse.json({ error: "Token inválido o revocado" }, { status: 401 }) };
    if (options.lead && owner.role !== "LEAD") {
      return { error: NextResponse.json({ error: "Solo un líder puede hacer esto" }, { status: 403 }) };
    }
    return { user: owner };
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return { error: NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
  const user: SessionUser = {
    id: session.user.id,
    name: session.user.name ?? "",
    email: session.user.email ?? "",
    role: session.user.role === "LEAD" ? "LEAD" : "MEMBER",
  };
  if (options.lead && user.role !== "LEAD") {
    return { error: NextResponse.json({ error: "Solo un líder puede hacer esto" }, { status: 403 }) };
  }
  return { user };
}
