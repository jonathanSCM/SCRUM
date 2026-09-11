import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { parseBody, createUserSchema } from "@/lib/validation";

export async function GET() {
  const count = await prisma.user.count();
  return NextResponse.json({ available: count === 0 });
}

export async function POST(req: Request) {
  const count = await prisma.user.count();
  if (count > 0) {
    return NextResponse.json(
      { error: "Ya existe al menos un usuario. Pedile una cuenta a un líder." },
      { status: 403 }
    );
  }

  const parsed = parseBody(createUserSchema, await req.json());
  if ("error" in parsed) return parsed.error;
  const { name, email, password } = parsed.data;

  const recount = await prisma.user.count();
  if (recount > 0) {
    return NextResponse.json({ error: "Ya existe al menos un usuario." }, { status: 403 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { name, email, passwordHash, role: "LEAD" },
    select: { id: true, name: true, email: true, role: true },
  });

  return NextResponse.json(user, { status: 201 });
}
