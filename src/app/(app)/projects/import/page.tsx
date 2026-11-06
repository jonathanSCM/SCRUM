import { requireWorkspace } from "@/lib/session";
import ImportFromAi from "./ImportFromAi";

export const metadata = { title: "Importar con IA" };

export default async function ImportPage() {
  await requireWorkspace();
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="mb-1 font-display text-3xl font-extrabold tracking-tight text-ink">Importar con IA</h1>
      <p className="mb-7 text-sm text-ink-soft">
        Para cualquier asistente que no pueda usar un token (por ejemplo ChatGPT gratis): él escribe el proyecto en JSON y lo pegas aquí. Se carga a tu nombre, igual que con el token.
      </p>
      <ImportFromAi />
    </main>
  );
}
