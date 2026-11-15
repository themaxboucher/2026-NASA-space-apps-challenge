import { createStore } from "./lib/store";
import { faceLonRotation } from "./lib/geo";
import { siteFrame } from "./lib/siteframe";
import { STORY_COUNT, STOPS } from "./stops";

export type BodyKey = "earth" | "moon" | "mars" | "saturn" | "jupiter" | "venus" | "mercury" | "uranus" | "neptune" | "pluto" | "ceres" | "rock";

// `lit`: a sun direction for a LitGlobe (the Moon on the first trip, lit exactly like the landing site's globe).
export type BodyPlacement = { key: BodyKey; pos: [number, number, number]; rotY: number; spin?: boolean; lit?: [number, number, number] };

export type SceneDesc =
  // `heliopause`: the edge of the Sun's bubble, a huge faint shell the trip to Voyager 1 flies through.
  // `belt`: a field of asteroids between these z values. `voyager2`: a labelled marker for Voyager 2 on the sky, in
  // this direction, shown until the camera passes z = fadeZ.
  | {
      kind: "travel";
      key: string;
      bodies: BodyPlacement[];
      heliopause?: { center: [number, number, number]; radius: number };
      belt?: { z: [number, number] };
      voyager2?: { dir: [number, number, number]; fadeZ: number };
    }
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
export const hud: { fade: HTMLDivElement | null; counter: HTMLElement | null; minimap: HTMLCanvasElement | null; replayLine: HTMLElement | null; chip: HTMLElement | null; speed: HTMLElement | null } = {
  chip: null,
  speed: null,
  fade: null,
  counter: null,
  minimap: null,
  replayLine: null,
};

// Shows a replay caption, with a thin bar under it that fills over the `seconds` it stays up.
// A caption arrives like a received transmission: the whole line shows at once as shuffling letters, which lock
// into the real words left to right (like Magic UI's Hyper Text). It reads in quickly (about 40 letters a second)
// and always finishes within the first half of the time the line is up. A quoted line ("Armstrong: “…”") shows the
// speaker at once, as a call sign, then decodes the words.
const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOWER = "abcdefghijklmnopqrstuvwxyz";
const DECODE_RATE = 40; // letters a second
const SHUFFLE_MS = 45; // how often the unlocked letters change
let decoding = 0;
// A stand-in of the same kind, so the shuffling keeps roughly the shape of the line.
const noiseFor = (ch: string) => {
  const set = /[A-Z]/.test(ch) ? UPPER : /[0-9]/.test(ch) ? "0123456789" : LOWER;
  return set[Math.floor(Math.random() * set.length)];
};
export function setCaption(text: string, seconds: number) {
  // Clearing (when a replay ends) keeps the last line up while the caption box fades out, instead of an empty box.
  if (!text) return;
  const el = hud.replayLine;
  if (!el) return;
  cancelAnimationFrame(decoding);
  const quote = /^([^:“"]{1,24}): [“"](.*)[”"]$/.exec(text);
  const who = quote?.[1] ?? "";
  const words = quote ? quote[2] : text;

  // Screen readers hear the whole line once; the letters being decoded are hidden from them.
  el.replaceChildren();
  const said = document.createElement("span");
  said.className = "sr-only";
  said.textContent = who ? `${who}: ${words}` : words;
  const shown = document.createElement("span");
  shown.setAttribute("aria-hidden", "true");
  if (who) {
    const sign = document.createElement("span");
    sign.className = "replay-who";
    sign.textContent = who;
    shown.append(sign);
  }
  el.append(said, shown);

  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    shown.append(words);
    return;
  }
  // One span per letter: the real letter keeps its place (hidden) and the shuffling one is drawn over it, so the
  // line wraps exactly as it will end up.
  const letters = [...words].map((ch) => {
    const span = document.createElement("span");
    span.textContent = ch;
    if (/[\p{L}\p{N}]/u.test(ch)) {
      span.className = "replay-noise";
      span.dataset.n = noiseFor(ch);
    }
    shown.append(span);
    return span;
  });
  const rate = Math.max(DECODE_RATE, letters.length / Math.max(0.4, seconds * 0.5));
  const start = performance.now();
  let shuffled = start;
  let done = 0;
  const tick = (now: number) => {
    const reach = Math.min(letters.length, Math.floor(((now - start) / 1000) * rate));
    for (; done < reach; done++) {
      letters[done].removeAttribute("class");
      delete letters[done].dataset.n;
    }
    if (now - shuffled >= SHUFFLE_MS) {
      shuffled = now;
      for (let i = done; i < letters.length; i++)
        if (letters[i].dataset.n) letters[i].dataset.n = noiseFor(letters[i].textContent ?? "");
    }
    if (done < letters.length) decoding = requestAnimationFrame(tick);
  };
  decoding = requestAnimationFrame(tick);
}

// Hotspot markers live in the DOM overlay; the 3D scene moves them to their projected screen positions.
export const spotEls = new Map<string, HTMLDivElement>();
// The machines' 3D objects at the current stop, for walking collisions (registered by scene/Machine.tsx).
export const solids = new Set<import("three").Object3D>();
// Edge-of-screen arrows pointing at spots that are still unfound and out of view, keyed the same way.
export const arrowEls = new Map<string, HTMLDivElement>();
export const spotKey = (stopId: string, spotId: string) => `${stopId}/${spotId}`;

// Your progress (spots found, replays watched), kept for this browser tab (sessionStorage). The address decides
// where you land: /#<id> goes to that machine with this progress, a bare / starts the tour fresh.
const SAVE_KEY = "gra-tour";
tour.subscribe(() => {
  const s = tour.get();
  try {
    if (s.phase === "explore" && s.stop >= 0) sessionStorage.setItem(SAVE_KEY, JSON.stringify({ found: s.found, visited: s.visited, revealed: s.revealed, calls: s.calls }));
    else if (s.phase === "end") sessionStorage.removeItem(SAVE_KEY);
  } catch {
    /* storage blocked: the tour just starts fresh next time */
  }
});
export function restoreProgress() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(SAVE_KEY) || "null") as { found: Record<string, string[]>; visited: string[]; revealed: string[]; calls?: Record<string, Call> } | null;
    if (saved) tour.set({ found: saved.found ?? {}, visited: saved.visited ?? [], revealed: saved.revealed ?? [], calls: saved.calls ?? {} });
  } catch {
    /* unreadable save: carry on fresh */
  }
}
export function clearProgress() {
  try {
    sessionStorage.removeItem(SAVE_KEY);
  } catch {
    /* storage blocked: nothing saved anyway */
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
