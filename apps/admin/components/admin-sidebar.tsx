"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BottomSheet, cn } from "@ride-it/ui";
import { useAuth } from "@ride-it/auth";
import {
  LayoutDashboard,
  Users,
  Car,
  CreditCard,
  BarChart3,
  Settings,
  ShieldAlert,
  ShieldCheck,
  LogOut,
  MapPin,
  LifeBuoy,
  Menu,
  X,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/drivers", label: "Drivers", icon: Car },
  { href: "/passengers", label: "Passengers", icon: Users },
  { href: "/rides", label: "Live Rides", icon: ShieldAlert },
  { href: "/safety", label: "Safety", icon: LifeBuoy },
  { href: "/subscriptions", label: "Subscriptions", icon: CreditCard },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/cities", label: "Cities", icon: MapPin },
  { href: "/admin-users", label: "Admin Users", icon: ShieldCheck },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { signOut } = useAuth();
  const [signingOut, setSigningOut] = React.useState(false);

  async function handleLogout() {
    setSigningOut(true);
    try {
      await signOut();
      router.push("/login");
    } catch {
      setSigningOut(false);
    }
  }

  return (
    <aside className="hidden h-dvh w-60 shrink-0 flex-col border-r border-border bg-white px-3 py-4 lg:flex">
      <div className="mb-6 px-2">
        <p className="font-display text-lg font-medium text-ink-blue">Ride It</p>
        <p className="text-xs text-ink-soft">Admin</p>
      </div>
      <nav aria-label="Admin" className="flex flex-1 flex-col gap-0.5">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname?.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
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
      <button
        onClick={handleLogout}
        disabled={signingOut}
        className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-ink-soft transition-colors hover:bg-ink/5 hover:text-alert-red disabled:opacity-50"
      >
        <LogOut size={17} strokeWidth={2} />
        {signingOut ? "Signing out…" : "Log out"}
      </button>
    </aside>
  );
}

/**
 * Below `lg`, the persistent sidebar above is hidden entirely — this is
 * the only way into admin navigation on tablet/mobile, so it isn't
 * optional chrome. Topbar + BottomSheet drawer, same pattern as
 * Marketing's mobile nav.
 */
export function AdminMobileNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { signOut } = useAuth();
  const [open, setOpen] = React.useState(false);
  const [signingOut, setSigningOut] = React.useState(false);

  async function handleLogout() {
    setSigningOut(true);
    try {
      await signOut();
      router.push("/login");
    } catch {
      setSigningOut(false);
    }
  }

  return (
    <header className="flex items-center justify-between border-b border-border bg-white px-4 py-3 lg:hidden">
      <div>
        <p className="font-display text-base font-medium text-ink-blue">Ride It</p>
        <p className="text-xs text-ink-soft">Admin</p>
      </div>
      <button
        type="button"
        aria-label="Open menu"
        onClick={() => setOpen(true)}
        className="-m-2.5 p-2.5 text-ink"
      >
        <Menu size={22} />
      </button>

      <BottomSheet open={open} onOpenChange={setOpen}>
        <div className="flex items-center justify-between">
          <p className="font-display text-base font-medium text-ink">Menu</p>
          <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="-m-2.5 p-2.5 text-ink-soft">
            <X size={20} />
          </button>
        </div>
        <nav aria-label="Admin" className="mt-4 flex flex-col gap-0.5">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = pathname?.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-3 text-sm font-medium transition-colors",
                  active ? "bg-signal-blue/10 text-signal-blue" : "text-ink hover:bg-ink/5"
                )}
              >
                <Icon size={18} strokeWidth={2} />
                {label}
              </Link>
            );
          })}
          <button
            onClick={handleLogout}
            disabled={signingOut}
            className="mt-2 flex items-center gap-2.5 rounded-lg px-3 py-3 text-sm font-medium text-ink-soft transition-colors hover:bg-ink/5 hover:text-alert-red disabled:opacity-50"
          >
            <LogOut size={18} strokeWidth={2} />
            {signingOut ? "Signing out…" : "Log out"}
          </button>
        </nav>
      </BottomSheet>
    </header>
  );
}
