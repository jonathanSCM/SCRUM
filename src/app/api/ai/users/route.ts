import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse } from "@/lib/api";

export async function GET() {
  const auth = await apiUser();
  if ("error" in auth) return auth.error;
  try {
    const users = await prisma.user.findMany({ select: { id: true, name: true, email: true }, orderBy: { name: "asc" } });
    return NextResponse.json(users);
  } catch (e) {
    return errorResponse(e);
  }
}
