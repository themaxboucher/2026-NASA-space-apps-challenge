import { createStore } from "./lib/store";
import { faceLonRotation } from "./lib/geo";
import { siteFrame } from "./lib/siteframe";
import { STOPS } from "./stops";

export type BodyKey = "earth" | "moon" | "mars" | "saturn";

// `lit`: a sun direction for a LitGlobe (the Moon on the first trip, lit exactly like the landing site's globe).
export type BodyPlacement = { key: BodyKey; pos: [number, number, number]; rotY: number; spin?: boolean; lit?: [number, number, number] };

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
  // Set (to a fresh id) when the last spot on a stop is found, so the HUD can celebrate once.
  cheer: number;
  // Stops reached on this trip, for the end screen.
  visited: string[];
  // A story card (and real footage) shown before flying to this stop; null when none is up.
  interlude: number | null;
  // A part's own footage playing full screen ("<stop>/<spot>" key in media.json), or null.
  cutscene: string | null;
  // The ghost replay of what happened at this site is playing (scene/Ghost.tsx).
  replay: boolean;
  // Sites whose replay has played (or been skipped) this trip: their present-day leftovers are now shown.
  revealed: string[];
};

// The start screen: Earth in the foreground, with the Moon off-screen ahead.
export const START_SCENE: SceneDesc = {
  kind: "travel",
  key: "home",
  // The Moon is already out there (40 units ahead, turned so Tranquility Base faces you), so the first trip
  // flies through this same scene with no cut at all.
  bodies: [
    { key: "earth", pos: [0, 0, 0], rotY: 0, spin: true },
    { key: "moon", pos: [0, 0, -40], rotY: STOPS[0].site ? faceLonRotation(STOPS[0].site.lon, 1) : 0, lit: siteFrame(STOPS[0]).sunTravel().toArray() as [number, number, number] },
  ],
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
  cheer: 0,
  visited: [],
  interlude: null,
  cutscene: null,
  replay: false,
  revealed: [],
});

let requestId = 0;
export function requestTravel(to: Target, mode: "journey" | "jump") {
  tour.set({ request: { id: ++requestId, to, mode }, openSpot: null, cheer: 0 });
}

export function startTour() {
  const { phase } = tour.get();
  if (phase === "start" || phase === "end") {
    tour.set({ visited: [], revealed: [] });
    journeyTo(0);
  }
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
  journeyTo(s.stop < STOPS.length - 1 ? s.stop + 1 : "end");
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
  journeyTo(s.stop < STOPS.length - 1 ? s.stop + 1 : "end");
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
    if (seen.includes(spotId)) return { openSpot: spotId, introOpen: false };
    const now = [...seen, spotId];
    const all = STOPS.find((x) => x.id === stopId)?.hotspots.every((h) => now.includes(h.id));
    return {
      openSpot: spotId,
      introOpen: false,
      found: { ...s.found, [stopId]: now },
      ...(all ? { cheer: s.cheer + 1 } : {}),
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
  hideMachine: false, // the replay hides the real machine until its ghost has landed
  replayLook: null as null | [number, number, number],
  replayView: null as null | { pos: [number, number, number]; look: [number, number, number] }, // overrides stop.replayView // where the replay wants you to look (e.g. at Eagle coming down)
};

// DOM nodes the Director updates every frame, registered by the overlay.
export const hud: { fade: HTMLDivElement | null; counter: HTMLElement | null; minimap: HTMLCanvasElement | null; replayLine: HTMLElement | null; replayBar: HTMLElement | null } = {
  fade: null,
  counter: null,
  minimap: null,
  replayLine: null,
  replayBar: null,
};

// Shows a replay caption, with a thin bar under it that fills over the `seconds` it stays up.
export function setCaption(text: string, seconds: number) {
  if (hud.replayLine) hud.replayLine.textContent = text;
  const bar = hud.replayBar;
  if (!bar) return;
  bar.style.animation = "none";
  void bar.offsetWidth; // restart the fill
  bar.style.animation = text ? `caption-fill ${Math.max(0.5, seconds).toFixed(2)}s linear forwards` : "none";
}

// Hotspot markers live in the DOM overlay; the 3D scene moves them to their projected screen positions.
export const spotEls = new Map<string, HTMLDivElement>();
// The machines' 3D objects at the current stop, for walking collisions (registered by scene/Machine.tsx).
export const solids = new Set<import("three").Object3D>();
// Edge-of-screen arrows pointing at spots that are still unfound and out of view, keyed the same way.
export const arrowEls = new Map<string, HTMLDivElement>();
export const spotKey = (stopId: string, spotId: string) => `${stopId}/${spotId}`;

export const REPLAYS = new Set(["apollo11-lm"]);

// Every stop reached counts as visited, for the end screen.
tour.subscribe(() => {
  const s = tour.get();
  const id = s.phase === "explore" ? STOPS[s.stop]?.id : undefined;
  // The first time you reach a site with a replay this trip, the past plays out before it's your turn.
  if (id && !s.visited.includes(id)) tour.set({ visited: [...s.visited, id], ...(REPLAYS.has(id) ? { replay: true, introOpen: false } : {}) });
});

export function endReplay(forStop?: string) {
  const s = tour.get();
  if (!s.replay) return;
  const id = STOPS[s.stop]?.id;
  if (forStop && forStop !== id) return; // a replay from a stop you've already left
  tour.set({ replay: false, introOpen: true, revealed: id && !s.revealed.includes(id) ? [...s.revealed, id] : s.revealed });
}

// The story is told a chapter at a time: before flying to a stop, show its story card first.
function journeyTo(to: Target) {
  if (typeof to === "number" && STOPS[to]?.story) tour.set({ interlude: to, openSpot: null, introOpen: false });
  else requestTravel(to, "journey");
}
export function continueStory() {
  const to = tour.get().interlude;
  if (to == null) return;
  tour.set({ interlude: null });
  requestTravel(to, "journey");
}
