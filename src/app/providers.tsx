"use client";

import { SessionProvider } from "next-auth/react";
import { MotionConfig } from "motion/react";
import ConfirmDialogProvider from "@/components/ConfirmDialog";
import ToastProvider from "@/components/ui/Toaster";
import IssueDrawerHost from "@/components/issue/IssueDrawerHost";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <MotionConfig reducedMotion="user">
        <ToastProvider>
          <ConfirmDialogProvider>
            {children}
            <IssueDrawerHost />
          </ConfirmDialogProvider>
        </ToastProvider>
      </MotionConfig>
    </SessionProvider>
  );
}
