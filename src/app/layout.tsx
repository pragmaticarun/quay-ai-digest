import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Mono, Public_Sans } from "next/font/google";
import { DeskState } from "@/components/desk-state";
import "./globals.css";

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display-face",
});

const sans = Public_Sans({
  subsets: ["latin"],
  variable: "--font-public",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex",
});

export const metadata: Metadata = {
  title: {
    default: "Quay",
    template: "%s · Quay",
  },
  description: "A local editorial desk for reviewed AI engineering notes.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <DeskState>
          <div className="shell">{children}</div>
        </DeskState>
      </body>
    </html>
  );
}
