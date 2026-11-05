import "server-only";
import type { NextResponse } from "next/server";
import { ACTIVE_WS_COOKIE } from "@/lib/workspace";

// Recuerda el equipo activo en una cookie (solo identifica el equipo; cada petición vuelve a comprobar la membresía).
export function setActiveWorkspace(res: NextResponse, workspaceId: string): NextResponse {
  res.cookies.set({ name: ACTIVE_WS_COOKIE, value: workspaceId, httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365, secure: process.env.NODE_ENV === "production" });
  return res;
}
