import type { Metadata } from "next";
import Solar from "./Solar";

export const metadata: Metadata = {
  title: "Fly the solar system · Ruins Among the Stars",
  description: "Fly freely around the Sun, the planets and all 79 machines NASA left on the Moon, on Mars and in deep space, then land at any of them.",
};

// /solar, or /solar?from=<atlas id> to start next to one machine.
export default function SolarPage() {
  return <Solar />;
}
