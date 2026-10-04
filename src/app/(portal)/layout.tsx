import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen grid place-items-center">Loading PyLearn…</div>}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}

