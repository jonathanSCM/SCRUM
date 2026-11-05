import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { parseBody, readJson, statusOptionSchema } from "@/lib/validation";

export async function POST(req: Request) {
  const auth = await apiUser({ lead: true, workspace: true });
  if ("error" in auth) return auth.error;

  const parsed = parseBody(statusOptionSchema, await readJson(req));
  if ("error" in parsed) return parsed.error;

  try {
    const last = await prisma.statusOption.aggregate({ where: { workspaceId: auth.user.workspaceId! }, _max: { order: true } });
    const status = await prisma.statusOption.create({ data: { ...parsed.data, order: (last._max.order ?? -1) + 1, workspaceId: auth.user.workspaceId! } });
    return NextResponse.json(status, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
