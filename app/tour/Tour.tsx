"use client";

import { AnimatePresence, motion, MotionConfig } from "motion/react";
import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import { ArrowUp, ArrowUpRight, ChevronRight, Play } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { coarsePointer } from "./lib/device";
import { useStore } from "./lib/store";
import { FailureBank } from "./FailureBank";
// Shared with the atlas: photos each machine took, and live numbers for the ones still working.
import { liveNumbers, loadLive, photosFor } from "../atlas/live.js";
import { Overlay } from "./Overlay";
import { Spots } from "./Spots";
import { Science } from "./Science";
import { ConfirmSkip } from "./ConfirmSkip";
import { Tribute } from "./Tribute";
import { Cutscene, Interlude, MusicToggle, photoSrc, playCutscene, startMusic, useMedia, useSpotPhotos } from "./Story";
import {
  dismissIntro,
  CALLS,
  endReplay,
  makeCall,
  type Call,
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
import { CREDITS, STOP_INDEX, STOPS, STORY_COUNT, type Hotspot, type Stop } from "./stops";
import { loadAtlas, loadEarthOrbit, loadSalvage, openSite, type EarthOrbit, type Fate, type SalvageFile } from "./sites";

import "./tour.css";
import "./sites.css";

// The 3D scene only runs in the browser; the start screen's text and button render right away.
const TourCanvas = dynamic(() => import("./TourCanvas"), { ssr: false });

const TITLE = "Echoes of Exploration";
const ease = [0.22, 1, 0.36, 1] as const;

// A short briefing between Start and lift-off: what this trip is for, and how to play it.
function briefing(n: number) {
  return [
    {
      title: "We left space objects out there",
      text: `For more than 60 years, NASA has sent ${n ? n : "dozens of"} robots, landers and probes to the Moon, to Mars and into deep space. None of them came home. Some broke, some ran out of power, and a few are still working right now.`,
    },
    {
      title: "You're the salvage scout",
      text: `You'll visit ${STORY_COUNT} of them. At each site, find out what we left behind and why. Glowing spots are your clues: blue tells the story, red shows what broke. Then decide like an engineer: repair it, repurpose it, bring it home, or leave it as history?`,
    },
    {
      title: "Are you ready?",
      text: `First stop: the Moon. You'll fly ${STOPS[0].distanceKm.toLocaleString("en-US")} km to ${STOPS[0].name}, the ${STOPS[0].mission} lander at Tranquility Base, where people first walked on another world.`,
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
        Since the 1960s, NASA has left space objects on the Moon, on Mars and in deep
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
      <DebrisChip />
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
            <p className="chapter-kicker">Mission briefing</p>
            <h2 id="brief-title">{card.title}</h2>
            <p className="chapter-text">{card.text}</p>
            <div className="chapter-actions brief-actions">
              {step < steps.length - 1 ? (
                <button type="button" className="start-btn" autoFocus onClick={() => setStep(step + 1)}>
                  Next
                </button>
              ) : (
                <button type="button" className="start-btn" autoFocus onClick={startTour}>
                  Let&apos;s go
                </button>
              )}
              {step < steps.length - 1 && (
                <ConfirmSkip className="brief-skip" label="Skip briefing" question="Skip the mission briefing?" yes="Yes, skip" no="Keep reading" onConfirm={startTour} />
              )}
            </div>
          </motion.div>
        )}
        </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
      {/* The team who made the site, bottom left. */}
      <motion.div
        className="start-credit"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.8, duration: 0.8, ease }}
      >
        <p className="start-team">
          <span>Designed by</span>
          <span>Jonathan Eng</span>
          <span>Max Boucher</span>
          <span>Shourya Baranwal</span>
          <span>Abdelrahman ElSayed</span>
        </p>
      </motion.div>
      {/* The NASA Space Apps logo, bottom right. This project is a NASA Space Apps Challenge 2026 entry;
          official logo from spaceappschallenge.org/brand. */}
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

// Start screen, just off Earth's upper-right edge: the junk circling Earth, from ESA's counts; it opens the Earth's orbit card.
function DebrisChip() {
  const [d, setD] = useState<EarthOrbit | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    loadEarthOrbit().then(setD);
  }, []);
  if (!d) return null;
  return (
    <>
      <motion.button type="button" className="debris-chip" aria-haspopup="dialog" aria-label={`${d.tracked.toLocaleString("en-US")} objects circle Earth that we can track. Only ${d.satellitesWorking.toLocaleString("en-US")} of them work.`} onClick={() => setOpen(true)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.2, duration: 1.2 }}>
        <i aria-hidden="true" />
        <span aria-hidden="true">
          {d.tracked.toLocaleString("en-US")} objects circle Earth that we can track. Only {d.satellitesWorking.toLocaleString("en-US")} of them work.
        </span>
      </motion.button>
      {/* Rendered at the top of the tour, so it covers the whole screen and not just the start screen's layer. */}
      {createPortal(<EarthOrbitCard d={d} open={open} onClose={() => setOpen(false)} />, document.querySelector(".tour") ?? document.body)}
    </>
  );
}

// "What's orbiting Earth": working versus not working, the main counts, the three busy shells, ESA's credit.
function EarthOrbitCard({ d, open, onClose }: { d: EarthOrbit; open: boolean; onClose: () => void }) {
  const n = (x: number) => x.toLocaleString("en-US");
  const working = (d.satellitesWorking / d.tracked) * 100;
  return (
    <Overlay open={open} onClose={onClose} label="Earth’s orbit" className="orbit-card">
      <header className="overlay-head">
        <p className="eyebrow">Earth’s orbit · {d.asOf}</p>
        <h2>{d.title}</h2>
        <p className="overlay-lede">{d.kidLines[0]}</p>
      </header>
      <div className="orbit-bar" role="img" aria-label={`${n(d.satellitesWorking)} working satellites and ${n(d.trackedNotWorking)} objects that don't work, out of ${n(d.tracked)} tracked`}>
        <span className="orbit-on" style={{ width: `${working.toFixed(1)}%` }} />
        <span className="orbit-off" />
      </div>
      <p className="orbit-key">
        <span><i className="orbit-on" /> {n(d.satellitesWorking)} working satellites</span>
        <span><i className="orbit-off" /> {n(d.trackedNotWorking)} that don’t work: dead satellites, old rocket stages and broken pieces</span>
      </p>
      <dl className="orbit-stats">
        <div><dt>Tracked objects</dt><dd>{n(d.tracked)}</dd></div>
        <div><dt>Satellites in orbit</dt><dd>{n(d.satellitesInOrbit)}</dd></div>
        <div><dt>Dead satellites</dt><dd>{n(d.satellitesDead)}</dd></div>
        <div><dt>Break-ups and collisions</dt><dd>{n(d.fragmentationEvents)}+</dd></div>
        <div><dt>Too small to track (1–10 cm)</dt><dd>about {n(d.modelled.from1to10cm)}</dd></div>
        <div><dt>Mass of everything up there</dt><dd>{n(d.massTonnes)} tonnes</dd></div>
      </dl>
      <div className="orbit-shells">
        {d.shells.map((sh) => (
          <div key={sh.name}>
            <p className="eyebrow">{sh.altitudeKm} km up</p>
            <h3>{sh.name}</h3>
            <p>{sh.note}</p>
          </div>
        ))}
      </div>
      {d.kidLines.slice(1).map((line) => (
        <p key={line} className="orbit-line">{line}</p>
      ))}
      <p className="orbit-credit">
        {d.source.credit}. Estimates of untracked pieces: {d.modelled.reference}.{" "}
        <a href={d.source.url} target="_blank" rel="noopener noreferrer">{d.source.label} ↗</a>
      </p>
    </Overlay>
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
const allMachines = (n: number) => (n ? `all ${n} space objects` : "every space object");

const noSub = () => () => {};
// Remembered in this browser once you've reached the end of the tour.
function tourDone() {
  try {
    if (tour.get().phase === "end") localStorage.setItem("gra-tour-done", "1");
    return localStorage.getItem("gra-tour-done") === "1";
  } catch {
    return false;
  }
}

function ExploreLink() {
  const n = useMachineCount();
  const stop = useStore(tour, (s) =>
    s.phase === "explore" || s.phase === "travel" ? s.stop : -1,
  );
  const id = stop >= 0 ? STOPS[stop]?.id : null;
  // A full page load on purpose: the atlas runs its own 3D engine.
  // The tour comes first: the solar system link shows up top only once you've reached the end of the tour.
  // Read after hydration (the server never knows), so the first render matches.
  const remembered = useSyncExternalStore(noSub, tourDone, () => false);
  const done = useStore(tour, (s) => s.phase === "end") || remembered;
  return (
    <>
      {/* Top right: fly the 3D solar system (to any machine), then the full list of all of them. */}
      {done && <a className="explore-link solar-top" href={id ? `/solar?from=${encodeURIComponent(id)}` : "/solar"}>
        Fly around the solar system
        <ArrowUpRight className="explore-arrow" aria-hidden="true" />
      </a>}
      <a className={`explore-link${done ? " explore-second" : ""}`} href={id ? `/explore#${id}` : "/explore"}>
        Explore {allMachines(n)}
        <ArrowUpRight className="explore-arrow" aria-hidden="true" />
      </a>
    </>
  );
}

// Top centre (bottom left on phones): one tick per stop, done, here (or flying there), and still to come.
// Each tick takes you to its machine; its name shows on hover. During a trip, the destination's tick skips it.
function Progress() {
  const stop = useStore(tour, (s) => s.stop);
  const phase = useStore(tour, (s) => s.phase);
  const traveling = phase === "travel";
  return (
    stop >= STORY_COUNT && STOPS[stop] ? (
      <SolarBack id={STOPS[stop].id} />
    ) : (
    <motion.nav
      className="progress"
      aria-label="Tour"
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.6, ease }}
    >
      <ol className="trail">
        {STOPS.slice(0, STORY_COUNT).map((s, i) => {
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
    )
  );
}

// Outside the story (any other machine, opened from /#<id>): no trail, just the way back to the solar system.
function SolarBack({ id }: { id: string }) {
  return (
    <motion.a
      className="solar-back"
      href={`/solar?from=${encodeURIComponent(id)}`}
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.6, ease }}
    >
      <span aria-hidden="true">←</span> Back to the solar system
    </motion.a>
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
  const last = stop === STORY_COUNT - 1;
  const outside = stop >= STORY_COUNT;
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
        {outside ? (
          done && total > 0 && (
            <motion.a key="solar" className="next-machine" href={`/solar?from=${encodeURIComponent(s.id)}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease }}>
              Back to the solar system
              <ChevronRight aria-hidden="true" />
            </motion.a>
          )
        ) : done ? (
          <motion.button
            key="next"
            type="button"
            className="next-machine"
            onClick={nextStop}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease }}
          >
            {last ? "Fly home" : "Next space object"}
            <ChevronRight aria-hidden="true" />
          </motion.button>
        ) : (
          <motion.div key="count" className="spot-count-row" exit={{ opacity: 0, transition: { duration: 0.2 } }}>
            <p className="spot-count" aria-live="polite">
              {count} of {total} explored
            </p>
            {/* The quiet way out: move on without finding everything. */}
            <ConfirmSkip
              className="skip-stop"
              ariaLabel={last ? "Skip, and fly home" : "Skip to the next space object"}
              question={`Move on with ${total - count} ${total - count === 1 ? "clue" : "clues"} left to find?`}
              yes={last ? "Yes, fly home" : "Yes, move on"}
              no="Keep exploring"
              onConfirm={nextStop}
            />
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
      {/* Hold Shift with a direction: speed doubles every second. The Walker writes the "x8" here. */}
      <output className="speedo" aria-live="off" ref={(el) => { hud.speed = el; }} />
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

// Captions and a Skip button while the ghosts re-enact what happened here (scene/Ghost.tsx writes the lines, and
// setCaption in state.ts decodes each one in like a received transmission).
function ReplayBar() {
  return (
    <motion.div className="replay" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.5, ease }}>
      <p
        className="replay-line"
        aria-live="polite"
        ref={(el) => {
          hud.replayLine = el;
        }}
      />
      <ConfirmSkip className="replay-skip" label={<>Skip <ChevronRight aria-hidden="true" /></>} ariaLabel="Skip" question="Skip what happened here?" yes="Yes, skip" no="Keep watching" onConfirm={() => endReplay()} askEvent="gra-ask-skip-replay" />
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
  const photos = useSpotPhotos();
  const media = useMedia();
  const photo = spot.photo ?? photos[key];
  const film = !!(spot.video || media[key]);
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
                  · <a href={photo.source} target="_blank" rel="noopener noreferrer">source <ArrowUpRight aria-hidden="true" /></a>
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
          {spot.source.label} <ArrowUpRight aria-hidden="true" />
        </a>
        {film && (
          <button type="button" className="story-film" onClick={() => playCutscene(key)}>
            <Play aria-hidden="true" /> Watch what it saw
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
        <text x={W - pad - 13} y={pad + 4} textAnchor="end">
          N
        </text>
        <ArrowUp x={W - pad - 11} y={pad - 6} width={11} height={11} className="trail-north" aria-hidden="true" />
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
// The salvage file once loaded, shared by the case file and the end screen.
function useSalvage() {
  const [sv, setSv] = useState<SalvageFile | null>(null);
  useEffect(() => {
    loadSalvage().then(setSv);
  }, []);
  return sv;
}
const gradeLine = (sv: SalvageFile | null, id: string) => {
  const m = sv?.machines[id];
  if (!m) return null;
  if (m.working || !m.grade) return { grade: "✓", meaning: "A working mission, not salvage" };
  return { grade: m.grade, meaning: sv!.rubric.grades.find((g) => g.grade === m.grade)?.meaning ?? "" };
};

// The salvage scout's case file: why was it left, and could we use it again? Each answer unlocks as you find
// spots (the first after one spot, the second once every spot is found), with the salvage grade and one idea.
function CaseFile({ s }: { s: Stop }) {
  const found = useStore(tour, (t) => (t.found[s.id] ?? []).length);
  const sv = useSalvage();
  const total = s.hotspots.length;
  const why = s.whyLeft ?? sv?.machines[s.id]?.needsRepair?.[0]?.problem;
  const idea = sv?.machines[s.id]?.approaches?.[0];
  const reuse = s.repurpose ?? idea?.text;
  const grade = gradeLine(sv, s.id);
  const whyOpen = found >= 1 || total === 0;
  const reuseOpen = found >= total;
  if (!why && !reuse) return null;
  return (
    <div className="casefile">
      <p className="eyebrow">Case file</p>
      <div className={`case-q${whyOpen ? "" : " locked"}`}>
        <p className="case-ask">Why was it left?</p>
        <p>{whyOpen ? why : "Find a glowing spot to crack this clue."}</p>
      </div>
      <div className={`case-q${reuseOpen ? "" : " locked"}`}>
        <p className="case-ask">Could we use it again?</p>
        <p>{reuseOpen ? reuse : `Find every spot (${found} of ${total}) to make your call.`}</p>
        {reuseOpen && grade && (
          <p className="case-grade">
            <b>{grade.grade}</b> Salvage grade{grade.meaning ? `: ${grade.meaning}` : ""}
          </p>
        )}
        {reuseOpen && <CallPicker id={s.id} />}
        {reuseOpen && idea && idea.text !== reuse && (
          <p className="case-idea">
            <span>{idea.kind === "real" ? "Tried for real" : "Engineer’s idea"}:</span> {idea.text}
            {idea.source && (
              <>
                {" "}
                <a href={idea.source} target="_blank" rel="noopener noreferrer">source ↗</a>
              </>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

// The briefing promised a decision: once every clue is found, the scout makes their own call.
function CallPicker({ id }: { id: string }) {
  const call = useStore(tour, (t) => t.calls[id]);
  return (
    <div className="case-call" role="group" aria-label="Your call">
      <p className="case-ask">Your call</p>
      <div className="case-call-btns">
        {(Object.keys(CALLS) as Call[]).map((k) => (
          <button key={k} type="button" aria-pressed={call === k} onClick={() => makeCall(id, k)}>
            {CALLS[k]}
          </button>
        ))}
      </div>
    </div>
  );
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
        <CaseFile s={s} />
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
              Glowing red on the space object. Pick one to read what happened.
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
        <Science id={s.id} />
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
          <ArrowUpRight aria-hidden="true" />
        </a>
      </div>
      {/* Every failed mission in the atlas, grouped by cause, under this machine's own file. */}
      <FailureBank />
    </Overlay>
  );
}

// The readout the Director writes into. A callback ref, because AnimatePresence keeps the old readout on screen while
// it fades out: an object ref is nulled when that one unmounts, which froze the number (and a later shot with the
// same destination, such as the descent after a trip, picked up the null).
const counterRef = (el: HTMLParagraphElement | null) => {
  if (!el) return;
  hud.counter = el;
  return () => {
    if (hud.counter === el) hud.counter = null;
  };
};

function Cruise() {
  const cruise = useStore(tour, (s) => s.cruise);
  return (
    <AnimatePresence>
      {cruise && (
        <motion.div
          key={`${cruise.dest}|${cruise.label}`} // a new label (say, the descent after a trip) gets a fresh, empty readout
          className="cruise"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.3, ease }}
        >
          <p className="eyebrow">{cruise.label}</p>
          <p className="cruise-num" ref={counterRef} data-label={cruise.label} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// What the scout concluded: each story machine visited, what happened to it and its salvage grade.
function Verdicts() {
  const visitedIds = useStore(tour, (s) => s.visited.join(","));
  const calls = useStore(tour, (s) => s.calls);
  const sv = useSalvage();
  const [atlas, setAtlas] = useState<Record<string, { fate?: Fate }>>({});
  useEffect(() => {
    loadAtlas().then(setAtlas);
  }, []);
  const seen = STOPS.slice(0, STORY_COUNT).filter((s) => visitedIds.split(",").includes(s.id));
  if (!seen.length) return null;
  const grades = seen.map((s) => sv?.machines[s.id]);
  const reusable = grades.filter((m) => m?.grade && "ABC".includes(m.grade)).length;
  const gone = grades.filter((m) => m?.grade && "DF".includes(m.grade)).length;
  const working = grades.filter((m) => m?.working).length;
  return (
    <motion.div className="verdicts" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.75, duration: 0.8, ease }}>
      <p className="eyebrow">Your case files</p>
      <ul>
        {seen.map((s) => {
          const g = gradeLine(sv, s.id);
          const fate = s.info?.fate ?? atlas[s.id]?.fate;
          return (
            <li key={s.id}>
              <b className="verdict-grade">{g?.grade ?? "?"}</b>
              <span>
                <strong>{s.name}</strong> · {fate ? FATE_WORDS[fate.category] ?? fate.category : s.status}
                {calls[s.id] ? <em> · Your call: {CALLS[calls[s.id]]}</em> : g?.meaning && <em> · {g.meaning}</em>}
              </span>
            </li>
          );
        })}
      </ul>
      {sv && (
        <p className="verdict-sum">
          {Object.keys(calls).length > 0 && `You made ${Object.keys(calls).length} ${Object.keys(calls).length === 1 ? "call" : "calls"}. `}
          The engineers&apos; view: {reusable} could be visited, studied or reused one day
          {gone ? `, ${gone} ${gone === 1 ? "is" : "are"} out of reach or gone for good` : ""}
          {working ? `, and ${working} ${working === 1 ? "is" : "are"} still working` : ""}.
        </p>
      )}
    </motion.div>
  );
}

function EndScreen() {
  const visited = useStore(tour, (s) => s.visited.filter((id) => STOP_INDEX[id] !== undefined).length);
  const n = useMachineCount();
  // The trip ends with the tribute to the first rocket caught after orbit, then the scout's case files.
  const [tribute, setTribute] = useState(true);
  if (tribute) return <Tribute onDone={() => setTribute(false)} />;
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
        Every space object has a story.
      </motion.h2>
      <motion.p
        className="end-lede"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.8, ease }}
      >
        You surveyed {visited} {visited === 1 ? "space object" : "space objects"}
        {n ? ` of the ${n} in this atlas` : ""}, worked out why each was left, and judged whether it could be used
        again. The rest are still out there: on the Moon, on Mars, and sailing between the planets.
      </motion.p>
      <Verdicts />
      <motion.div
        className="end-actions"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.85, duration: 0.8, ease }}
      >
        {/* Next step after the tour: the atlas, where the reader picks their level and digs into every space object. */}
        <a className="start-btn" href="/explore">
          Explore {allMachines(n)} <ArrowUpRight aria-hidden="true" />
        </a>
        <a className="ghost-btn" href="/signals">
          Open what we heard back
        </a>
        <button type="button" className="ghost-btn" onClick={startTour}>
          Replay the trip
        </button>
        <a className="ghost-btn" href="/solar">
          Fly around the solar system →
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
    // A story stop, or any other machine in the atlas (built on first visit, see sites.ts).
    const go = async () => {
      const id = decodeURIComponent(location.hash.slice(1));
      const i = STOP_INDEX[id] ?? (id ? await openSite(id) : null);
      const s = tour.get();
      if (i == null || (s.stop === i && s.phase !== "start")) return;
      requestTravel(i, "jump");
    };
    // Coming back (from the atlas, a reload, the browser's Back): pick up where you left off, with your progress.
    const hashId = decodeURIComponent(location.hash.slice(1));
    const back = restoreProgress(STOP_INDEX[hashId]);
    // A link to another machine (/#surveyor3) goes there, not back to the saved story stop.
    if (back != null && (!hashId || STOP_INDEX[hashId] !== undefined)) {
      startMusic();
      requestTravel(back, "jump");
    } else void go();
    const onHash = () => void go();
    addEventListener("hashchange", onHash);
    return () => removeEventListener("hashchange", onHash);
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
      // Esc during a replay asks first (press it again to keep watching).
      if (s.replay) return void dispatchEvent(new Event("gra-ask-skip-replay"));
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
  const replaying = phase === "explore" && !!replay;
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
          data-on={reading || replaying ? "story" : touring ? "nav" : undefined}
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
          {replaying && <ReplayBar key="replay" />}
        </AnimatePresence>
        {phase === "explore" && (
          <p className="edge-hint" role="status">
            You&apos;ve wandered too far! Head back to the site.
          </p>
        )}
        {phase === "explore" && !replay && <MissionFile />}
        <Cruise />
        <p className="trip-chip" aria-live="polite" ref={(el) => { hud.chip = el; }} />
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
