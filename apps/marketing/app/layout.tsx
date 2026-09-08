import type { Metadata } from "next";
import { Inter, Space_Grotesk, IBM_Plex_Mono } from "next/font/google";
import "@ride-it/ui/styles/globals.css";
import "./theme.css";
import { SiteHeader, SiteFooter } from "../components/site-chrome";

const body = Inter({ subsets: ["latin"], variable: "--font-body" });
const display = Space_Grotesk({ subsets: ["latin"], variable: "--font-display" });
const meter = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-meter",
});

const TITLE = "Ridora — Move Freely. Ride Your Way.";
const DESCRIPTION =
  "Ridora is an urban mobility platform for Bike, Scooty, Auto and Car rides. Verified drivers, transparent fares, and a flat-fee subscription model that lets drivers keep 100% of every fare.";

export const metadata: Metadata = {
  metadataBase: new URL("https://ridora.in"),
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "https://ridora.in" },
  openGraph: {
    type: "website",
    url: "https://ridora.in",
    siteName: "Ridora",
    title: TITLE,
    description: DESCRIPTION,
    locale: "en_IN",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${body.variable} ${display.variable} ${meter.variable}`}>
      <body className="min-h-dvh bg-white font-body text-rd-navy antialiased">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-rd-teal focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
        >
          Skip to content
        </a>
        <SiteHeader />
        <div id="main-content">{children}</div>
        <SiteFooter />
      </body>
    </html>
  );
}
