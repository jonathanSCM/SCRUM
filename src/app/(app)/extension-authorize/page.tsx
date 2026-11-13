import { requireSession } from "@/lib/session";
import ExtensionConnect from "./ExtensionConnect";

export const metadata = { title: "Conectar la extensión de Meet" };

export default async function ExtensionAuthorizePage() {
  const session = await requireSession();
  return (
    <main className="mx-auto w-full max-w-xl px-4 pb-16 pt-10 sm:px-6">
      <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink">Extensión de Meet</h1>
      <p className="mt-1 text-sm text-ink-soft">Conecta la extensión de Chrome a tu cuenta, <b className="text-ink">{session.user.name}</b>, para guardar en el calendario los subtítulos y el audio de las reuniones que tú decidas grabar.</p>
      <ExtensionConnect />
    </main>
  );
}
