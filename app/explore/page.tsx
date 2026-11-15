import type { Metadata } from "next";
import Atlas from "../atlas/Atlas";

export const metadata: Metadata = {
  title: "Explore all 79 machines · Footprints",
  description: "The full atlas: every machine NASA left on the Moon, on Mars and in deep space, on a spinning globe with a timeline.",
};

export default function ExplorePage() {
  return <Atlas />;
}
