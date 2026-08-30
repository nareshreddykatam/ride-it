import type { Metadata } from "next";
import { Inter, Space_Grotesk, IBM_Plex_Mono } from "next/font/google";
import "@ride-it/ui/styles/globals.css";
import "maplibre-gl/dist/maplibre-gl.css";
import { AuthProvider } from "@ride-it/auth";

const body = Inter({ subsets: ["latin"], variable: "--font-body" });
const display = Space_Grotesk({ subsets: ["latin"], variable: "--font-display" });
const meter = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-meter",
});

export const metadata: Metadata = {
  title: "Ride It — Admin",
  description: "Manage drivers, passengers, rides, and subscriptions.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${body.variable} ${display.variable} ${meter.variable}`}>
      <body className="min-h-dvh bg-paper font-body text-ink antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
