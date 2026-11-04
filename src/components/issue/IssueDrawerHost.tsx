"use client";

import { Suspense } from "react";
import { useSession } from "next-auth/react";
import IssueDrawer from "./IssueDrawer";

// Monta el panel de tickets en toda la app (solo con sesión iniciada).
export default function IssueDrawerHost() {
  const { data } = useSession();
  if (!data?.user) return null;
  return (
    <Suspense fallback={null}>
      <IssueDrawer currentUserId={data.user.id} currentUserRole={data.user.role} />
    </Suspense>
  );
}
