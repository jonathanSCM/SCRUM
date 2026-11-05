import { requireSession } from "@/lib/session";
import AccountSettings from "./AccountSettings";

export const metadata = { title: "Ajustes" };

export default async function SettingsPage() {
  const session = await requireSession();
  return (
    <main className="mx-auto max-w-xl px-4 py-10 sm:px-6">
      <h1 className="mb-1 font-display text-3xl font-extrabold tracking-tight text-ink">Ajustes</h1>
      <p className="mb-7 text-sm text-ink-soft">
        Tu cuenta. Para cambiar tu foto, nombre o datos públicos ve a <a href="/settings/profile" className="font-semibold text-rust hover:underline">Editar perfil</a>.
      </p>
      <AccountSettings userName={session.user.name ?? ""} />
    </main>
  );
}
