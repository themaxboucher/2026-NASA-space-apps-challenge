import type { Metadata } from "next";
import Fly from "./Fly";

export const metadata: Metadata = {
  title: "Fly around it · Ruins Among the Stars",
  description: "Float around a NASA deep-space machine at real size and find out what it did and what happened to it.",
};

// One page for every deep-space machine: the machine is named in the link's hash, like /fly#juno.
export default function FlyPage() {
  return <Fly />;
}
