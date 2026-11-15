"use client";

import { Suspense } from "react";
import type { Stop } from "../../stops";
import { Apollo11Replay } from "../Ghost";
import { Apollo15Replay } from "./apollo15";
import { CassiniReplay } from "./cassini";
import { IngenuityReplay } from "./ingenuity";
import { OpportunityReplay } from "./opportunity";
import { Voyager1Replay } from "./voyager1";

// "What happened here" replays, one per stop (see scene/Ghost.tsx for the Apollo 11 one and the shared helpers).
// Each is mounted at its stop and plays while tour.replay is true; REPLAYS in state.ts lists the stops that have one.
const BY_STOP: Record<string, (p: { stop: Stop; ground?: (x: number, z: number) => number }) => React.ReactNode> = {
  "apollo11-lm": ({ stop, ground }) => <Apollo11Replay stop={stop} ground={ground!} />,
  "apollo15-lrv": Apollo15Replay,
  opportunity: OpportunityReplay,
  ingenuity: IngenuityReplay,
  cassini: CassiniReplay,
  voyager1: Voyager1Replay,
};

export function SiteReplay({ stop, ground }: { stop: Stop; ground?: (x: number, z: number) => number }) {
  const R = BY_STOP[stop.id];
  if (!R) return null;
  return <Suspense fallback={null}>{R({ stop, ground })}</Suspense>;
}
