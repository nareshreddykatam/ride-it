"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { Home, Clock, User } from "lucide-react";
import { cn } from "@ride-it/ui";

const TABS = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/history", label: "History", icon: Clock },
  { href: "/profile", label: "Profile", icon: User },
];

export function PassengerTabBar() {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();

  return (
    <nav
      aria-label="Primary"
      className="sticky bottom-0 flex border-t border-border bg-surface/95 backdrop-blur-sm pb-[env(safe-area-inset-bottom)]"
    >
      {TABS.map(({ href, label, icon: Icon }) => {
        const active = pathname?.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex min-h-[44px] flex-1 flex-col items-center gap-0.5 py-2.5 text-xs transition-colors",
              active ? "text-signal-blue" : "text-ink-soft"
            )}
          >
            {active && (
              <motion.span
                layoutId="tab-bar-active-pill"
                className="absolute inset-x-2 inset-y-1 rounded-xl bg-tint-blue"
                transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 34 }}
              />
            )}
            <Icon size={20} strokeWidth={active ? 2.3 : 1.8} className="relative" />
            <span className={cn("relative", active && "font-medium")}>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
