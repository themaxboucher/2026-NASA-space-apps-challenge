"use client";

import { AnimatePresence, motion, MotionConfig } from "motion/react";
import dynamic from "next/dynamic";
import { useEffect, useRef } from "react";
import { coarsePointer } from "./lib/device";
import { useStore } from "./lib/store";
import { Spots } from "./Spots";
import { dismissIntro, hud, nextStop, openHotspot, previousStop, requestTravel, startTour, tour } from "./state";
import { CHAPTERS, CREDITS, STOP_INDEX, STOPS } from "./stops";
import "./tour.css";

// The 3D scene only runs in the browser; the start screen's text and button render right away.
const TourCanvas = dynamic(() => import("./TourCanvas"), { ssr: false });

const TITLE = "Ghost Rover Atlas";
const ease = [0.22, 1, 0.36, 1] as const;

function StartScreen() {
  const ready = useStore(tour, (s) => s.sceneReady);
  return (
    <motion.section className="start" initial={{ opacity: 1 }} exit={{ opacity: 0, y: -40, transition: { duration: 0.7, ease } }}>
      <h1 aria-label={TITLE}>
        {TITLE.split("").map((ch, i) => (
          <motion.span
            key={i}
            aria-hidden="true"
            initial={{ opacity: 0, y: 26, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ delay: 0.25 + i * 0.045, duration: 0.9, ease }}
          >
            {ch === " " ? " " : ch}
          </motion.span>
        ))}
      </h1>
      <motion.button
        type="button"
        className="start-btn"
        onClick={startTour}
        disabled={!ready}
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.3, duration: 0.8, ease }}
      >
        {ready ? "Start" : "Loading…"}
      </motion.button>
    </motion.section>
  );
}

function ExploreLink() {
  const stop = useStore(tour, (s) => (s.phase === "explore" || s.phase === "travel" ? s.stop : -1));
  const id = stop >= 0 ? STOPS[stop]?.id : null;
  // A full page load on purpose: the atlas runs its own 3D engine.
  return (
    <a className="explore-link" href={id ? `/explore#${id}` : "/explore"}>
      Explore all 79 machines <span aria-hidden="true">↗</span>
    </a>
  );
}

function Trail() {
  const stop = useStore(tour, (s) => s.stop);
  const phase = useStore(tour, (s) => s.phase);
  return (
    <ol className="trail" aria-label="Tour progress">
      {CHAPTERS.map((chapter) => (
        <li key={chapter} className="trail-group">
          <span className="trail-label">{chapter}</span>
          <span className="trail-dots">
            {STOPS.map((s, i) =>
              s.chapter !== chapter ? null : (
                <span
                  key={s.id}
                  className={`trail-dot${i < stop ? " done" : ""}${i === stop ? (phase === "travel" ? " going" : " here") : ""}`}
                  aria-label={`${s.name}${i === stop ? " (current)" : ""}`}
                  title={s.name}
                />
              ),
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}

function Controls() {
  const phase = useStore(tour, (s) => s.phase);
  const stop = useStore(tour, (s) => s.stop);
  const traveling = phase === "travel";
  const last = stop === STOPS.length - 1;
  const nextLabel = traveling ? "Skip" : last ? "Fly home" : "Next";
  const nextName = traveling ? null : last ? "Earth" : STOPS[stop + 1]?.name;
  return (
    <motion.nav className="controls" aria-label="Tour" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }} transition={{ duration: 0.6, ease }}>
      <button type="button" className="nav-btn" onClick={previousStop} disabled={traveling}>
        <span aria-hidden="true">‹</span> Back
      </button>
      <Trail />
      <button type="button" className="nav-btn primary" onClick={nextStop}>
        <span className="nav-main">
          {nextLabel} <span aria-hidden="true">›</span>
        </span>
        {nextName && <span className="nav-sub">{nextName}</span>}
      </button>
    </motion.nav>
  );
}

function NamePlate() {
  const stop = useStore(tour, (s) => s.stop);
  const found = useStore(tour, (s) => (s.found[STOPS[s.stop]?.id ?? ""] ?? []).length);
  const s = STOPS[stop];
  if (!s) return null;
  return (
    <motion.header
      key={s.id}
      className="plate"
      aria-live="polite"
      initial={{ opacity: 0, x: -24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -24 }}
      transition={{ duration: 0.6, ease }}
    >
      <p className="eyebrow">
        {s.chapter} · {s.mission}
      </p>
      <h2>{s.name}</h2>
      <p className="plate-status">{s.status}</p>
      <p className="plate-found">
        {found} of {s.hotspots.length} spots found
      </p>
    </motion.header>
  );
}

function IntroCard() {
  const stop = useStore(tour, (s) => s.stop);
  const s = STOPS[stop];
  if (!s) return null;
  const space = s.setting.kind === "space";
  // Only ever rendered in the browser (the server always renders the start screen), so this is safe.
  const touch = coarsePointer();
  return (
    <motion.aside
      className="intro"
      initial={{ opacity: 0, y: 30, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 16, transition: { duration: 0.45 } }}
      transition={{ delay: 0.15, duration: 0.7, ease }}
    >
      <button type="button" className="intro-close" aria-label="Close" onClick={dismissIntro}>
        ×
      </button>
      <p className="eyebrow">
        {s.chapter} · {s.mission} · {s.when}
      </p>
      <h2>{s.name}</h2>
      <p className="pill">{s.status}</p>
      <p className="intro-text">{s.intro}</p>
      <p className="hint">
        {touch ? (
          "Drag to circle around it · tap the glowing dots"
        ) : (
          <>
            Drag to look · <kbd>W</kbd>
            <kbd>A</kbd>
            <kbd>S</kbd>
            <kbd>D</kbd> to {space ? "float" : "walk"} · click the glowing dots
          </>
        )}
      </p>
    </motion.aside>
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
          transition={{ duration: 0.5, ease }}
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
  return (
    <motion.section className="end" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.8 }}>
      <motion.h2 initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.9, ease }}>
        Every machine has a story.
      </motion.h2>
      <motion.p className="end-lede" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6, duration: 0.8, ease }}>
        You visited 6 of the 79 machines in this atlas. The rest are still out there: on the Moon, on Mars, and sailing between the planets.
      </motion.p>
      <motion.div className="end-actions" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.85, duration: 0.8, ease }}>
        <button type="button" className="start-btn" onClick={startTour}>
          Replay the trip
        </button>
        <a className="ghost-btn" href="/explore">
          Explore all 79 machines ↗
        </a>
      </motion.div>
      <motion.details className="credits" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1, duration: 0.8 }}>
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
    go();
    addEventListener("hashchange", go);
    return () => removeEventListener("hashchange", go);
  }, []);
  useEffect(() => {
    const id = phase === "explore" || phase === "travel" ? STOPS[stop]?.id : null;
    const want = id ? `#${id}` : "";
    if (location.hash !== want) history.replaceState(null, "", want || location.pathname);
  }, [phase, stop]);
}

export default function Tour() {
  const phase = useStore(tour, (s) => s.phase);
  const introOpen = useStore(tour, (s) => s.introOpen);
  const fade = useRef<HTMLDivElement>(null);
  useHashSync();

  useEffect(() => {
    hud.fade = fade.current;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const s = tour.get();
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
  return (
    <MotionConfig reducedMotion="user">
      <div className="tour">
        <TourCanvas />
        <Spots />
        <div className="fade" ref={fade} aria-hidden="true" />
        <ExploreLink />
        <AnimatePresence>{phase === "start" && <StartScreen key="start" />}</AnimatePresence>
        <AnimatePresence>{phase === "explore" && <NamePlate key="plate" />}</AnimatePresence>
        <AnimatePresence>{phase === "explore" && introOpen && <IntroCard key="intro" />}</AnimatePresence>
        <Cruise />
        <AnimatePresence>{touring && <Controls key="controls" />}</AnimatePresence>
        <AnimatePresence>{phase === "end" && <EndScreen key="end" />}</AnimatePresence>
      </div>
    </MotionConfig>
  );
}
