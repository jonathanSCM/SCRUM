import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import ProfileForm from "./ProfileForm";

export default async function ProfilePage() {
  const session = await requireSession();
  const me = await prisma.user.findUnique({ where: { id: session.user.id }, select: { name: true, email: true, role: true, discordUserId: true, telegramUsername: true, slackUserId: true } });

  return (
    <main className="mx-auto max-w-xl px-4 py-10 sm:px-6">
      <h1 className="mb-1 font-display text-3xl font-extrabold tracking-tight text-ink">Mi perfil</h1>
      <p className="mb-7 text-sm text-ink-soft">{me?.email} · {me?.role === "LEAD" ? "Líder" : "Miembro"}</p>
      <ProfileForm name={me?.name ?? ""} discordUserId={me?.discordUserId ?? ""} telegramUsername={me?.telegramUsername ?? ""} slackUserId={me?.slackUserId ?? ""} />
    </main>
  );
}
