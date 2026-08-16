"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Clock, User } from "lucide-react";
import { cn } from "@ride-it/ui";

const TABS = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/history", label: "History", icon: Clock },
  { href: "/profile", label: "Profile", icon: User },
];

export function PassengerTabBar() {
  const pathname = usePathname();

  return (
    <nav className="sticky bottom-0 flex border-t border-border bg-white">
      {TABS.map(({ href, label, icon: Icon }) => {
        const active = pathname?.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs",
              active ? "text-signal-blue" : "text-ink-soft"
            )}
          >
            <Icon size={20} strokeWidth={active ? 2.2 : 1.8} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
