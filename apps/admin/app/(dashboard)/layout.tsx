"use client";

import { RequireRole } from "@ride-it/auth";
import { AdminSidebar, AdminMobileNav } from "../../components/admin-sidebar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireRole role="admin">
      <div className="flex min-h-dvh flex-col lg:flex-row">
        <AdminSidebar />
        <div className="flex flex-1 flex-col overflow-x-hidden">
          <AdminMobileNav />
          <main className="flex-1 overflow-y-auto px-4 py-4 lg:px-8 lg:py-6">{children}</main>
        </div>
      </div>
    </RequireRole>
  );
}
