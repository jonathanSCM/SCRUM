import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";

export async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  return session;
}

export async function requireLead() {
  const session = await requireSession();
  if (session.user.role !== "LEAD") redirect("/dashboard");
  return session;
}
