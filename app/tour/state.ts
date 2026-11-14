import { createStore } from "./lib/store";
import { STOPS } from "./stops";

export type BodyKey = "earth" | "moon" | "mars" | "saturn";

export type BodyPlacement = { key: BodyKey; pos: [number, number, number]; rotY: number; spin?: boolean };

export type SceneDesc =
  | { kind: "travel"; key: string; bodies: BodyPlacement[] }
  | { kind: "surface"; key: string; stop: number }
  | { kind: "space"; key: string; stop: number };

export type Target = number | "start" | "end";

export type Phase = "start" | "travel" | "explore" | "end";

export type TourState = {
  phase: Phase;
  stop: number; // the stop being explored, or the one we're traveling to
  scene: SceneDesc;
  // A travel request for the Director, which plans it from wherever the camera is.
  request: { id: number; to: Target; mode: "journey" | "jump" } | null;
  skipId: number;
  cruise: { label: string; dest: string; from: number; to: number } | null;
  introOpen: boolean;
  openSpot: string | null;
  found: Record<string, string[]>;
  sceneReady: boolean;
  // Bumped when someone presses Next before finding every spot, so the HUD can point at what's left.
  nudge: number;
};

// The start screen: Earth in the foreground, with the Moon off-screen ahead.
export const START_SCENE: SceneDesc = {
  kind: "travel",
  key: "home",
  bodies: [{ key: "earth", pos: [0, 0, 0], rotY: 0, spin: true }],
};

export const tour = createStore<TourState>({
  phase: "start",
  stop: -1,
  scene: START_SCENE,
  request: null,
  skipId: 0,
  cruise: null,
  introOpen: false,
  openSpot: null,
  found: {},
  sceneReady: false,
  nudge: 0,
});

let requestId = 0;
export function requestTravel(to: Target, mode: "journey" | "jump") {
  tour.set({ request: { id: ++requestId, to, mode }, openSpot: null });
}

export function startTour() {
  const { phase } = tour.get();
  if (phase === "start" || phase === "end") requestTravel(0, "journey");
}

// Next turns into Skip while traveling; extra presses right after a skip must not start the next trip.
let skippedAt = -Infinity;
export function nextStop() {
  const s = tour.get();
  if (s.phase === "travel") {
    skippedAt = performance.now();
    return skipTravel();
  }
  if (s.phase !== "explore" || performance.now() - skippedAt < 700) return;
  // The story moves on once every glowing spot on this machine has been found.
  if (spotsLeft(s) > 0) {
    tour.set((t) => ({ nudge: t.nudge + 1 }));
    return;
  }
  requestTravel(s.stop < STOPS.length - 1 ? s.stop + 1 : "end", "journey");
}

// How many spots on the current stop are still unfound.
export function spotsLeft(s: TourState = tour.get()) {
  const stop = STOPS[s.stop];
  if (!stop) return 0;
  const seen = s.found[stop.id] ?? [];
  return stop.hotspots.filter((h) => !seen.includes(h.id)).length;
}

// The quiet way out: move on without finding everything.
export function skipStop() {
  const s = tour.get();
  if (s.phase !== "explore") return;
  requestTravel(s.stop < STOPS.length - 1 ? s.stop + 1 : "end", "journey");
}

export function previousStop() {
  const s = tour.get();
  if (s.phase !== "explore") return;
  requestTravel(s.stop > 0 ? s.stop - 1 : "start", "jump");
}

export function skipTravel() {
  tour.set((s) => ({ skipId: s.skipId + 1 }));
}

export function openHotspot(stopId: string, spotId: string | null) {
  tour.set((s) => {
    if (!spotId) return { openSpot: null };
    const seen = s.found[stopId] ?? [];
    return {
      openSpot: spotId,
      introOpen: false,
      found: seen.includes(spotId) ? s.found : { ...s.found, [stopId]: [...seen, spotId] },
    };
  });
}

export function dismissIntro() {
  if (tour.get().introOpen) tour.set({ introOpen: false });
}

// Per-frame values written by the Director and read by scene pieces, kept out of React state.
export const live = {
  streak: 0, // 0..1, how stretched the stars are
  fade: 1, // 0 = clear, 1 = black
  counter: 0,
  time: 0,
  brokenGlow: 0.6,
};

// DOM nodes the Director updates every frame, registered by the overlay.
export const hud: { fade: HTMLDivElement | null; counter: HTMLElement | null } = { fade: null, counter: null };

// Hotspot markers live in the DOM overlay; the 3D scene moves them to their projected screen positions.
export const spotEls = new Map<string, HTMLDivElement>();
export const spotKey = (stopId: string, spotId: string) => `${stopId}/${spotId}`;
