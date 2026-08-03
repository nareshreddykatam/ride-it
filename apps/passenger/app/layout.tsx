import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk, IBM_Plex_Mono } from "next/font/google";
import "@ride-it/ui/styles/globals.css";
import { PageTransition } from "../components/page-transition";

const body = Inter({ subsets: ["latin"], variable: "--font-body" });
const display = Space_Grotesk({ subsets: ["latin"], variable: "--font-display" });
const meter = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-meter",
});

export const metadata: Metadata = {
  title: "Ride It — Your Ride. Your Way.",
  description: "Book safe, affordable Bike and Auto rides with Ride It.",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#0B3B8C",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${body.variable} ${display.variable} ${meter.variable}`}>
      <body className="min-h-dvh bg-paper font-body text-ink antialiased">
        <div className="mx-auto flex min-h-dvh max-w-md flex-col">
          <PageTransition>{children}</PageTransition>
        </div>
      </body>
    </html>
  );
}
