import { requireSession } from "@/lib/session";
import { loadMessages } from "@/lib/chatData";
import ChatView from "@/components/chat/ChatView";

export default async function ChatPage() {
  const session = await requireSession();
  const initial = await loadMessages();
  return (
    <main className="mx-auto w-full max-w-4xl px-0 pb-0 pt-0 sm:px-6 sm:pb-10 sm:pt-8">
      <h1 className="hidden font-display text-3xl font-extrabold tracking-tight text-ink sm:block">Chat del equipo</h1>
      <p className="mb-5 hidden text-sm text-ink-soft sm:block">Escribí <b>#</b> para mencionar un proyecto, ticket o sprint, y <b>@</b> para avisarle a alguien.</p>
      <ChatView initial={initial} currentUserId={session.user.id} isLead={session.user.role === "LEAD"} fill />
    </main>
  );
}
