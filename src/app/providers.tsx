"use client";

import { SessionProvider } from "next-auth/react";
import { MotionConfig } from "motion/react";
import ConfirmDialogProvider from "@/components/ConfirmDialog";
import ToastProvider from "@/components/ui/Toaster";
import { ServiceWorkerRegister } from "@/components/PwaControls";
import AppVersionGuard from "@/components/AppVersionGuard";
import IssueDrawerHost from "@/components/issue/IssueDrawerHost";

export default function Providers({ children, buildId = "" }: { children: React.ReactNode; buildId?: string }) {
  return (
    <SessionProvider>
      <MotionConfig reducedMotion="user">
        <ToastProvider>
          <ConfirmDialogProvider>
            {children}
            <IssueDrawerHost />
            <ServiceWorkerRegister />
            <AppVersionGuard clientBuild={buildId} />
          </ConfirmDialogProvider>
        </ToastProvider>
      </MotionConfig>
    </SessionProvider>
  );
}
