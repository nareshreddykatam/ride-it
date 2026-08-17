"use client";

import * as React from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { BottomSheet, Button, StatusPill } from "@ride-it/ui";

const LINKS = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/for-drivers", label: "For drivers" },
  { href: "/cities", label: "Cities" },
  { href: "/about", label: "About" },
  { href: "/safety", label: "Safety" },
];

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = React.useState(false);

  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link href="/" className="font-display text-lg font-medium text-ink-blue">
          Ride It
        </Link>
        <nav aria-label="Main" className="hidden gap-6 md:flex">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="text-sm text-ink-soft hover:text-ink">
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          <Button size="sm" disabled>
            Download app
          </Button>
          <StatusPill tone="pending" dot={false}>
            Coming soon
          </StatusPill>
        </div>
        <button
          type="button"
          aria-label="Open menu"
          onClick={() => setMenuOpen(true)}
          className="-m-2.5 p-2.5 text-ink md:hidden"
        >
          <Menu size={22} />
        </button>
      </div>

      <BottomSheet open={menuOpen} onOpenChange={setMenuOpen}>
        <div className="flex items-center justify-between">
          <p className="font-display text-base font-medium text-ink">Menu</p>
          <button type="button" aria-label="Close menu" onClick={() => setMenuOpen(false)} className="-m-2.5 p-2.5 text-ink-soft">
            <X size={20} />
          </button>
        </div>
        <nav aria-label="Main" className="mt-4 flex flex-col gap-1">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className="rounded-lg px-3 py-3 text-sm text-ink hover:bg-ink/5"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </BottomSheet>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-white">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          <div>
            <p className="font-display text-sm font-medium text-ink">Ride It</p>
            <p className="mt-2 text-xs text-ink-soft">Your ride. Your way.</p>
          </div>
          <div>
            <p className="text-xs font-medium text-ink-soft">Company</p>
            <div className="mt-2 flex flex-col gap-1.5 text-sm">
              <Link href="/about" className="text-ink-soft hover:text-ink">About</Link>
              <Link href="/careers" className="text-ink-soft hover:text-ink">Careers</Link>
              <Link href="/contact" className="text-ink-soft hover:text-ink">Contact</Link>
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-ink-soft">Resources</p>
            <div className="mt-2 flex flex-col gap-1.5 text-sm">
              <Link href="/safety" className="text-ink-soft hover:text-ink">Safety</Link>
              <Link href="/for-drivers" className="text-ink-soft hover:text-ink">Driver plans</Link>
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-ink-soft">Legal</p>
            <div className="mt-2 flex flex-col gap-1.5 text-sm">
              <Link href="/legal/terms" className="text-ink-soft hover:text-ink">Terms</Link>
              <Link href="/legal/privacy" className="text-ink-soft hover:text-ink">Privacy</Link>
            </div>
          </div>
        </div>
        <p className="mt-8 text-xs text-ink-soft">© 2026 Ride It. All rights reserved.</p>
      </div>
    </footer>
  );
}
