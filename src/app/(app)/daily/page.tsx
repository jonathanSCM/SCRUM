import { requireWorkspace } from "@/lib/session";
import DailyView from "./DailyView";

export const metadata = { title: "Daily" };

// Daily GENERAL del equipo: una sola vez al día para todos los proyectos.
export default async function DailyPage() {
  const { session } = await requireWorkspace();
  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-16 pt-8 sm:px-6">
      <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink">Daily</h1>
      <p className="mb-6 text-sm text-ink-soft">Una vez al día para todo el equipo, sin importar el proyecto. Se arma solo con tu trabajo en tickets y lo puedes editar.</p>
      <DailyView currentUserId={session.user.id} />
    </main>
  );
}
