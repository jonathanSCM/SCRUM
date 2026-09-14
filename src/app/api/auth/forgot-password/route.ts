import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { parseBody, forgotPasswordSchema } from "@/lib/validation";
import { sendEmail, resetPasswordEmailHtml } from "@/lib/mailer";
import { getBaseUrl } from "@/lib/baseUrl";

const GENERIC_MESSAGE = "Si ese email existe en el sistema, te llegará un correo para restablecer tu contraseña.";

export async function POST(req: Request) {
  const parsed = parseBody(forgotPasswordSchema, await req.json());
  if ("error" in parsed) return parsed.error;
  const { email } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });

  if (user) {
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const token = randomBytes(32).toString("hex");
    await prisma.passwordResetToken.create({
      data: {
        token,
        userId: user.id,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const resetUrl = `${getBaseUrl()}/reset-password/${token}`;
    await sendEmail({
      to: user.email,
      subject: "Restablecé tu contraseña",
      html: resetPasswordEmailHtml(user.name, resetUrl),
    });
  }

  return NextResponse.json({ message: GENERIC_MESSAGE });
}
