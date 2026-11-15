"use client";

import { AnimatePresence, motion, MotionConfig } from "motion/react";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { coarsePointer } from "./lib/device";
import { useStore } from "./lib/store";
import { FailureBank } from "./FailureBank";
// Shared with the atlas: photos each machine took, and live numbers for the ones still working.
import { liveNumbers, loadLive, photosFor } from "../atlas/live.js";
import { Overlay } from "./Overlay";
import { Spots } from "./Spots";
import { Cutscene, Interlude, MusicToggle, photoSrc, playCutscene, startMusic, useMedia, useSpotPhotos } from "./Story";
import {
  dismissIntro,
  endReplay,
  goToStop,
  hud,
  nextStop,
  openHotspot,
  requestTravel,
  restoreProgress,
  setFileOpen,
  spotKey,
  spotsLeft,
  startTour,
  tour,
} from "./state";
import { CREDITS, STOP_INDEX, STOPS, type Hotspot, type Stop } from "./stops";
import "./tour.css";

// The 3D scene only runs in the browser; the start screen's text and button render right away.
const TourCanvas = dynamic(() => import("./TourCanvas"), { ssr: false });

const TITLE = "Ruins Among the Stars";
const ease = [0.22, 1, 0.36, 1] as const;

// A short briefing between Start and lift-off: what this trip is for, and how to play it.
function briefing(n: number) {
  return [
    {
      title: "We left machines out there",
      text: `For more than 60 years, NASA has sent ${n ? n : "dozens of"} robots, landers and probes to the Moon, to Mars and into deep space. None of them came home. Some broke, some ran out of power, and a few are still working right now.`,
    },
    {
      title: "You're the salvage scout",
      text: `You'll first visit ${STOPS.length} of them, one chapter at a time. At each one, your job is to survey the site: discover what we sent there, what we left behind, and why it was left. The glowing spots are your clues: blue ones tell the story, red ones show what broke. Then think like an engineer: could we fix it, reuse it, or bring it home one day?`,
    },
  ];
}

function StartScreen() {
  const ready = useStore(tour, (s) => s.sceneReady);
  const n = useMachineCount();
  const [step, setStep] = useState(-1); // -1 = title screen, then one card per briefing step
  const steps = briefing(n);
  const card = steps[step];
  const briefed = step >= 0;
  return (
    <motion.section
      className="start"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, y: -40, transition: { duration: 0.7, ease } }}
    >
      {/* The title, lede and Start button fade away once the briefing opens over them. */}
      <motion.div
        className="start-hero"
        inert={briefed}
        initial={false}
        animate={briefed ? { opacity: 0, y: -24 } : { opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease }}
      >
      {/* Letters animate in one by one; each word stays whole, so a narrow screen wraps between words. */}
      <h1 aria-label={TITLE}>
        {TITLE.split(" ").map((word, w, words) => {
          const before = words.slice(0, w).join(" ").length + (w ? 1 : 0);
          return (
            <span key={w}>
              {w > 0 && " "}
              <span className="start-word">
                {word.split("").map((ch, i) => (
                  <motion.span
                    key={i}
                    aria-hidden="true"
                    initial={{ opacity: 0, y: 26, filter: "blur(8px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    transition={{ delay: 0.25 + (before + i) * 0.03, duration: 0.9, ease }}
                  >
                    {ch}
                  </motion.span>
                ))}
              </span>
            </span>
          );
        })}
      </h1>
      <motion.p
        className="start-lede"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.0, duration: 0.8, ease }}
      >
        Since the 1960s, NASA has left machines on the Moon, on Mars and in deep
        space. Visit them and discover their stories.
      </motion.p>
      <motion.button
        type="button"
        className="start-btn"
        onClick={() => { setStep(0); startMusic(); }}
        disabled={!ready}
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.4, duration: 0.8, ease }}
      >
        {ready ? "Start" : "Loading…"}
      </motion.button>
      </motion.div>
      {/* Mission briefing: a full-screen overlay like the story chapters, one card per step. */}
      <AnimatePresence>
        {briefed && (
          <motion.div
            key="brief"
            className="chapter brief"
            role="dialog"
            aria-modal="true"
            aria-labelledby="brief-title"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ delay: 0.2, duration: 0.6 }}
          >
        <AnimatePresence mode="wait">
        {card && (
          <motion.div
            key={step}
            className="chapter-card"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.5, ease }}
          >
            <p className="chapter-kicker">Mission briefing · {step + 1} of {steps.length}</p>
            <h2 id="brief-title">{card.title}</h2>
            <p className="chapter-text">{card.text}</p>
            <div className="chapter-actions brief-actions">
              {step < steps.length - 1 ? (
                <button type="button" className="start-btn" autoFocus onClick={() => setStep(step + 1)}>
                  Next
                </button>
              ) : (
                <button type="button" className="start-btn" autoFocus onClick={startTour}>
                  Launch
                </button>
              )}
              {step < steps.length - 1 && (
                <button type="button" className="brief-skip" onClick={startTour}>
                  Skip briefing
                </button>
              )}
            </div>
          </motion.div>
        )}
        </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
      {/* This project is a NASA Space Apps Challenge 2026 entry; official logo from spaceappschallenge.org/brand. */}
      <motion.a
        className="start-badge"
        href="https://www.spaceappschallenge.org/"
        target="_blank"
        rel="noopener noreferrer"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.8, duration: 0.8, ease }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- a static SVG needs no image optimization */}
        <img
          src="/img/space-apps-logo.svg"
          alt="NASA Space Apps Challenge"
          width={561}
          height={221}
        />
      </motion.a>
    </motion.section>
  );
}

// How many machines the atlas holds, read from its data rather than written in by hand.
function useMachineCount() {
  const [n, setN] = useState(0);
  useEffect(() => {
    loadAtlas().then((d) => setN(Object.keys(d).length));
  }, []);
  return n;
}
const allMachines = (n: number) => (n ? `all ${n} machines` : "every machine");

function ExploreLink() {
  const n = useMachineCount();
  const stop = useStore(tour, (s) =>
    s.phase === "explore" || s.phase === "travel" ? s.stop : -1,
  );
  const id = stop >= 0 ? STOPS[stop]?.id : null;
  // A full page load on purpose: the atlas runs its own 3D engine.
  return (
    <a className="explore-link" href={id ? `/explore#${id}` : "/explore"}>
      Explore {allMachines(n)}
      <svg
        className="explore-arrow"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M4.5 11.5l7-7M5.5 4.5h6v6" />
      </svg>
    </a>
  );
}

// Top centre (bottom left on phones): one tick per stop, done, here (or flying there), and still to come.
// Each tick takes you to its machine; its name shows on hover. During a trip, the destination's tick skips it.
function Progress() {
  const stop = useStore(tour, (s) => s.stop);
  const phase = useStore(tour, (s) => s.phase);
  const traveling = phase === "travel";
  return (
    <motion.nav
      className="progress"
      aria-label="Tour"
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.6, ease }}
    >
      <ol className="trail">
        {STOPS.map((s, i) => {
          const here = i === stop;
          const state = i < stop ? " done" : here ? (traveling ? " going" : " here") : "";
          const label = here ? (traveling ? `${s.name} (skip the trip)` : `${s.name} (you are here)`) : `Go to ${s.name}`;
          return (
            <li key={s.id}>
              <button
                type="button"
                className={`trail-tick${state}`}
                data-name={s.name}
                aria-label={label}
                aria-current={here ? "step" : undefined}
                disabled={traveling ? !here : here}
                onClick={() => goToStop(i)}
              />
            </li>
          );
        })}
      </ol>
    </motion.nav>
  );
}

function Chevron() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}

const NONE: string[] = [];

// Bottom right: the minimap, then one dot per glowing spot on this machine, filled once you've opened it. With
// every spot explored, the count (and its Skip) gives way to the Next machine button.
function SpotProgress() {
  const stop = useStore(tour, (s) => s.stop);
  const s = STOPS[stop];
  const seen = useStore(tour, (t) => (s && t.found[s.id]) || NONE);
  if (!s) return null;
  const total = s.hotspots.length;
  const count = s.hotspots.filter((h) => seen.includes(h.id)).length;
  const done = count >= total;
  const last = stop === STOPS.length - 1;
  return (
    <motion.div
      key={s.id}
      className="spot-progress"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ delay: 0.3, duration: 0.6, ease }}
    >
      <Minimap />
      <ol className="spot-pips" aria-hidden="true">
        {s.hotspots.map((h) => (
          <li key={h.id} className={`spot-pip${seen.includes(h.id) ? " seen" : ""}${h.broken ? " broken" : ""}`} />
        ))}
      </ol>
      <AnimatePresence mode="wait" initial={false}>
        {done ? (
          <motion.button
            key="next"
            type="button"
            className="next-machine"
            onClick={nextStop}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease }}
          >
            {last ? "Fly home" : "Next machine"}
            <Chevron />
          </motion.button>
        ) : (
          <motion.div key="count" className="spot-count-row" exit={{ opacity: 0, transition: { duration: 0.2 } }}>
            <p className="spot-count" aria-live="polite">
              {count} of {total} explored
            </p>
            {/* The quiet way out: move on without finding everything. */}
            <button type="button" className="skip-stop" onClick={nextStop} aria-label={last ? "Skip, and fly home" : "Skip to the next machine"}>
              Skip
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function NamePlate() {
  const stop = useStore(tour, (s) => s.stop);
  const s = STOPS[stop];
  if (!s) return null;
  return (
    <motion.header
      key={s.id}
      className="plate"
      initial={{ opacity: 0, x: -24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -24 }}
      transition={{ duration: 0.6, ease }}
    >
      <p className="eyebrow">
        {s.chapter} · {s.mission}
      </p>
      <h2 aria-live="polite">{s.name}</h2>
      <p className="plate-status">{s.status}</p>
      <button
        type="button"
        className="learn-more"
        aria-haspopup="dialog"
        onClick={() => setFileOpen(true)}
      >
        Learn more
      </button>
    </motion.header>
  );
}

// Bottom centre: the controls, the whole time you're at a site. What it says follows whether the view has the
// mouse (the Walker puts .looking on .tour), so the CSS swaps the two lines.
function KeysBar() {
  const stop = useStore(tour, (s) => s.stop);
  const s = STOPS[stop];
  if (!s) return null;
  const space = s.setting.kind === "space";
  const move = (
    <>
      <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> {space ? "fly" : "walk"}</span>
      <span><kbd>Shift</kbd> faster</span>
      {space ? (
        <span><kbd>Space</kbd> up · <kbd>C</kbd> down</span>
      ) : (
        <>
          <span><kbd>Space</kbd> jump</span>
          <span><kbd>Ctrl</kbd> crouch</span>
        </>
      )}
    </>
  );
  const fade = { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0 }, transition: { duration: 0.5, ease } };
  if (coarsePointer())
    return (
      <motion.p className="keysbar" {...fade}>
        <span>Drag to look around</span>
        <span>Tap the glowing dots</span>
      </motion.p>
    );
  return (
    <motion.div className="keysbar" {...fade}>
      <p className="keys-free"><span><b>Click</b> the view to look around</span>{move}<span>Click a glowing dot</span></p>
      <p className="keys-locked"><span className="esc"><kbd>Esc</kbd> frees your mouse</span>{move}<span>Aim at a dot and click</span></p>
    </motion.div>
  );
}

// The minimap's canvas, over the spot dots; the 3D scene draws on it every frame (scene/Hotspots.tsx).
function Minimap() {
  const left = useStore(tour, (s) => spotsLeft(s));
  return (
    <canvas
      className="minimap"
      ref={(el) => {
        hud.minimap = el;
      }}
      role="img"
      aria-label={`Map of the site: you are in the middle, facing up. ${left ? `${left} glowing spot${left === 1 ? "" : "s"} left to find.` : "Every spot found."}`}
    />
  );
}

// Captions and a Skip button while the ghosts re-enact what happened here (scene/Ghost.tsx writes the lines).
function ReplayBar() {
  return (
    <motion.div className="replay" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.5, ease }}>
      <p className="replay-tag">Back in time</p>
      <p
        className="replay-line"
        aria-live="polite"
        ref={(el) => {
          hud.replayLine = el;
        }}
      />
      <span className="replay-progress" aria-hidden="true">
        <b
          ref={(el) => {
            hud.replayBar = el;
          }}
        />
      </span>
      <button type="button" className="replay-skip" onClick={() => endReplay()}>
        Skip
      </button>
    </motion.div>
  );
}

// Bottom left, straight on the scene over a shadow from the bottom edge: the arrival introduction, or the story
// of the glowing spot that's open.
function Story() {
  const stop = useStore(tour, (s) => s.stop);
  const introOpen = useStore(tour, (s) => s.introOpen);
  const openSpot = useStore(tour, (s) => s.openSpot);
  const s = STOPS[stop];
  const spot = s && openSpot ? s.hotspots.find((h) => h.id === openSpot) : undefined;
  return (
    <div className="story" aria-live="polite">
      <AnimatePresence mode="wait">
        {s && spot ? (
          <SpotStory key={spot.id} stopId={s.id} spot={spot} />
        ) : s && introOpen ? (
          <Intro key={`intro-${s.id}`} s={s} />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

// A spot's story: its real photo (public/media/spot-photos.json) when there is one, the text, the source, and
// the part's own footage when it has some (media.json).
function SpotStory({ stopId, spot }: { stopId: string; spot: Hotspot }) {
  const key = spotKey(stopId, spot.id);
  const photo = useSpotPhotos()[key];
  const film = !!useMedia()[key];
  const src = photo && photoSrc(photo.file);
  return (
    <motion.article
      className={`story-spot${spot.broken ? " broken" : ""}`}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8, transition: { duration: 0.2 } }}
      transition={{ duration: 0.45, ease }}
    >
      {photo && src && (
        <figure className="story-photo">
          {/* eslint-disable-next-line @next/next/no-img-element -- static file with its own credit line */}
          <img src={src} alt={photo.alt} width={photo.w} height={photo.h} loading="lazy" />
          <figcaption>
            {photo.caption}{" "}
            <span>
              {photo.credit} · {photo.license}
              {photo.source && (
                <>
                  {" "}
                  · <a href={photo.source} target="_blank" rel="noopener noreferrer">source ↗</a>
                </>
              )}
            </span>
          </figcaption>
        </figure>
      )}
      {spot.broken && <p className="story-tag">{spot.tag ?? "Broken part"}</p>}
      <h3>{spot.title}</h3>
      <p className="story-text">{spot.text}</p>
      <div className="story-actions">
        <a className="story-source" href={spot.source.url} target="_blank" rel="noopener noreferrer">
          {spot.source.label} <span aria-hidden="true">↗</span>
        </a>
        {film && (
          <button type="button" className="story-film" onClick={() => playCutscene(key)}>
            <span aria-hidden="true">▶</span> Watch what it saw
          </button>
        )}
      </div>
    </motion.article>
  );
}

function Intro({ s }: { s: Stop }) {
  return (
    <motion.div
      className="story-intro"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12, transition: { duration: 0.3 } }}
      transition={{ delay: 0.15, duration: 0.7, ease }}
    >
      <p className="eyebrow">{s.when}</p>
      <p className="story-text">{s.intro}</p>
    </motion.div>
  );
}

// The atlas's record for a machine: what happened to it, colour-coded the same way as the atlas.
type Fate = { category: string; label: string; summary?: string };
const FATE_WORDS: Record<string, string> = {
  operational: "Still working",
  passive: "Still useful, needs no power",
  "left-behind": "Left behind on purpose",
  "switched-off": "Switched off",
  power: "Ran out of power",
  comms: "Lost contact",
  stuck: "Got stuck",
  damaged: "Damaged",
  "crash-accident": "Crashed by accident",
  "crash-planned": "Ended on purpose",
  lost: "Fate unknown",
};
const FAILED = new Set([
  "power",
  "comms",
  "stuck",
  "damaged",
  "crash-accident",
  "lost",
]);
type AtlasRecord = { id: string; fate?: Fate; funFact?: string };
type Route = {
  segments: { name?: string; points: [number, number][] }[];
  credit?: string;
  source?: string;
};
let routeData: Promise<Record<string, Route>> | null = null;
function loadRoutes() {
  routeData ??= fetch("/data/routes.json")
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}));
  return routeData;
}
const RADIUS_KM: Record<string, number> = { moon: 1737.4, mars: 3389.5 };

// The machine's whole drive as a little map: start (hollow), where it is now (filled), and a scale bar.
function RouteMap({ route, body }: { route: Route; body: string }) {
  const pts = route.segments.flatMap((g) => g.points);
  const R = RADIUS_KM[body];
  if (pts.length < 2 || !R) return null;
  const lat0 =
    (pts.reduce((a, p) => a + p[0], 0) / pts.length) * (Math.PI / 180);
  // Kilometres east and north of the first point.
  const km = (p: [number, number]): [number, number] => [
    (((p[1] - pts[0][1]) * Math.PI) / 180) * R * Math.cos(lat0),
    (((p[0] - pts[0][0]) * Math.PI) / 180) * R,
  ];
  const xy = pts.map(km);
  const xs = xy.map((p) => p[0]),
    ys = xy.map((p) => p[1]);
  const [x0, x1, y0, y1] = [
    Math.min(...xs),
    Math.max(...xs),
    Math.min(...ys),
    Math.max(...ys),
  ];
  const W = 260,
    H = 150,
    pad = 12;
  const k = Math.min(
    (W - 2 * pad) / Math.max(x1 - x0, 1e-3),
    (H - 2 * pad) / Math.max(y1 - y0, 1e-3),
  );
  const ox = (W - (x1 - x0) * k) / 2,
    oy = (H - (y1 - y0) * k) / 2;
  const P = ([x, y]: [number, number]) =>
    [ox + (x - x0) * k, H - (oy + (y - y0) * k)] as const;
  const d = route.segments
    .map((g) =>
      g.points
        .map((p, i) => {
          const [a, b] = P(km(p));
          return `${i ? "L" : "M"}${a.toFixed(1)} ${b.toFixed(1)}`;
        })
        .join(""),
    )
    .join("");
  const [sx, sy] = P(xy[0]);
  const [ex, ey] = P(xy[xy.length - 1]);
  // A round scale length about a quarter of the map's width.
  const want = W / 4 / k;
  const nice =
    [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100].find(
      (v) => v >= want,
    ) ?? Math.round(want);
  const label = nice < 1 ? `${Math.round(nice * 1000)} m` : `${nice} km`;
  return (
    <figure className="mfile-trail">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Map of the path it drove, from start to where it stopped"
      >
        <path d={d} className="trail-line" />
        <circle cx={sx} cy={sy} r="4.5" className="trail-start" />
        <circle cx={ex} cy={ey} r="5" className="trail-end" />
        <g transform={`translate(${pad} ${H - 10})`}>
          <rect width={nice * k} height="3" className="trail-scale" />
          <text y="-5">{label}</text>
        </g>
        <text x={W - pad} y={pad + 4} textAnchor="end">
          N ↑
        </text>
      </svg>
      <figcaption>
        <span>
          <i className="legend-dot legend-start" /> Start
        </span>{" "}
        <span>
          <i className="legend-dot legend-end" /> Where it stopped
        </span>
      </figcaption>
    </figure>
  );
}
let atlasData: Promise<Record<string, AtlasRecord>> | null = null;
function loadAtlas() {
  atlasData ??= Promise.all(
    ["moon", "mars", "deepspace"].map(
      (w) =>
        fetch(`/data/${w}.json`).then((r) => (r.ok ? r.json() : [])) as Promise<
          AtlasRecord[]
        >,
    ),
  )
    .then((lists) => Object.fromEntries(lists.flat().map((m) => [m.id, m])))
    .catch(() => ({}));
  return atlasData;
}

// The "mission file" beside the scene: what happened, the part that gave out, key numbers, and planned vs actual.
function MissionFile() {
  const stop = useStore(tour, (s) => s.stop);
  const s = STOPS[stop];
  // Kept with the stop's id so a slow load never shows the previous stop's fate.
  const [got, setGot] = useState<{
    id: string;
    fate: Fate | null;
    fun?: string;
    route?: Route;
  } | null>(null);
  const fate = s?.info?.fate ?? (s && got?.id === s.id ? got.fate : null);
  const fun = s?.info?.fun ?? (s && got?.id === s.id ? got.fun : undefined);
  const route = s && got?.id === s.id ? got.route : undefined;
  type Photo = {
    file: string;
    w: number;
    h: number;
    caption: string;
    credit: string;
    license: string;
    source?: string;
  };
  type LiveRow = {
    key: string;
    label: string;
    value: string;
    note: string;
    kind: string;
  };
  const [media, setMedia] = useState<{
    id: string;
    photos: Photo[];
    live: unknown;
  } | null>(null);
  const photos = s && media?.id === s.id ? media.photos : [];
  const liveEntry = s && media?.id === s.id ? media.live : null;
  const [rows, setRows] = useState<LiveRow[]>([]);
  useEffect(() => {
    let off = false;
    if (s)
      Promise.all([photosFor(s.id), loadLive()])
        .then(
          ([p, l]) =>
            !off &&
            setMedia({
              id: s.id,
              photos: (p as Photo[]).slice(0, 3),
              live: (l as Record<string, unknown>)[s.id] ?? null,
            }),
        )
        .catch(() => {});
    return () => {
      off = true;
    };
  }, [s]);
  // Live numbers tick every second (Voyager's distance grows by about 17 km each second).
  useEffect(() => {
    if (!liveEntry) return;
    const tick = () => setRows(liveNumbers(liveEntry, Date.now()) as LiveRow[]);
    const t = setInterval(tick, 1000);
    const first = setTimeout(tick, 0);
    return () => {
      clearInterval(t);
      clearTimeout(first);
    };
  }, [liveEntry]);
  const open = useStore(tour, (t) => t.fileOpen);
  useEffect(() => {
    let off = false;
    if (s)
      Promise.all([loadAtlas(), loadRoutes()]).then(
        ([d, r]) =>
          !off &&
          setGot({
            id: s.id,
            fate: d[s.id]?.fate ?? null,
            fun: d[s.id]?.funFact,
            route: r[s.id],
          }),
      );
    return () => {
      off = true;
    };
  }, [s]);
  if (!s) return null;
  const broken = s.hotspots.filter((h) => h.broken);
  const plan = s.info?.plan;
  // Linear on purpose: a tiny "planned" sliver next to a full bar is the point.
  const big = plan ? Math.max(plan.planned, plan.actual) : 1;
  const scale = (v: number) => v / big;
  const failed = fate && FAILED.has(fate.category);
  return (
    <Overlay
      open={open}
      onClose={() => setFileOpen(false)}
      label="Mission file"
      className="mfile"
    >
      <header className="overlay-head">
        <p className="eyebrow">{s.mission}</p>
        <h2>{s.name}</h2>
        <p className="overlay-lede">{s.status}</p>
      </header>
      <div className="mfile-body">
        {fate && (
          <div className={`mfile-fate${failed ? " bad" : ""}`}>
            <p className="eyebrow">What happened</p>
            <p className="mfile-fate-cat">
              {FATE_WORDS[fate.category] ?? fate.category}
            </p>
            <p className="mfile-fate-label">{fate.label}</p>
          </div>
        )}
        {broken.length > 0 && (
          <div className="mfile-broken">
            <p className="eyebrow">{broken[0].tag ?? "Broken part"}</p>
            <ul>
              {broken.map((h) => (
                <li key={h.id}>
                  <button type="button" onClick={() => openHotspot(s.id, h.id)}>
                    {h.title}
                  </button>
                </li>
              ))}
            </ul>
            <p className="mfile-small">
              Glowing red on the machine. Pick one to read what happened.
            </p>
          </div>
        )}
        {s.info && (
          <dl className="mfile-stats">
            {s.info.stats.map((x) => (
              <div key={x.label}>
                <dt>{x.label}</dt>
                <dd>{x.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {plan && (
          <div className="mfile-plan">
            <p className="eyebrow">{plan.label}</p>
            <div className="mfile-bar">
              <span className="lbl">Planned</span>
              <span className="track">
                <b
                  className="planned"
                  style={{
                    width: `${(scale(plan.planned) * 100).toFixed(1)}%`,
                  }}
                />
              </span>
              <span className="num">
                {plan.planned.toLocaleString("en-US")}
              </span>
            </div>
            <div className="mfile-bar">
              <span className="lbl">
                {plan.actual >= plan.planned ? "Actual" : "Used"}
              </span>
              <span className="track">
                <b
                  className="actual"
                  style={{
                    width: `${(scale(plan.actual) * 100).toFixed(1)}%`,
                  }}
                />
              </span>
              <span className="num">{plan.actual.toLocaleString("en-US")}</span>
            </div>
            <p className="mfile-small">
              {plan.note} <span className="unit">({plan.unit})</span>
            </p>
          </div>
        )}
        {route && (
          <div>
            <p className="eyebrow">The path it took</p>
            <RouteMap route={route} body={s.body} />
          </div>
        )}
        {!!liveEntry && rows.length > 0 && (
          <div className="mfile-live">
            <p className="eyebrow">Right now</p>
            <dl className="mfile-stats">
              {rows.slice(0, 4).map((r) => (
                <div key={r.key}>
                  <dt>{r.label}</dt>
                  <dd>{r.value}</dd>
                </div>
              ))}
            </dl>
            <p className="mfile-small">
              Calculated from NASA/JPL tracking data, updating every second.
            </p>
          </div>
        )}
        {photos.length > 0 && (
          <div className="mfile-wide">
            <p className="eyebrow">Photos</p>
            <div className="mfile-photos">
              {photos.map((p) => (
                <figure key={p.file}>
                  <a
                    href={p.source || `/${p.file}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {/* Plain img: the site is also published as a static artifact with no image optimiser. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/${p.file}`}
                      width={p.w}
                      height={p.h}
                      alt={p.caption}
                      loading="lazy"
                    />
                  </a>
                  <figcaption>
                    {p.caption}{" "}
                    <span className="credit">
                      {p.credit} · {p.license}
                    </span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        )}
        {fun && (
          <div className="mfile-fun">
            <p className="eyebrow">Fun fact</p>
            <p>{fun}</p>
          </div>
        )}
        {/* A full page load on purpose: the atlas runs its own 3D engine. */}
        <a className="mfile-more mfile-wide" href={`/explore#${s.id}`}>
          Full story, photos and links in the atlas{" "}
          <span aria-hidden="true">↗</span>
        </a>
      </div>
      {/* Every failed mission in the atlas, grouped by cause, under this machine's own file. */}
      <FailureBank />
    </Overlay>
  );
}

function Cruise() {
  const cruise = useStore(tour, (s) => s.cruise);
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    hud.counter = ref.current;
    return () => {
      hud.counter = null;
    };
  }, [cruise]);
  return (
    <AnimatePresence>
      {cruise && (
        <motion.div
          key={cruise.dest}
          className="cruise"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.3, ease }}
        >
          <p className="eyebrow">{cruise.label}</p>
          <p className="cruise-num" ref={ref} />
          <p className="cruise-dest">{cruise.dest}</p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function EndScreen() {
  const visited = useStore(tour, (s) => s.visited.length);
  const n = useMachineCount();
  return (
    <motion.section
      className="end"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8 }}
    >
      <motion.h2
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.9, ease }}
      >
        Every machine has a story.
      </motion.h2>
      <motion.p
        className="end-lede"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.8, ease }}
      >
        You visited {visited} {visited === 1 ? "machine" : "machines"}
        {n ? ` of the ${n} in this atlas` : ""}. The rest are still out there: on the Moon, on Mars, and sailing
        between the planets.
      </motion.p>
      <motion.div
        className="end-actions"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.85, duration: 0.8, ease }}
      >
        <button type="button" className="start-btn" onClick={startTour}>
          Replay the trip
        </button>
        <a className="ghost-btn" href="/explore">
          Explore {allMachines(n)} ↗
        </a>
      </motion.div>
      <motion.details
        className="credits"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.1, duration: 0.8 }}
      >
        <summary>Credits and sources</summary>
        {CREDITS.map((c) => (
          <p key={c}>{c}</p>
        ))}
        <p>NASA Space Apps 2026 · Abandoned but not Forgotten</p>
      </motion.details>
    </motion.section>
  );
}

// Keeps the URL in step with the tour (/#ingenuity), and follows the URL if someone edits it.
function useHashSync() {
  const phase = useStore(tour, (s) => s.phase);
  const stop = useStore(tour, (s) => s.stop);
  useEffect(() => {
    const go = () => {
      const id = decodeURIComponent(location.hash.slice(1));
      const i = STOP_INDEX[id];
      const s = tour.get();
      if (i === undefined || (s.stop === i && s.phase !== "start")) return;
      requestTravel(i, "jump");
    };
    // Coming back (from the atlas, a reload, the browser's Back): pick up where you left off, with your progress.
    const back = restoreProgress(STOP_INDEX[decodeURIComponent(location.hash.slice(1))]);
    if (back != null) {
      startMusic();
      requestTravel(back, "jump");
    } else go();
    addEventListener("hashchange", go);
    return () => removeEventListener("hashchange", go);
  }, []);
  useEffect(() => {
    const id =
      phase === "explore" || phase === "travel" ? STOPS[stop]?.id : null;
    const want = id ? `#${id}` : "";
    if (location.hash !== want)
      history.replaceState(null, "", want || location.pathname);
  }, [phase, stop]);
}

export default function Tour() {
  const phase = useStore(tour, (s) => s.phase);
  const introOpen = useStore(tour, (s) => s.introOpen);
  const openSpot = useStore(tour, (s) => s.openSpot);
  const interlude = useStore(tour, (s) => s.interlude);
  const cutscene = useStore(tour, (s) => s.cutscene);
  const replay = useStore(tour, (s) => s.replay);
  const fade = useRef<HTMLDivElement>(null);
  useHashSync();

  useEffect(() => {
    hud.fade = fade.current;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const s = tour.get();
      if (s.replay) return endReplay();
      if (s.openSpot) openHotspot(STOPS[s.stop].id, null);
      else dismissIntro();
    };
    addEventListener("keydown", onKey);
    return () => {
      hud.fade = null;
      removeEventListener("keydown", onKey);
    };
  }, []);

  const touring = phase === "travel" || phase === "explore";
  // At a site and it's your turn: not while the ghosts replay what happened here, nor under a story card.
  const site = phase === "explore" && !replay && interlude == null;
  const reading = site && (introOpen || !!openSpot);
  return (
    <MotionConfig reducedMotion="user">
      <div className="tour">
        <TourCanvas />
        {/* Soft shadows from the screen edges, so text can sit straight on the scene without a card. */}
        <div
          className="scrim scrim-top"
          data-on={touring || undefined}
          aria-hidden="true"
        />
        <div
          className="scrim scrim-bottom"
          data-on={reading ? "story" : touring ? "nav" : undefined}
          aria-hidden="true"
        />
        <Spots />
        <div className="fade" ref={fade} aria-hidden="true" />
        <ExploreLink />
        <AnimatePresence>
          {phase === "start" && interlude == null && <StartScreen key="start" />}
        </AnimatePresence>
        <AnimatePresence>
          {phase === "explore" && <NamePlate key="plate" />}
        </AnimatePresence>
        {site && <Story />}
        <AnimatePresence>
          {site && <SpotProgress key="spots" />}
        </AnimatePresence>
        <AnimatePresence>
          {site && !reading && <KeysBar key="keys" />}
        </AnimatePresence>
        <AnimatePresence>
          {phase === "explore" && replay && <ReplayBar key="replay" />}
        </AnimatePresence>
        {phase === "explore" && (
          <p className="edge-hint" role="status">
            That&apos;s far enough. Head back to the site.
          </p>
        )}
        {phase === "explore" && !replay && <MissionFile />}
        <Cruise />
        <AnimatePresence>
          {touring && interlude == null && <Progress key="progress" />}
        </AnimatePresence>
        <AnimatePresence>
          {interlude != null && <Interlude key="story" />}
        </AnimatePresence>
        <AnimatePresence>
          {cutscene && <Cutscene key="cut" />}
        </AnimatePresence>
        <MusicToggle />
        <AnimatePresence>
          {phase === "end" && <EndScreen key="end" />}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
