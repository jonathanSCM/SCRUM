import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import InviteAccept from "./InviteAccept";

export const metadata = { title: "Invitación" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const session = await getServerSession(authOptions);
  return <InviteAccept token={token} sessionEmail={session?.user?.email ?? null} />;
}
