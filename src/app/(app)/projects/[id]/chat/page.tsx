import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { getProjectOrNotFound } from "@/lib/projectData";
import ChatView, { type ChatMessage } from "./ChatView";

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  await getProjectOrNotFound(id);

  const rows = await prisma.projectMessage.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { author: { select: { id: true, name: true } } },
  });
  const initial: ChatMessage[] = rows.reverse().map((m) => ({ id: m.id, body: m.body, createdAt: m.createdAt.toISOString(), author: m.author }));

  return <ChatView projectId={id} initial={initial} currentUserId={session.user.id} isLead={session.user.role === "LEAD"} />;
}
