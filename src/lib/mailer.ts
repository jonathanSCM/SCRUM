import { Resend } from "resend";

function getClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
}

export async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }) {
  const client = getClient();
  const from = process.env.MAIL_FROM || "SCRUM ProShop <onboarding@resend.dev>";

  if (!client) {
    console.log(`[mailer] RESEND_API_KEY no configurada. Correo NO enviado a ${to}: "${subject}"`);
    return;
  }

  const { error } = await client.emails.send({ from, to, subject, html });
  if (error) {
    console.error(`[mailer] Error enviando correo a ${to}:`, error);
  }
}

function emailShell(title: string, bodyHtml: string): string {
  return `
  <div style="font-family: Arial, sans-serif; background:#150b22; padding: 32px; color:#f6f2ff;">
    <div style="max-width: 480px; margin: 0 auto; background:#20132f; border:2px solid #f6f2ff; padding: 28px;">
      <div style="width:28px;height:28px;background:#8b5cf6;border:2px solid #f6f2ff;color:#150b22;display:flex;align-items:center;justify-content:center;font-weight:700;margin-bottom:16px;">S</div>
      <h1 style="font-size:20px;margin:0 0 12px;color:#f6f2ff;">${title}</h1>
      <div style="font-size:14px; line-height:1.6; color:#dccff5;">
        ${bodyHtml}
      </div>
    </div>
  </div>`;
}

function buttonHtml(url: string, label: string): string {
  return `<p style="margin:20px 0;"><a href="${url}" style="background:#8b5cf6;border:2px solid #f6f2ff;color:#150b22;padding:10px 18px;text-decoration:none;font-weight:700;font-size:14px;display:inline-block;">${label}</a></p>
  <p style="font-size:12px;color:#a996c9;word-break:break-all;">${url}</p>`;
}

export function resetPasswordEmailHtml(name: string, resetUrl: string): string {
  return emailShell(
    "Restablecé tu contraseña",
    `<p>Hola ${name},</p>
     <p>Pediste restablecer tu contraseña de SCRUM ProShop. Hacé clic para elegir una nueva:</p>
     ${buttonHtml(resetUrl, "Restablecer contraseña")}
     <p>Este link expira en 1 hora. Si no pediste esto, podés ignorar este correo -- tu contraseña actual sigue siendo válida.</p>`
  );
}
