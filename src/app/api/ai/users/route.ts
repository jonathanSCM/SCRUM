import { NextResponse } from "next/server";
import { membersOf } from "@/lib/workspace";
import { apiUser } from "@/lib/session";
import { errorResponse } from "@/lib/api";

export async function GET() {
  const auth = await apiUser({ workspace: true });
  if ("error" in auth) return auth.error;
  try {
    const members = await membersOf(auth.user.workspaceId!);
    return NextResponse.json(members.map(({ id, name, email }) => ({ id, name, email })));
  } catch (e) {
    return errorResponse(e);
  }
}
