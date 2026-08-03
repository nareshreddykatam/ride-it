import type { Metadata } from "next";
import { Inter, Space_Grotesk, IBM_Plex_Mono } from "next/font/google";
import "@ride-it/ui/styles/globals.css";
import { SiteHeader, SiteFooter } from "../components/site-chrome";

const body = Inter({ subsets: ["latin"], variable: "--font-body" });
const display = Space_Grotesk({ subsets: ["latin"], variable: "--font-display" });
const meter = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-meter",
});

export const metadata: Metadata = {
  title: "Ride It — Your Ride. Your Way.",
  description:
    "Ride It is a subscription-based Bike and Auto platform. Drivers pay a flat fee and keep 100% of every fare.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${body.variable} ${display.variable} ${meter.variable}`}>
      <body className="min-h-dvh bg-paper font-body text-ink antialiased">
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
