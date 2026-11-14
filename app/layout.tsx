import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible, IBM_Plex_Mono, Public_Sans, Saira, Source_Serif_4 } from "next/font/google";
import "./globals.css";

// Thin, wide display face for headings; Atkinson for kid-readable body text; Plex Mono for labels and data.
const saira = Saira({ subsets: ["latin"], axes: ["wdth"], variable: "--font-saira" });
const atkinson = Atkinson_Hyperlegible({ subsets: ["latin"], weight: ["400", "700"], style: ["normal", "italic"], variable: "--font-atkinson" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-mono" });
// The atlas (/explore) reads like a field guide: a book serif for headings, Public Sans (the US government's typeface) for text.
const serif = Source_Serif_4({ subsets: ["latin"], axes: ["opsz"], style: ["normal", "italic"], variable: "--font-serif" });
const publicSans = Public_Sans({ subsets: ["latin"], variable: "--font-public" });

export const metadata: Metadata = {
  title: "Ruins Among the Stars",
  description: "Explore the machines NASA left on the Moon, on Mars and in deep space: what happened to each one, and what it would take to fix it or bring it home.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#090403" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${saira.variable} ${atkinson.variable} ${plexMono.variable} ${serif.variable} ${publicSans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
