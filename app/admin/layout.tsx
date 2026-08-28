import type { ReactNode } from "react";
import { AuthGuard } from "@/components/dashboard/auth-guard";
import { PlatformAdminGuard } from "@/components/admin/platform-admin-guard";
import { AdminShell } from "@/components/admin/admin-shell";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <PlatformAdminGuard>
        <AdminShell>{children}</AdminShell>
      </PlatformAdminGuard>
    </AuthGuard>
  );
}
