import { requireLead } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import TeamManager from "./TeamManager";

export default async function TeamPage() {
  const session = await requireLead();
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, createdAt: true },
    orderBy: { name: "asc" },
  });

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="mb-1 font-display text-3xl font-extrabold tracking-tight text-ink">Equipo</h1>
      <p className="mb-7 text-sm text-ink-soft">
        Cuentas con acceso a SCRUM ProShop. No hay invitación por email: se crea la cuenta directo con una contraseña temporal.
      </p>
      <TeamManager initialUsers={users.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() }))} currentUserId={session.user.id} />
    </main>
  );
}
