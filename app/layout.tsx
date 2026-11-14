import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible, IBM_Plex_Mono, Saira } from "next/font/google";
import "./globals.css";

// Thin, wide display face for headings; Atkinson for kid-readable body text; Plex Mono for labels and data.
const saira = Saira({ subsets: ["latin"], axes: ["wdth"], variable: "--font-saira" });
const atkinson = Atkinson_Hyperlegible({ subsets: ["latin"], weight: ["400", "700"], style: ["normal", "italic"], variable: "--font-atkinson" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-mono" });

export const metadata: Metadata = {
  title: "Ghost Rover Atlas",
  description: "Explore the machines NASA left behind on the Moon, on Mars and in deep space, and find out what happened to each one.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#090403" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${saira.variable} ${atkinson.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
