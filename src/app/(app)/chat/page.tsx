import { requireWorkspace } from "@/lib/session";
import { loadMessages } from "@/lib/chatData";
import { channelFilter, channelSummaries } from "@/lib/chatChannels";
import ChatShell from "@/components/chat/ChatShell";

export const metadata = { title: "Chat" };

export default async function ChatPage({ searchParams }: { searchParams: Promise<{ canal?: string }> }) {
  const ws = await requireWorkspace();
  const { canal } = await searchParams;
  const channels = await channelSummaries(ws.workspaceId, ws.session.user.id);
  const active = channels.find((c) => c.id === canal) ?? null;
  const initial = active ? await loadMessages({ workspaceId: ws.workspaceId, channel: await channelFilter(ws.workspaceId, active.id) }) : [];
  return <ChatShell channels={channels} activeId={active?.id ?? null} initialMessages={initial} currentUserId={ws.session.user.id} currentUserName={ws.session.user.name ?? ""} isLead={ws.isLead} />;
}
