import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { roleBadge, normalizeRole } from "@/lib/scrum/roles";
import ProfileForm from "./ProfileForm";

export const metadata = { title: "Editar perfil" };

export default async function ProfilePage() {
  const session = await requireSession();
  const mine = await prisma.membership.findMany({ where: { userId: session.user.id }, orderBy: { createdAt: "asc" }, select: { role: true, workspace: { select: { name: true } } } });
  const me = await prisma.user.findUnique({ where: { id: session.user.id }, select: { name: true, email: true, discordUserId: true, telegramUsername: true, slackUserId: true, chatColor: true, tagline: true, images: { select: { kind: true } } } });

  return (
    <main className="mx-auto max-w-xl px-4 py-10 sm:px-6">
      <h1 className="mb-1 font-display text-3xl font-extrabold tracking-tight text-ink">Editar perfil</h1>
      <p className="mb-2 text-sm text-ink-soft">{me?.email} · <a href={`/people/${session.user.id}`} className="font-semibold text-rust hover:underline">Volver a mi perfil</a> · <a href="/settings" className="font-semibold text-rust hover:underline">Ajustes</a></p>
      <p className="mb-7 flex flex-wrap gap-1.5">
        {mine.map((m) => (
          <span key={m.workspace.name} className={`lozenge ${m.role === "OWNER" ? "text-rust" : "text-ink-soft"}`}>{roleBadge(normalizeRole(m.role), m.workspace.name)}</span>
        ))}
      </p>
      <ProfileForm name={me?.name ?? ""} discordUserId={me?.discordUserId ?? ""} telegramUsername={me?.telegramUsername ?? ""} slackUserId={me?.slackUserId ?? ""} chatColor={me?.chatColor ?? ""} userId={session.user.id} tagline={me?.tagline ?? ""} hasAvatar={!!me?.images.some((i) => i.kind === "AVATAR")} hasBanner={!!me?.images.some((i) => i.kind === "BANNER")} />
    </main>
  );
}
