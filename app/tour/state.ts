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
  // The full-screen mission file for the current stop.
  fileOpen: boolean;
  found: Record<string, string[]>;
  sceneReady: boolean;
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
  fileOpen: false,
  found: {},
  sceneReady: false,
});

let requestId = 0;
export function requestTravel(to: Target, mode: "journey" | "jump") {
  tour.set({ request: { id: ++requestId, to, mode }, openSpot: null, fileOpen: false });
}

export function setFileOpen(open: boolean) {
  tour.set({ fileOpen: open });
}

export function startTour() {
  const { phase } = tour.get();
  if (phase === "start" || phase === "end") requestTravel(0, "journey");
}

// The "Next machine" button: on to the next stop, or home to the end screen after the last one.
export function nextStop() {
  const s = tour.get();
  if (s.phase !== "explore") return;
  requestTravel(s.stop < STOPS.length - 1 ? s.stop + 1 : "end", "journey");
}

// A tick in the top trail. Forward flies there; backward is a quick fade. During a trip, the destination's tick
// skips the rest of the trip.
export function goToStop(i: number) {
  const s = tour.get();
  if (s.phase === "travel") {
    if (i === s.stop) skipTravel();
    return;
  }
  if (s.phase !== "explore" || i === s.stop) return;
  requestTravel(i, i > s.stop ? "journey" : "jump");
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
      fileOpen: false,
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
