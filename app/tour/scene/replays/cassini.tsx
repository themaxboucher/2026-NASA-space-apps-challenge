"use client";

import type { Stop } from "../../stops";

// Replay of what happened at cassini: in progress, not switched on yet (it is not in REPLAYS), so the stop opens
// straight to the player's turn.
export function CassiniReplay(_props: { stop: Stop; ground?: (x: number, z: number) => number }) {
  return null;
}
