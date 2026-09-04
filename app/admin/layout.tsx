import type { ReactNode } from "react";
import { AuthGuard } from "@/components/dashboard/auth-guard";
import { PlatformAdminGuard } from "@/components/admin/platform-admin-guard";
import { AdminShell } from "@/components/admin/admin-shell";
import { DashboardPreferencesProvider } from "@/components/dashboard/dashboard-preferences";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <DashboardPreferencesProvider>
      <div className="nexo-dashboard min-h-screen bg-[#f4f6fb] text-[#0f172a]">
        <AuthGuard>
          <PlatformAdminGuard>
            <AdminShell>{children}</AdminShell>
          </PlatformAdminGuard>
        </AuthGuard>
      </div>
    </DashboardPreferencesProvider>
  );
}
