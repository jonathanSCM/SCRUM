import { NextResponse } from "next/server";
import { apiUser } from "@/lib/session";
import { membersOf } from "@/lib/workspace";

// Las personas del equipo activo.
export async function GET() {
  const auth = await apiUser({ workspace: true });
  if ("error" in auth) return auth.error;
  const members = await membersOf(auth.user.workspaceId!);
  return NextResponse.json(members.map((m) => ({ id: m.id, name: m.name, role: m.wsRole })));
}
