"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, UtensilsCrossed, ClipboardList, BarChart3, CreditCard, Settings, Store } from "lucide-react";
import { cn } from "@ride-it/ui";
import { useAuth } from "@ride-it/auth";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/menu", label: "Menu", icon: UtensilsCrossed },
  { href: "/orders", label: "Orders", icon: ClipboardList },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/subscription", label: "Subscription", icon: CreditCard },
  { href: "/settings", label: "Settings", icon: Settings },
];

/** Desktop-first sidebar nav, matching Admin's dense/professional layout convention per DESIGN_SYSTEM.md — this is a business operations tool, not a mobile-first consumer surface. */
export function RestaurantNav() {
  const pathname = usePathname();
  const { profile, signOut } = useAuth();

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex items-center gap-2 border-b border-border px-5 py-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-signal-blue text-white">
          <Store size={18} />
        </span>
        <div>
          <p className="font-display text-sm font-bold text-ink">Ridora Food</p>
          <p className="text-xs text-ink-soft">Restaurant Partner</p>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 p-3">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname?.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active ? "bg-tint-blue text-signal-blue" : "text-ink-soft hover:bg-ink/5"
              )}
            >
              <Icon size={17} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border p-3">
        <p className="truncate px-3 text-xs text-ink-soft">{profile?.fullName ?? profile?.phone ?? profile?.email}</p>
        <button onClick={() => signOut()} className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-alert-red-text hover:bg-alert-red/5">
          Sign out
        </button>
      </div>
    </aside>
  );
}
