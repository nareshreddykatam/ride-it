"use client";

import { RequireRole } from "@ride-it/auth";
import { PassengerTabBar } from "../../components/passenger-tab-bar";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireRole role="passenger">
      <div className="flex flex-1 flex-col">
        <div className="flex flex-1 flex-col">{children}</div>
        <PassengerTabBar />
      </div>
    </RequireRole>
  );
}
