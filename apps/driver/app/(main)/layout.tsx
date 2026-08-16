"use client";

import { RequireRole } from "@ride-it/auth";
import { DriverTabBar } from "../../components/driver-tab-bar";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireRole role="driver">
      <div className="flex flex-1 flex-col">
        <div className="flex flex-1 flex-col">{children}</div>
        <DriverTabBar />
      </div>
    </RequireRole>
  );
}
