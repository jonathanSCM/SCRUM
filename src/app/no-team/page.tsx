import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { activeAccess } from "@/lib/workspace";
import SignOutButton from "./SignOutButton";

export const metadata = { title: "Sin equipo" };

// Una cuenta sin ningún equipo (por ejemplo, la sacaron de todos). No hay bucle de redirecciones:
// esta página no exige equipo.
export default async function NoTeamPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  if (await activeAccess(session.user.id)) redirect("/home");
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="font-display text-2xl font-extrabold text-ink">Todavía no estás en ningún equipo</h1>
      <p className="text-sm text-ink-soft">Pídele a quien administra tu equipo que te agregue o te invite. Cuando lo haga, entra de nuevo y vas a ver sus proyectos.</p>
      <SignOutButton />
    </main>
  );
}
