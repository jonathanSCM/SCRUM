import { requireWorkspace } from "@/lib/session";
import { loadMessages } from "@/lib/chatData";
import { channelFilter, ensureChannels } from "@/lib/chatChannels";
import ChatView from "@/components/chat/ChatView";
import ChannelTabs from "@/components/chat/ChannelTabs";

export const metadata = { title: "Chat" };

export default async function ChatPage({ searchParams }: { searchParams: Promise<{ canal?: string }> }) {
  const ws = await requireWorkspace();
  const { canal } = await searchParams;
  const channels = await ensureChannels(ws.workspaceId);
  const active = channels.find((c) => c.id === canal) ?? channels.find((c) => c.kind === "GENERAL")!;
  const initial = await loadMessages({ workspaceId: ws.workspaceId, channel: await channelFilter(ws.workspaceId, active.id) });
  return (
    <main className="mx-auto w-full max-w-4xl px-0 pb-0 pt-0 sm:px-6 sm:pb-10 sm:pt-8">
      <h1 className="hidden font-display text-3xl font-extrabold tracking-tight text-ink sm:block">Chat del equipo</h1>
      <p className="mb-3 hidden text-sm text-ink-soft sm:block">
        Escribí <b>#</b> para mencionar un proyecto (y luego su sprint o ticket) y <b>@</b> para avisarle a alguien. Las convocatorias con <b>/reunion</b> quedan en el canal Reuniones.
      </p>
      <ChannelTabs channels={channels} activeId={active.id} canManage={ws.isLead} />
      <ChatView key={active.id} initial={initial} currentUserId={ws.session.user.id} currentUserName={ws.session.user.name ?? ""} isLead={ws.isLead} channelId={active.id} fill />
    </main>
  );
}
