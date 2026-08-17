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

// Nav items grouped into two labeled sections so the 10-item list scans
// faster — operational monitoring vs. platform configuration.
const NAV_SECTIONS: { label: string; items: typeof NAV_ITEMS }[] = [
  {
    label: "Operations",
    items: NAV_ITEMS.slice(0, 6),
  },
  {
    label: "Platform",
    items: NAV_ITEMS.slice(6),
  },
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
    <aside className="hidden h-dvh w-64 shrink-0 flex-col border-r border-border bg-ink-blue/[0.03] lg:flex">
      <div className="relative overflow-hidden bg-gradient-brand px-5 py-5">
        <p className="font-display text-lg font-medium text-white">Ride It</p>
        <p className="text-xs font-medium uppercase tracking-wide text-white/70">Admin Console</p>
      </div>
      <nav aria-label="Admin" className="flex flex-1 flex-col gap-4 overflow-y-auto px-3 py-4">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-ink-soft/70">
              {section.label}
            </p>
            <div className="flex flex-col gap-0.5">
              {section.items.map(({ href, label, icon: Icon }) => {
                const active = pathname?.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-signal-blue text-white shadow-sm"
                        : "text-ink-soft hover:bg-signal-blue/10 hover:text-signal-blue"
                    )}
                  >
                    {active && (
                      <span
                        aria-hidden="true"
                        className="absolute -left-3 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-marigold"
                      />
                    )}
                    <Icon size={17} strokeWidth={2} className={active ? "text-white" : "text-ink-soft group-hover:text-signal-blue"} />
                    {label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-border px-3 py-3">
        <button
          onClick={handleLogout}
          disabled={signingOut}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-ink-soft transition-colors hover:bg-alert-red/10 hover:text-alert-red disabled:opacity-50"
        >
          <LogOut size={17} strokeWidth={2} />
          {signingOut ? "Signing out…" : "Log out"}
        </button>
      </div>
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
    <header className="flex items-center justify-between bg-gradient-brand px-4 py-3 shadow-sm lg:hidden">
      <div>
        <p className="font-display text-base font-medium text-white">Ride It</p>
        <p className="text-xs font-medium uppercase tracking-wide text-white/70">Admin Console</p>
      </div>
      <button
        type="button"
        aria-label="Open menu"
        onClick={() => setOpen(true)}
        className="-m-2.5 rounded-lg p-2.5 text-white hover:bg-white/10"
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
        <nav aria-label="Admin" className="mt-4 flex flex-col gap-4">
          {NAV_SECTIONS.map((section) => (
            <div key={section.label}>
              <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-ink-soft/70">
                {section.label}
              </p>
              <div className="flex flex-col gap-0.5">
                {section.items.map(({ href, label, icon: Icon }) => {
                  const active = pathname?.startsWith(href);
                  return (
                    <Link
                      key={href}
                      href={href}
                      aria-current={active ? "page" : undefined}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg px-3 py-3 text-sm font-medium transition-colors",
                        active ? "bg-signal-blue text-white shadow-sm" : "text-ink hover:bg-ink/5"
                      )}
                    >
                      <Icon size={18} strokeWidth={2} />
                      {label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
          <button
            onClick={handleLogout}
            disabled={signingOut}
            className="mt-1 flex items-center gap-2.5 rounded-lg border-t border-border px-3 py-3 pt-4 text-sm font-medium text-ink-soft transition-colors hover:bg-alert-red/10 hover:text-alert-red disabled:opacity-50"
          >
            <LogOut size={18} strokeWidth={2} />
            {signingOut ? "Signing out…" : "Log out"}
          </button>
        </nav>
      </BottomSheet>
    </header>
  );
}
