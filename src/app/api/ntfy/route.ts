import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { parseBody, readJson } from "@/lib/validation";
import { newTopic, ntfyConfigured, ntfyServerUrl } from "@/lib/ntfy";

// Canal de avisos al teléfono (ntfy) de la propia persona. Solo con sesión de navegador.
function view(c: { topic: string; enabled: boolean; minimal: boolean; lastOkAt: Date | null; lastError: string | null; failures: number } | null) {
  const server = ntfyServerUrl();
  if (!c) return null;
  const host = server.replace(/^https?:\/\//, "");
  return {
    enabled: c.enabled,
    minimal: c.minimal,
    topic: c.topic,
    server,
    // Enlaces para suscribirse: el esquema ntfy:// abre la app instalada; el https abre la versión web.
    appLink: `ntfy://${host}/${c.topic}`,
    webLink: `${server}/${c.topic}`,
    lastOkAt: c.lastOkAt,
    lastError: c.lastError,
    disabledByErrors: !c.enabled && c.failures >= 3,
  };
}

export async function GET() {
  const auth = await apiUser();
  if ("error" in auth) return auth.error;
  try {
    const c = await prisma.ntfyChannel.findUnique({ where: { userId: auth.user.id } });
    return NextResponse.json({ configured: ntfyConfigured(), channel: view(c) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}

// Activa los avisos al teléfono (crea el tema secreto) o los vuelve a activar.
export async function POST() {
  const auth = await apiUser();
  if ("error" in auth) return auth.error;
  try {
    if (!ntfyConfigured()) return NextResponse.json({ error: "Los avisos al teléfono no están configurados en el servidor" }, { status: 400 });
    const c = await prisma.ntfyChannel.upsert({
      where: { userId: auth.user.id },
      create: { userId: auth.user.id, topic: newTopic() },
      update: { enabled: true, failures: 0, lastError: null },
    });
    return NextResponse.json({ configured: true, channel: view(c) }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: Request) {
  const auth = await apiUser();
  if ("error" in auth) return auth.error;
  const parsed = parseBody(z.object({ enabled: z.boolean().optional(), minimal: z.boolean().optional() }), await readJson(req));
  if ("error" in parsed) return parsed.error;
  try {
    const r = await prisma.ntfyChannel.updateMany({ where: { userId: auth.user.id }, data: { ...(parsed.data.enabled !== undefined ? { enabled: parsed.data.enabled, ...(parsed.data.enabled ? { failures: 0, lastError: null } : {}) } : {}), ...(parsed.data.minimal !== undefined ? { minimal: parsed.data.minimal } : {}) } });
    if (r.count === 0) return NextResponse.json({ error: "Primero activa los avisos al teléfono" }, { status: 404 });
    const c = await prisma.ntfyChannel.findUnique({ where: { userId: auth.user.id } });
    return NextResponse.json({ configured: ntfyConfigured(), channel: view(c) });
  } catch (e) {
    return errorResponse(e);
  }
}

// Quita el canal (el tema deja de existir).
export async function DELETE() {
  const auth = await apiUser();
  if ("error" in auth) return auth.error;
  try {
    await prisma.ntfyChannel.deleteMany({ where: { userId: auth.user.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
