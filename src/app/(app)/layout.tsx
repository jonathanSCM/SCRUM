import Navbar from "@/components/Navbar";
import { requireSession } from "@/lib/session";

// Todas las pantallas con sesión comparten la barra superior.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar userName={session.user.name ?? session.user.email ?? ""} userId={session.user.id} isLead={session.user.role === "LEAD"} />
      <div className="flex-1">{children}</div>
    </div>
  );
}
