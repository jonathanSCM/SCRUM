import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/session";
import { membersOf } from "@/lib/workspace";
import CalendarView from "@/components/calendar/CalendarView";

export const metadata = { title: "Calendario" };

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ reunion?: string }> }) {
  const ws = await requireWorkspace();
  const { reunion } = await searchParams;
  const [people, projects] = await Promise.all([
    membersOf(ws.workspaceId),
    prisma.project.findMany({ where: { workspaceId: ws.workspaceId }, orderBy: { name: "asc" }, select: { id: true, name: true, key: true } }),
  ]);
  return <CalendarView currentUserId={ws.session.user.id} isLead={ws.isLead} people={people.map(({ id, name }) => ({ id, name }))} projects={projects} openId={reunion ?? null} />;
}
