"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@ride-it/ui";
import {
  LayoutDashboard,
  Users,
  Car,
  CreditCard,
  BarChart3,
  Settings,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/drivers", label: "Drivers", icon: Car },
  { href: "/passengers", label: "Passengers", icon: Users },
  { href: "/rides", label: "Live Rides", icon: ShieldAlert },
  { href: "/subscriptions", label: "Subscriptions", icon: CreditCard },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/admin-users", label: "Admin Users", icon: ShieldCheck },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-dvh w-60 flex-col border-r border-border bg-white px-3 py-4">
      <div className="mb-6 px-2">
        <p className="font-display text-lg font-medium text-ink-blue">Ride It</p>
        <p className="text-xs text-ink-soft">Admin</p>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname?.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active ? "bg-signal-blue/10 text-signal-blue" : "text-ink-soft hover:bg-ink/5 hover:text-ink"
              )}
            >
              <Icon size={17} strokeWidth={2} />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
