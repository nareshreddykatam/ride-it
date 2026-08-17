"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { TrendingUp } from "lucide-react";
import { cn, HomeIcon, WalletIcon, DriverIcon } from "@ride-it/ui";

const TABS = [
  { href: "/dashboard", label: "Dashboard", icon: HomeIcon },
  { href: "/earnings", label: "Earnings", icon: TrendingUp },
  { href: "/wallet", label: "Wallet", icon: WalletIcon },
  { href: "/profile", label: "Profile", icon: DriverIcon },
];

export function DriverTabBar() {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();

  return (
    <nav
      aria-label="Primary"
      className="sticky bottom-0 flex border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]"
    >
      {TABS.map(({ href, label, icon: Icon }) => {
        const active = pathname?.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className="relative flex flex-1 flex-col items-center gap-1 py-2.5 text-xs"
          >
            {active && (
              <motion.span
                layoutId="driver-tab-pill"
                className="absolute top-0.5 h-0.5 w-8 rounded-full bg-signal-blue"
                transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
            <Icon size={20} strokeWidth={active ? 2.2 : 1.8} className={active ? "text-signal-blue" : "text-ink-soft"} />
            <span className={cn(active ? "font-medium text-signal-blue" : "text-ink-soft")}>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
