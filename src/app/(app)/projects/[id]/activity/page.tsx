import { prisma } from "@/lib/prisma";
import { getProjectOrNotFound } from "@/lib/projectData";
import { describeHistory } from "@/lib/historyText";
import { formatDateTime, timeAgo } from "@/lib/ui";
import Avatar from "@/components/ui/Avatar";
import EmptyState from "@/components/ui/EmptyState";

export const metadata = { title: "Actividad" };

export default async function ActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await getProjectOrNotFound(id);
  const entries = await prisma.historyEntry.findMany({ where: { projectId: id }, orderBy: { changedAt: "desc" }, take: 200 });

  if (entries.length === 0) return <EmptyState title="Sin actividad todavía" hint="Acá vas a ver cada cambio del proyecto: tickets, sprints y ajustes." />;

  return (
    <ol className="border border-line bg-card rounded-lg overflow-hidden">
      {entries.map((e) => {
        const { label, detail } = describeHistory(e);
        return (
          <li key={e.id} className="flex items-start gap-3 border-b border-line-strong px-4 py-3 last:border-b-0">
            <Avatar name={e.changedByName} userId={e.changedById} size={26} />
            <div className="min-w-0 flex-1 text-sm">
              <p className="text-ink">
                <b>{e.changedByName ?? "Sistema"}</b> <span className="text-ink-soft">· {label}</span>
              </p>
              {detail && <p className="truncate text-xs text-ink-faint">{detail}</p>}
            </div>
            <time className="shrink-0 text-xs text-ink-faint" title={formatDateTime(e.changedAt.toISOString())}>
              {timeAgo(e.changedAt.toISOString())}
            </time>
          </li>
        );
      })}
    </ol>
  );
}
