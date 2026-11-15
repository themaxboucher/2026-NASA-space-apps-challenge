import { createStore } from "./lib/store";
import { faceLonRotation } from "./lib/geo";
import { siteFrame } from "./lib/siteframe";
import { STORY_COUNT, STOPS } from "./stops";

export type BodyKey = "earth" | "moon" | "mars" | "saturn" | "jupiter" | "venus" | "mercury" | "uranus" | "neptune" | "pluto" | "ceres" | "rock";

// `lit`: a sun direction for a LitGlobe (the Moon on the first trip, lit exactly like the landing site's globe).
export type BodyPlacement = { key: BodyKey; pos: [number, number, number]; rotY: number; spin?: boolean; lit?: [number, number, number] };

export type SceneDesc =
  // `heliopause`: the edge of the Sun's bubble, a huge faint shell the trip to Voyager 1 flies through.
  | { kind: "travel"; key: string; bodies: BodyPlacement[]; heliopause?: { center: [number, number, number]; radius: number } }
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
  // The scout's own call on each site, made in the case file once every clue is found.
  calls: Record<string, Call>;
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
  fileOpen: false,
  found: {},
  sceneReady: false,
  visited: [],
  interlude: null,
  cutscene: null,
  replay: false,
  revealed: [],
  calls: {},
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
  if (phase === "start" || phase === "end") {
    tour.set({ visited: [], revealed: [], calls: {} });
    journeyTo(0);
  }
}

// The "Next machine" button: on to the next stop, or home to the end screen after the last one.
export function nextStop() {
  const s = tour.get();
  if (s.phase !== "explore") return;
  journeyTo(s.stop < STORY_COUNT - 1 ? s.stop + 1 : "end");
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
  // From another machine (outside the story), any trail tick is a quick fade into the story.
  if (i > s.stop && s.stop < STORY_COUNT) journeyTo(i);
  else requestTravel(i, "jump");
}

// How many spots on the current stop are still unfound.
export function spotsLeft(s: TourState = tour.get()) {
  const stop = STOPS[s.stop];
  if (!stop) return 0;
  const seen = s.found[stop.id] ?? [];
  return stop.hotspots.filter((h) => !seen.includes(h.id)).length;
}

export function skipTravel() {
  tour.set((s) => ({ skipId: s.skipId + 1 }));
}

export function openHotspot(stopId: string, spotId: string | null) {
  tour.set((s) => {
    if (!spotId) return { openSpot: null };
    const seen = s.found[stopId] ?? [];
    if (seen.includes(spotId)) return { openSpot: spotId, introOpen: false, fileOpen: false };
    return {
      openSpot: spotId,
      introOpen: false,
      fileOpen: false,
      found: { ...s.found, [stopId]: [...seen, spotId] },
    };
  });
  // Every spot found: remember it as fully explored (shared with the explore page, kept in this browser).
  const stop = STOPS.find((x) => x.id === stopId);
  const now = tour.get().found[stopId] ?? [];
  if (stop && stop.hotspots.length && stop.hotspots.every((h) => now.includes(h.id))) {
    try {
      const done = new Set<string>(JSON.parse(localStorage.getItem("gra-complete") || "[]"));
      if (!done.has(stopId)) localStorage.setItem("gra-complete", JSON.stringify([...done.add(stopId)]));
    } catch {
      /* storage blocked: nothing to remember */
    }
  }
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
// `chip`: the caption naming what you pass on a trip; `speed`: the "x8" readout while Shift-running.
export const hud: { fade: HTMLDivElement | null; counter: HTMLElement | null; minimap: HTMLCanvasElement | null; replayLine: HTMLElement | null; replayBar: HTMLElement | null; chip: HTMLElement | null; speed: HTMLElement | null } = {
  chip: null,
  speed: null,
  fade: null,
  counter: null,
  minimap: null,
  replayLine: null,
  replayBar: null,
};

// Shows a replay caption, with a thin bar under it that fills over the `seconds` it stays up.
export function setCaption(text: string, seconds: number) {
  // Clearing (when a replay ends) keeps the last line up while the caption box fades out, instead of an empty box.
  if (!text) return;
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

// Your place in the tour, kept for this browser tab (sessionStorage), so leaving for the atlas and coming
// back picks up where you were: same stop, spots found, replays already watched.
const SAVE_KEY = "gra-tour";
tour.subscribe(() => {
  const s = tour.get();
  try {
    // Other machines' stops only exist once opened, so only a story stop is saved as the place to return to
    // (the address, /#<id>, brings you back to any other machine).
    if (s.phase === "explore" && s.stop >= 0) sessionStorage.setItem(SAVE_KEY, JSON.stringify({ stop: s.stop < STORY_COUNT ? s.stop : -1, found: s.found, visited: s.visited, revealed: s.revealed, calls: s.calls }));
    else if (s.phase === "end") sessionStorage.removeItem(SAVE_KEY);
  } catch {
    /* storage blocked: the tour just starts fresh next time */
  }
});
// Restores saved progress and returns the stop to go back to (or null). `at` overrides the saved stop.
export function restoreProgress(at?: number): number | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(SAVE_KEY) || "null") as { stop: number; found: Record<string, string[]>; visited: string[]; revealed: string[]; calls?: Record<string, Call> } | null;
    if (!saved) return at ?? null;
    tour.set({ found: saved.found ?? {}, visited: saved.visited ?? [], revealed: saved.revealed ?? [], calls: saved.calls ?? {} });
    return at ?? (saved.stop >= 0 && saved.stop < STORY_COUNT ? saved.stop : null);
  } catch {
    return at ?? null;
  }
}

export const REPLAYS = new Set(["apollo11-lm"]);

// Every stop reached counts as visited, for the end screen.
tour.subscribe(() => {
  const s = tour.get();
  const id = s.phase === "explore" ? STOPS[s.stop]?.id : undefined;
  // The first time you reach a site with a replay this trip, the past plays out before it's your turn.
  if (id && !s.visited.includes(id)) tour.set({ visited: [...s.visited, id], ...(REPLAYS.has(id) ? { replay: true, introOpen: false } : {}) });
  // Back at a site whose replay was cut short (you left mid-replay): show the site as it is now, not an empty spot.
  else if (id && REPLAYS.has(id) && !s.replay && !s.revealed.includes(id)) tour.set({ revealed: [...s.revealed, id] });
});

// What the scout can decide about a site (the briefing's four choices).
export const CALLS = { repair: "Repair it", reuse: "Give it a new job", home: "Bring it home", history: "Leave it as history" } as const;
export type Call = keyof typeof CALLS;
export function makeCall(id: string, call: Call) {
  tour.set({ calls: { ...tour.get().calls, [id]: call } });
}

export function endReplay(forStop?: string) {
  const s = tour.get();
  if (!s.replay) return;
  const id = STOPS[s.stop]?.id;
  if (forStop && forStop !== id) return; // a replay from a stop you've already left
  tour.set({ replay: false, introOpen: true, revealed: id && !s.revealed.includes(id) ? [...s.revealed, id] : s.revealed });
}

// The story is told a chapter at a time: before flying to a stop, show its story card first.
function journeyTo(to: Target) {
  if (typeof to === "number" && STOPS[to]?.story) tour.set({ interlude: to, openSpot: null, introOpen: false, fileOpen: false });
  else requestTravel(to, "journey");
}
export function continueStory() {
  const to = tour.get().interlude;
  if (to == null) return;
  tour.set({ interlude: null });
  requestTravel(to, "journey");
}
