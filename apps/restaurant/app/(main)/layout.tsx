"use client";

import { RequireRole } from "@ride-it/auth";
import { RestaurantNav } from "../../components/restaurant-nav";
import { RestaurantProvider } from "../../components/restaurant-context";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireRole role="restaurant_owner">
      <RestaurantProvider>
        <div className="flex min-h-dvh">
          <RestaurantNav />
          <div className="flex flex-1 flex-col overflow-y-auto">{children}</div>
        </div>
      </RestaurantProvider>
    </RequireRole>
  );
}
