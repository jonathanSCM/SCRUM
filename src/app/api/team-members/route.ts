import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";

// Las personas del equipo son los usuarios de esta app.
export async function GET() {
  const auth = await apiUser();
  if ("error" in auth) return auth.error;

  const users = await prisma.user.findMany({ select: { id: true, name: true, role: true }, orderBy: { name: "asc" } });
  return NextResponse.json(users);
}
