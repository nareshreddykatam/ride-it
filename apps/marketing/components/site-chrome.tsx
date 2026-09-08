"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { BottomSheet } from "@ride-it/ui";
import { CtaButton } from "./ui/cta-button";

// Every label maps to a real, already-working route — no placeholder
// pages were created to match this list literally. "Ride"/"Drive"/"Help"
// point at the closest existing real page (how-it-works / for-drivers /
// contact) rather than fabricating new empty routes.
const LINKS = [
  { href: "/how-it-works", label: "Ride" },
  { href: "/for-drivers", label: "Drive" },
  { href: "/safety", label: "Safety" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Help" },
];

function Wordmark({ dark = false, className = "" }: { dark?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-rd-teal to-rd-green text-white shadow-sm">
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 2C7.6 2 4 5.6 4 10c0 6 8 12 8 12s8-6 8-12c0-4.4-3.6-8-8-8Z"
            fill="currentColor"
            fillOpacity="0.35"
          />
          <path d="M12 4.5C8.96 4.5 6.5 6.96 6.5 10c0 4.2 5.5 8.8 5.5 8.8s5.5-4.6 5.5-8.8c0-3.04-2.46-5.5-5.5-5.5Z" fill="currentColor" />
          <circle cx="12" cy="10" r="2.4" fill="#0B1628" />
        </svg>
      </span>
      <span className="flex flex-col leading-none">
        <span className={`font-display text-lg font-semibold tracking-tight ${dark ? "text-white" : "text-rd-navy"}`}>
          Ridora
        </span>
        <span className="font-body text-[10px] font-semibold uppercase tracking-[0.14em] text-rd-teal">
          Move Freely
        </span>
      </span>
    </span>
  );
}

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-rd-line bg-white/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
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
                className={`relative rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
                  active ? "text-rd-teal" : "text-rd-navy-soft hover:text-rd-navy"
                }`}
              >
                {link.label}
                {active && <span className="absolute inset-x-3 -bottom-[1px] h-0.5 rounded-full bg-rd-teal" aria-hidden="true" />}
              </Link>
            );
          })}
        </nav>
        <div className="hidden items-center gap-3 md:flex">
          <a href="https://driver.ridora.in" className="text-sm font-medium text-rd-navy-soft transition-colors hover:text-rd-navy">
            Drive with Ridora
          </a>
          <CtaButton href="https://app.ridora.in" size="md">
            Book a Ride
          </CtaButton>
        </div>
        <button
          type="button"
          aria-label="Open menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(true)}
          className="-m-2.5 flex h-11 w-11 items-center justify-center rounded-lg text-rd-navy hover:bg-rd-navy/5 md:hidden"
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
            className="-m-2.5 flex h-10 w-10 items-center justify-center rounded-lg text-rd-navy-soft hover:bg-rd-navy/5"
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
                className={`rounded-lg px-3 py-3.5 text-base font-medium transition-colors ${
                  active ? "bg-rd-mint text-rd-teal-dark" : "text-rd-navy hover:bg-rd-navy/5"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-6 flex items-center gap-3 border-t border-rd-line pt-5">
          <CtaButton href="https://app.ridora.in" size="md" className="flex-1 justify-center">
            Book a Ride
          </CtaButton>
          <CtaButton href="https://driver.ridora.in" variant="outline" size="md" className="flex-1 justify-center" arrow={false}>
            Drive with Ridora
          </CtaButton>
        </div>
      </BottomSheet>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-rd-line bg-rd-navy">
      <div className="mx-auto max-w-6xl px-6 py-14">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          <div className="col-span-2">
            <Wordmark dark />
            <p className="mt-4 max-w-[26ch] text-sm text-white/60">
              Affordable, reliable rides across your city — and a fairer way for drivers to earn.
            </p>
            <div className="mt-6 flex items-center gap-3">
              <a href="https://app.ridora.in" className="text-sm font-semibold text-rd-teal-light hover:text-white">
                Book a Ride →
              </a>
              <a href="https://driver.ridora.in" className="text-sm font-semibold text-white/70 hover:text-white">
                Drive with Ridora →
              </a>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-white/40">Company</p>
            <div className="mt-3 flex flex-col gap-2.5 text-sm">
              <Link href="/about" className="text-white/70 transition-colors hover:text-white">About</Link>
              <Link href="/careers" className="text-white/70 transition-colors hover:text-white">Careers</Link>
              <Link href="/cities" className="text-white/70 transition-colors hover:text-white">Cities</Link>
              <Link href="/contact" className="text-white/70 transition-colors hover:text-white">Contact / Help</Link>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-white/40">Legal</p>
            <div className="mt-3 flex flex-col gap-2.5 text-sm">
              <Link href="/safety" className="text-white/70 transition-colors hover:text-white">Safety</Link>
              <Link href="/legal/terms" className="text-white/70 transition-colors hover:text-white">Terms</Link>
              <Link href="/legal/privacy" className="text-white/70 transition-colors hover:text-white">Privacy</Link>
            </div>
          </div>
        </div>
        <div className="mt-10 flex flex-col-reverse items-start justify-between gap-4 border-t border-white/10 pt-6 sm:flex-row sm:items-center">
          <p className="text-xs text-white/40">© 2026 Ridora. All rights reserved.</p>
          <p className="text-xs text-white/40">Vijayawada · more cities coming soon</p>
        </div>
      </div>
    </footer>
  );
}
