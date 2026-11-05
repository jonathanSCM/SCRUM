import Link from "next/link";
import { requireSession } from "@/lib/session";
import { getProjectOrNotFound } from "@/lib/projectData";
import { loadMessages } from "@/lib/chatData";
import ChatView from "@/components/chat/ChatView";
import { cn } from "@/lib/ui";

// Dos pestañas: "Del proyecto" (mensajes que mencionan este proyecto) y "Del equipo" (avisos generales y
// convocatorias hechas con comandos, solo para leer).
export default async function ProjectChatPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab } = await searchParams;
  const team = tab === "equipo";
  const session = await requireSession();
  const project = await getProjectOrNotFound(id);
  const workspaceId = project.access.workspaceId;
  const initial = await loadMessages({ workspaceId, ...(team ? { announce: true } : { projectId: id }) });
  const tabClass = (on: boolean) => cn("rounded-full border px-3 py-1 text-sm font-semibold", on ? "border-rust bg-chip-tint text-rust" : "border-line-strong bg-surface text-ink-soft hover:text-ink");
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5" role="tablist">
        <Link href={`/projects/${id}/chat`} role="tab" aria-selected={!team} className={tabClass(!team)}>Del proyecto</Link>
        <Link href={`/projects/${id}/chat?tab=equipo`} role="tab" aria-selected={team} className={tabClass(team)}>Del equipo</Link>
      </div>
      <p className="text-sm text-ink-soft">
        {team ? (
          <>Avisos y reuniones de todo el equipo (solo lectura). Se escriben desde el <a href="/chat" className="font-semibold text-rust hover:underline">chat del equipo</a> con /noti, /reunion, /urgente o /ayuda.</>
        ) : (
          <>Mensajes que mencionan a <b>{project.name}</b>. Lo que escribas acá también aparece en el <a href="/chat" className="font-semibold text-rust hover:underline">chat general</a>, con el proyecto mencionado.</>
        )}
      </p>
      <ChatView key={team ? "equipo" : "proyecto"} initial={initial} currentUserId={session.user.id} isLead={project.access.isLead} {...(team ? { announceOnly: true } : { projectId: id })} />
    </div>
  );
}
