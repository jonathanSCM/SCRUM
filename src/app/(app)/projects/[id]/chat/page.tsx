import Link from "next/link";
import { getProjectOrNotFound } from "@/lib/projectData";
import { loadMessages } from "@/lib/chatData";
import { channelFilter, ensureChannels } from "@/lib/chatChannels";
import ChatView from "@/components/chat/ChatView";

export const metadata = { title: "Chat del proyecto" };

// El chat del proyecto es el canal de ese proyecto (el mismo que aparece en la lista de Chat, en "Proyectos").
export default async function ProjectChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProjectOrNotFound(id);
  const workspaceId = project.access.workspaceId;
  const channel = (await ensureChannels(workspaceId, project.access.session.user.id)).find((c) => c.projectId === id);
  if (!channel) return <p className="text-sm text-ink-faint">No se pudo abrir el chat de este proyecto.</p>;
  const initial = await loadMessages({ workspaceId, viewerId: project.access.session.user.id, channel: await channelFilter(workspaceId, channel.id, project.access.session.user.id) });
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-soft">
        Canal de <b>{project.name}</b>: lo que se escriba aquí es solo de este proyecto. También lo ves, junto a los demás canales, en{" "}
        <Link href={`/chat?canal=${channel.id}`} className="font-semibold text-rust hover:underline">Chat a pantalla completa</Link>. Escribe <b>#</b> para mencionar un sprint o ticket de este proyecto.
      </p>
      <ChatView key={channel.id} initial={initial} currentUserId={project.access.session.user.id} currentUserName={project.access.session.user.name ?? ""} isLead={project.access.isLead} channelId={channel.id} mentionProjectId={id} />
    </div>
  );
}
