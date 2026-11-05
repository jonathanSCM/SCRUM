import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { getProfile } from "@/lib/profileData";
import { compareLabel } from "@/lib/scrum/weekly";
import { STATUS_META, type IssueStatus } from "@/lib/scrum/constants";
import { formatDate } from "@/lib/ui";
import Avatar from "@/components/ui/Avatar";

type Tile = { label: string; value: number; previous: number; hint?: string };

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await getProfile(id);
  return { title: p ? p.user.name : "Perfil" };
}

export default async function PublicProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const profile = await getProfile(id);
  if (!profile) notFound();
  const { user, week } = profile;
  const mine = session.user.id === user.id;

  const tiles: Tile[] = [
    { label: "Tickets terminados", value: week.completed.value, previous: week.completed.previous, hint: week.points > 0 ? `${week.points} pts` : undefined },
    { label: "Tickets creados", value: week.created.value, previous: week.created.previous },
    { label: "Comentarios", value: week.comments.value, previous: week.comments.previous },
    { label: "Notas", value: week.notes.value, previous: week.notes.previous },
    { label: "Dailys", value: week.dailys.value, previous: week.dailys.previous },
  ];

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-16 pt-6 sm:px-6">
      {/* Banner (sin degradados: color sólido de la marca si no hay imagen) */}
      <div className="relative h-32 overflow-hidden rounded-xl bg-rust sm:h-48">
        {user.hasBanner && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/users/${user.id}/image/banner`} alt="" className="h-full w-full object-cover" />
        )}
      </div>

      <div className="relative -mt-14 flex flex-col gap-2 px-2 sm:flex-row sm:items-end sm:gap-4 sm:px-5">
        <div className="w-fit self-start rounded-full border-4 border-paper bg-paper">
          <Avatar name={user.name} userId={user.id} color={user.color} size={104} />
        </div>
        <div className="min-w-0 flex-1 pb-1 sm:pt-14">
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">{user.name}</h1>
          <p className="text-sm text-ink-soft">
            <span className="lozenge mr-2 align-middle text-ink-soft">{user.role === "LEAD" ? "Líder" : "Miembro"}</span>
            {user.tagline}
          </p>
          <p className="text-xs text-ink-faint">En el equipo desde {formatDate(user.memberSince, { day: "numeric", month: "long", year: "numeric" })}</p>
        </div>
        {mine && (
          <Link href="/settings/profile" className="btn-ghost btn-sm mb-1 self-start sm:self-auto">Editar mi perfil</Link>
        )}
      </div>

      {/* Resumen de la semana */}
      <section className="mt-8">
        <h2 className="mb-3 font-display text-lg font-extrabold text-ink">Esta semana <span className="text-sm font-medium text-ink-faint">· últimos 7 días</span></h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {tiles.map((t) => {
            const cmp = compareLabel(t.value, t.previous);
            return (
              <div key={t.label} className="rounded-lg border border-line bg-card p-4">
                <p className="text-xs font-semibold text-ink-faint">{t.label}</p>
                <p className="font-display text-3xl font-extrabold text-ink">
                  {t.value}
                  {t.hint && <span className="ml-1.5 text-xs font-medium text-ink-faint">{t.hint}</span>}
                </p>
                <p className={`text-[11px] ${cmp.tone === "up" ? "text-moss-ink" : cmp.tone === "down" ? "text-warn" : "text-ink-faint"}`}>{cmp.text}</p>
              </div>
            );
          })}
        </div>
      </section>

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        {/* Proyectos activos */}
        <section>
          <h2 className="mb-3 font-display text-lg font-extrabold text-ink">Proyectos activos</h2>
          {profile.projects.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line-strong p-5 text-sm text-ink-faint">Sin actividad en proyectos esta semana.</p>
          ) : (
            <ul className="space-y-2">
              {profile.projects.map((p) => (
                <li key={p.id}>
                  <Link href={`/projects/${p.id}/board`} className="lift block rounded-lg border border-line bg-card p-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] font-bold text-moss-ink">{p.key}</span>
                      <span className="min-w-0 flex-1 truncate font-display text-base font-extrabold text-ink">{p.name}</span>
                      {p.sprint && <span className="lozenge text-moss-ink">{p.sprint}</span>}
                    </div>
                    <p className="mt-1 font-mono text-[11px] text-ink-faint">
                      {p.open} abiertos · {p.completed} terminados esta semana{p.created ? ` · ${p.created} creados` : ""}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* En curso */}
        <section>
          <h2 className="mb-3 font-display text-lg font-extrabold text-ink">En curso ahora</h2>
          {profile.inProgress.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line-strong p-5 text-sm text-ink-faint">Nada en progreso.</p>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-card">
              {profile.inProgress.map((t) => (
                <li key={t.key}>
                  <Link href={`/projects/${t.projectId}/backlog?issue=${t.key}`} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-card-2">
                    <span className="font-mono text-xs text-ink-faint">{t.key}</span>
                    <span className="min-w-0 flex-1 truncate text-ink">{t.title}</span>
                    <span className="lozenge" style={{ color: STATUS_META[t.status as IssueStatus]?.color }}>{STATUS_META[t.status as IssueStatus]?.label ?? t.status}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Lo terminado */}
      <section className="mt-8">
        <h2 className="mb-3 font-display text-lg font-extrabold text-ink">Terminó esta semana</h2>
        {profile.doneList.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line-strong p-5 text-sm text-ink-faint">Todavía no terminó tickets esta semana.</p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-card">
            {profile.doneList.map((t) => (
              <li key={t.key}>
                <Link href={`/projects/${t.projectId}/backlog?issue=${t.key}`} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-card-2">
                  <span className="font-mono text-xs text-ink-faint">{t.key}</span>
                  <span className="min-w-0 flex-1 truncate text-ink">{t.title}</span>
                  <span className="hidden text-xs text-ink-faint sm:inline">{t.projectName}</span>
                  {t.points != null && <span className="font-mono text-[11px] text-ink-faint">{t.points} pts</span>}
                  {t.at && <span className="text-xs text-ink-faint">{formatDate(t.at)}</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="mt-6 text-xs text-ink-faint">El resumen cuenta tickets, notas y dailys. No incluye el chat.</p>
    </main>
  );
}
