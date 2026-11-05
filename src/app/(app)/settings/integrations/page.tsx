import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/session";
import IntegrationsForm from "./IntegrationsForm";

export const metadata = { title: "Integraciones" };

export default async function IntegrationsPage() {
  const ws = await requireWorkspace();
  if (!ws.isLead) redirect("/projects");
  return (
    <main className="mx-auto max-w-xl px-4 py-10 sm:px-6">
      <h1 className="mb-1 font-display text-3xl font-extrabold tracking-tight text-ink">Integraciones</h1>
      <p className="mb-7 text-sm text-ink-soft">Claves de este equipo. Se guardan cifradas y no se vuelven a mostrar; cada equipo usa solo las suyas.</p>
      <IntegrationsForm />
    </main>
  );
}
