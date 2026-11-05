import { requireSession } from "@/lib/session";
import { getProjectOrNotFound } from "@/lib/projectData";
import { loadMessages } from "@/lib/chatData";
import ChatView from "@/components/chat/ChatView";

// El chat del proyecto es el chat general filtrado: solo los mensajes que mencionan este proyecto.
export default async function ProjectChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const project = await getProjectOrNotFound(id);
  const initial = await loadMessages({ workspaceId: project.access.workspaceId, projectId: id });
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-soft">
        Mensajes del <a href="/chat" className="font-semibold text-rust hover:underline">chat general</a> que mencionan a <b>{project.name}</b>. Lo que escribas acá también aparece allá, con el proyecto mencionado.
      </p>
      <ChatView initial={initial} currentUserId={session.user.id} isLead={project.access.isLead} projectId={id} />
    </div>
  );
}
