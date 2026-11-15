import type { Metadata } from "next";
import Fly from "./Fly";

export const metadata: Metadata = {
  title: "Fly around it · Echoes of Exploration",
  description: "Float around a NASA space object in deep space at real size and find out what it did and what happened to it.",
};

// One page for every deep-space machine: the machine is named in the link's hash, like /fly#juno.
export default function FlyPage() {
  return <Fly />;
}
