import Link from "next/link";
import { requireSession } from "@/lib/session";
import { getPeople } from "@/lib/profileData";
import Avatar from "@/components/ui/Avatar";

export const metadata = { title: "Personas" };

export default async function PeoplePage() {
  const session = await requireSession();
  const people = await getPeople();
  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-16 pt-8 sm:px-6">
      <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink">Personas</h1>
      <p className="mb-6 text-sm text-ink-soft">El equipo: haz clic en alguien para ver en qué proyectos está activo y qué hizo esta semana.</p>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {people.map((p) => (
          <li key={p.id}>
            <Link href={`/people/${p.id}`} className="lift flex items-center gap-3 rounded-lg border border-line bg-card p-4">
              <Avatar name={p.name} userId={p.id} color={p.chatColor} size={48} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-base font-extrabold text-ink">
                  {p.name}
                  {p.id === session.user.id && <span className="ml-1.5 text-xs font-medium text-ink-faint">(vos)</span>}
                </p>
                <p className="truncate text-xs text-ink-soft">{p.tagline || (p.role === "LEAD" ? "Líder" : "Miembro")}</p>
                <p className="mt-1 font-mono text-[11px] text-ink-faint">
                  {p.open} abiertos · {p.doneWeek} terminados esta semana
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
