import type { Metadata } from "next";
import Signals from "./Signals";

export const metadata: Metadata = {
  title: "What We Heard Back · Echoes of Exploration",
  description: "An encyclopedia of the signals you have collected: every space object NASA left on the Moon, on Mars and in deep space, filled in as you visit them.",
};

export default function SignalsPage() {
  return <Signals />;
}
