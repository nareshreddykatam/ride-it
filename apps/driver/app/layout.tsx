import type { Metadata, Viewport } from "next";
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
  title: "Ridora Driver",
  description: "Go online, accept rides, keep 100% of your earnings.",
};

export const viewport: Viewport = {
  themeColor: "#0B3B8C",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${body.variable} ${display.variable} ${meter.variable}`}>
      <body className="min-h-dvh bg-paper font-body text-ink antialiased">
        <AuthProvider>
          <div className="mx-auto flex min-h-dvh max-w-md flex-col">{children}</div>
        </AuthProvider>
      </body>
    </html>
  );
}
