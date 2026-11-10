import { requireWorkspace } from "@/lib/session";
import { loadMessages } from "@/lib/chatData";
import { channelFilter, channelSummaries } from "@/lib/chatChannels";
import { membersOf } from "@/lib/workspace";
import ChatShell from "@/components/chat/ChatShell";

export const metadata = { title: "Chat" };

export default async function ChatPage({ searchParams }: { searchParams: Promise<{ canal?: string }> }) {
  const ws = await requireWorkspace();
  const { canal } = await searchParams;
  const channels = await channelSummaries(ws.workspaceId, ws.session.user.id);
  const active = channels.find((c) => c.id === canal) ?? null;
  const me = ws.session.user.id;
  const initial = active ? await loadMessages({ workspaceId: ws.workspaceId, viewerId: me, channel: await channelFilter(ws.workspaceId, active.id, me) }) : [];
  const people = (await membersOf(ws.workspaceId)).filter((m) => m.id !== me).map(({ id, name }) => ({ id, name }));
  return <ChatShell channels={channels} activeId={active?.id ?? null} initialMessages={initial} currentUserId={ws.session.user.id} currentUserName={ws.session.user.name ?? ""} isLead={ws.isLead} people={people} />;
}
