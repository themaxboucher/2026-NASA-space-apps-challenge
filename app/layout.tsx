import type { Metadata, Viewport } from "next";
import { Instrument_Sans, Spline_Sans_Mono } from "next/font/google";
import "./globals.css";
import "./icons.css";

// Free stand-ins for Impulse Space's type (ABC Monument Grotesk is commercial): Instrument Sans for headings and body, Spline Sans Mono for labels and data.
const instrumentSans = Instrument_Sans({ subsets: ["latin"], style: ["normal", "italic"], variable: "--font-instrument-sans" });
const splineMono = Spline_Sans_Mono({ subsets: ["latin"], variable: "--font-spline-mono" });

export const metadata: Metadata = {
  title: "Echoes of Exploration",
  description: "Explore the space objects NASA left on the Moon, on Mars and in deep space: what happened to each one, and what it would take to fix it or bring it home.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#0a0c10" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${instrumentSans.variable} ${splineMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
