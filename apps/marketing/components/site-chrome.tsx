"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import {
  AutoIcon,
  BikeIcon,
  BottomSheet,
  Button,
  DriverIcon,
  LocationIcon,
  OfficeIcon,
  RideIcon,
  SafetyIcon,
} from "@ride-it/ui";

const LINKS = [
  { href: "/how-it-works", label: "How it works", icon: RideIcon },
  { href: "/for-drivers", label: "For drivers", icon: DriverIcon },
  { href: "/cities", label: "Cities", icon: LocationIcon },
  { href: "/about", label: "About", icon: OfficeIcon },
  { href: "/safety", label: "Safety", icon: SafetyIcon },
];

function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-brand text-white shadow-sm">
        <AutoIcon size={18} strokeWidth={2} />
      </span>
      <span className="font-display text-lg font-semibold tracking-tight text-ink-blue">
        Rid<span className="text-marigold">ora</span>
      </span>
    </span>
  );
}

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3.5">
        <Link href="/" className="focus-visible:rounded-lg">
          <Wordmark />
        </Link>
        <nav aria-label="Main" className="hidden gap-1 md:flex">
          {LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`relative rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active ? "text-signal-blue" : "text-ink-soft hover:text-ink"
                }`}
              >
                {link.label}
                {active && (
                  <span className="absolute inset-x-3 -bottom-[1px] h-0.5 rounded-full bg-signal-blue" aria-hidden="true" />
                )}
              </Link>
            );
          })}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          <span className="rounded-full border border-marigold/30 bg-tint-marigold px-2.5 py-1 text-xs font-semibold text-marigold-text">
            Coming soon
          </span>
          <Button size="sm" variant="brand" disabled>
            Download app
          </Button>
        </div>
        <button
          type="button"
          aria-label="Open menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(true)}
          className="-m-2.5 flex h-11 w-11 items-center justify-center rounded-lg text-ink hover:bg-ink/5 md:hidden"
        >
          <Menu size={22} />
        </button>
      </div>

      <BottomSheet open={menuOpen} onOpenChange={setMenuOpen}>
        <div className="flex items-center justify-between">
          <Wordmark />
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
            className="-m-2.5 flex h-10 w-10 items-center justify-center rounded-lg text-ink-soft hover:bg-ink/5"
          >
            <X size={20} />
          </button>
        </div>
        <nav aria-label="Main" className="mt-5 flex flex-col gap-1">
          {LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-3.5 text-base font-medium transition-colors ${
                  active ? "bg-tint-blue text-signal-blue" : "text-ink hover:bg-ink/5"
                }`}
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                    active ? "bg-surface text-signal-blue" : "bg-ink/5 text-ink-soft"
                  }`}
                >
                  <link.icon size={18} aria-hidden="true" />
                </span>
                {link.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-6 flex items-center gap-3 border-t border-border pt-5">
          <Button size="md" variant="brand" disabled className="flex-1">
            Download app
          </Button>
          <span className="rounded-full border border-marigold/30 bg-tint-marigold px-2.5 py-1.5 text-xs font-semibold text-marigold-text">
            Coming soon
          </span>
        </div>
      </BottomSheet>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-5">
          <div className="col-span-2">
            <Wordmark />
            <p className="mt-3 max-w-[22ch] text-sm text-ink-soft">Your ride. Your city. Your way.</p>
            <p className="mt-4 text-xs font-medium uppercase tracking-wide text-ink-soft/70">
              Built for
            </p>
            <div className="mt-2 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-tint-marigold text-marigold-text" title="Auto">
                <AutoIcon size={16} aria-hidden="true" />
              </span>
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-tint-violet text-violet-text" title="Bike">
                <BikeIcon size={16} aria-hidden="true" />
              </span>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Company</p>
            <div className="mt-3 flex flex-col gap-2 text-sm">
              <Link href="/about" className="text-ink-soft transition-colors hover:text-ink">About</Link>
              <Link href="/careers" className="text-ink-soft transition-colors hover:text-ink">Careers</Link>
              <Link href="/contact" className="text-ink-soft transition-colors hover:text-ink">Contact</Link>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Resources</p>
            <div className="mt-3 flex flex-col gap-2 text-sm">
              <Link href="/safety" className="text-ink-soft transition-colors hover:text-ink">Safety</Link>
              <Link href="/for-drivers" className="text-ink-soft transition-colors hover:text-ink">Driver plans</Link>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Legal</p>
            <div className="mt-3 flex flex-col gap-2 text-sm">
              <Link href="/legal/terms" className="text-ink-soft transition-colors hover:text-ink">Terms</Link>
              <Link href="/legal/privacy" className="text-ink-soft transition-colors hover:text-ink">Privacy</Link>
            </div>
          </div>
        </div>
        <div className="mt-10 flex flex-col-reverse items-start justify-between gap-4 border-t border-border pt-6 sm:flex-row sm:items-center">
          <p className="text-xs text-ink-soft">© 2026 Ridora. All rights reserved.</p>
          <span className="rounded-full border border-marigold/30 bg-tint-marigold px-2.5 py-1 text-xs font-semibold text-marigold-text">
            Coming soon
          </span>
        </div>
      </div>
    </footer>
  );
}
