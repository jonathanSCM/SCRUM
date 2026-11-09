import { requireWorkspace } from "@/lib/session";
import InboxView from "./InboxView";

export const metadata = { title: "Avisos" };

export default async function NotificationsPage() {
  await requireWorkspace();
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-16 pt-8 sm:px-6">
      <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink">Avisos</h1>
      <p className="mb-6 text-sm text-ink-soft">
        Todo lo que te avisó el sistema. Las menciones y lo importante llegan al instante; lo demás se junta en un resumen. Ajusta cuándo y qué recibes en <a href="/settings" className="font-semibold text-rust hover:underline">Ajustes &gt; Notificaciones</a>.
      </p>
      <InboxView />
    </main>
  );
}
