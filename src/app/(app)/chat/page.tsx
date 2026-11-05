import { requireSession } from "@/lib/session";
import { loadMessages } from "@/lib/chatData";
import ChatView from "@/components/chat/ChatView";

export default async function ChatPage() {
  const session = await requireSession();
  const initial = await loadMessages();
  return (
    <main className="mx-auto w-full max-w-4xl px-4 pb-10 pt-8 sm:px-6">
      <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink">Chat del equipo</h1>
      <p className="mb-5 text-sm text-ink-soft">Escribí <b>#</b> para mencionar un proyecto, ticket o sprint, y <b>@</b> para avisarle a alguien.</p>
      <ChatView initial={initial} currentUserId={session.user.id} isLead={session.user.role === "LEAD"} />
    </main>
  );
}
