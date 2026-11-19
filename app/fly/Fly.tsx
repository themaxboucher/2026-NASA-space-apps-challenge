"use client";

import { Canvas } from "@react-three/fiber";
import { ArrowLeft, X } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import * as THREE from "three";
import { coarsePointer } from "../tour/lib/device";
import { useStore } from "../tour/lib/store";
import { AdaptiveFov } from "../tour/scene/Director";
import { SpaceScene } from "../tour/scene/SpaceStop";
import { Spots } from "../tour/Spots";
import { tour } from "../tour/state";
import { STOPS, type Hotspot, type Stop } from "../tour/stops";
import "../tour/tour.css";
import "./fly.css";

// The atlas's record for a deep-space machine (public/data/deepspace.json).
type Machine = {
  id: string;
  name: string;
  mission: string;
  body?: string;
  launched?: string;
  ended?: string | null;
  status: string;
  distance_au?: number | null;
  lightTime_hours?: number | null;
  why?: string;
  science?: string;
  story?: string;
  funFact?: string;
  source?: string;
};
type ModelInfo = { file: string; title: string; credit?: string; license?: string; size_m?: number };

// Which 3D model stands in for each machine, and how long its longest side really is (meters).
// The size is only used when the model file itself is clearly not in meters.
const MODEL: Record<string, [key: string, span: number]> = {
  pioneer10: ["pioneer", 2.9],
  pioneer11: ["pioneer", 2.9],
  voyager1: ["voyager", 3.7],
  voyager2: ["voyager", 3.7],
  newhorizons: ["new-horizons", 2.7],
  juno: ["juno", 20],
  galileo: ["galileo", 9],
  galileo_probe: ["galileo-probe", 2.3],
  cassini: ["cassini", 6.8],
  messenger: ["messenger", 6],
  magellan: ["magellan", 6.4],
  pioneer_venus_orbiter: ["pioneer-venus-orbiter", 7.3],
  pioneer_venus_large_probe: ["pioneer-venus-large", 1.5],
  pioneer_venus_small_probes: ["pioneer-venus-small", 0.9],
  dawn: ["dawn", 19.7],
  near_shoemaker: ["near", 5],
  kepler: ["kepler", 4.7],
  spitzer: ["spitzer", 4.5],
  deep_impact_impactor: ["deep-impact", 3.3],
  stardust: ["stardust", 4.8],
  osiris_apex: ["osiris-rex", 6.2],
  dart: ["dart", 19],
};

const httpUrl = (u?: string) => !!u && /^https?:\/\//.test(u);

// Builds a story stop for any deep-space machine from the atlas data: the same scene the guided tour uses,
// with its facts placed around the spacecraft as glowing dots.
function makeStop(it: Machine, model: ModelInfo, span: number): Stop {
  const size = model.size_m ?? span;
  const r = Math.max(0.6, size / 2);
  const source = { label: "Source", url: httpUrl(it.source) ? it.source! : "https://science.nasa.gov/" };
  const facts: [id: string, title: string, text: string | undefined, pos: [number, number, number]][] = [
    ["mission", "Why it went", it.why, [0, r * 0.85, 0]],
    ["found", "What it found", it.science, [r * 0.8, r * 0.1, 0]],
    ["fate", "Where it is now", it.story, [-r * 0.8, r * 0.1, 0]],
    ["fun", "Fun fact", it.funFact, [0, -r * 0.55, r * 0.6]],
  ];
  const hotspots: Hotspot[] = facts
    .filter((f) => !!f[2])
    .map(([id, title, text, pos]) => ({ id, title, text: text!, source, anchor: { pos }, face: null }));
  const au = it.distance_au ?? 5;
  const year = (s?: string | null) => (s ? s.slice(0, 4) : "");
  return {
    id: it.id,
    chapter: "Deep space",
    body: "deep",
    name: it.name,
    mission: it.mission,
    when: it.launched ? `Launched ${year(it.launched)}` : "",
    status: it.status,
    intro: it.why ?? "",
    distanceKm: au * 149_597_870.7,
    distanceLabel: "Distance from the Sun",
    model: { kind: "gltf", url: `/${model.file}`, span: size, origin: "center" },
    // The Sun looks smaller the farther out you are.
    setting: { kind: "space", sun: { az: 140, el: 28 }, backdrop: au > 30 ? "sun-far" : undefined, sunSize: au < 2 ? 520 : au < 6 ? 340 : au < 12 ? 240 : au < 40 ? 150 : 90 },
    // Close enough that its glowing dots are already in view, whatever the craft's size.
    spawn: { pos: (() => { const d = Math.min(22, Math.max(6, r * 2.4)); return [d * 0.62, d * 0.14, d * 0.78] as [number, number, number]; })(), look: [0, 0, 0] },
    colliders: [{ pos: [0, 0, 0], r: r * 0.95 }],
    bounds: Math.max(60, size * 8),
    hotspots,
    credit: `${model.title} model: ${model.credit ?? "NASA"}${model.license && !/^NASA/.test(model.credit ?? "NASA") ? `, ${model.license}` : ""}`,
  };
}

type Loaded = { index: number } | { error: string };

export default function Fly() {
  const [state, setState] = useState<Loaded | null>(null);
  const stopIndex = useStore(tour, (s) => s.stop);
  const introOpen = useStore(tour, (s) => s.introOpen);

  useEffect(() => {
    let off = false;
    const id = decodeURIComponent(location.hash.slice(1));
    (async () => {
      // The tour's own deep-space stops (Cassini, Voyager 1) already have hand-made hotspots: use those.
      let index = STOPS.findIndex((s) => s.id === id && s.setting.kind === "space");
      if (index < 0) {
        const [machines, models] = await Promise.all([
          fetch("/data/deepspace.json").then((r) => r.json() as Promise<Machine[]>),
          fetch("/models/models.json").then((r) => r.json() as Promise<Record<string, ModelInfo>>),
        ]);
        const it = machines.find((m) => m.id === id);
        const pick = MODEL[id];
        const model = pick && models[pick[0]];
        if (!it || !model) throw new Error("There is no 3D model of this space object to fly around yet.");
        index = STOPS.push(makeStop(it, model, pick[1])) - 1;
      }
      if (off) return;
      tour.set({ phase: "explore", stop: index, scene: { kind: "space", key: `fly-${id}`, stop: index }, introOpen: true, openSpot: null, sceneReady: true });
      setState({ index });
    })().catch((e) => !off && setState({ error: e instanceof Error ? e.message : "Could not load this space object." }));
    return () => {
      off = true;
    };
  }, []);

  // Changing the machine in the address bar loads that one.
  useEffect(() => {
    const reload = () => location.reload();
    addEventListener("hashchange", reload);
    return () => removeEventListener("hashchange", reload);
  }, []);

  const stop = state && "index" in state ? STOPS[stopIndex] : null;
  const touch = typeof window !== "undefined" && coarsePointer();

  return (
    <div className="tour fly">
      {stop && (
        <Canvas
          className="tour-canvas"
          dpr={[1, 2]}
          gl={{ antialias: true, powerPreference: "high-performance" }}
          camera={{ fov: 50, near: 0.05, far: 12000, position: stop.spawn.pos }}
          onCreated={({ gl, camera }) => {
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            camera.lookAt(...stop.spawn.look);
          }}
        >
          <AdaptiveFov />
          <Suspense fallback={null}>
            <SpaceScene index={stopIndex} />
          </Suspense>
        </Canvas>
      )}
      {stop && <Spots />}
      {/* A full page load on purpose: the atlas runs its own 3D engine. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <div className="top-right">
        <a className="explore-link" href={stop ? `/explore#${stop.id}` : "/explore"}>
          <ArrowLeft aria-hidden="true" /> Back to the atlas
        </a>
      </div>
      {!state && <p className="fly-note">Flying out…</p>}
      {state && "error" in state && <p className="fly-note">{state.error}</p>}
      {stop && (
        <header className="plate" aria-live="polite">
          <p className="eyebrow">
            {stop.chapter} · {stop.mission}
          </p>
          <h2>{stop.name}</h2>
          <p className="plate-status">{stop.status}</p>
        </header>
      )}
      {stop && introOpen && (
        <aside className="intro">
          <button type="button" className="intro-close" aria-label="Close" onClick={() => tour.set({ introOpen: false })}>
            <X aria-hidden="true" />
          </button>
          <p className="eyebrow">
            {stop.mission}
            {stop.when ? ` · ${stop.when}` : ""}
          </p>
          <h2>{stop.name}</h2>
          <p className="pill">{stop.status}</p>
          <p className="intro-text">{stop.intro}</p>
          <p className="hint">
            {touch ? (
              "Drag to circle around it · tap the glowing dots"
            ) : (
              <>
                Click the view to look around with your mouse (<kbd>Esc</kbd> lets go) · <kbd>W</kbd>
                <kbd>A</kbd>
                <kbd>S</kbd>
                <kbd>D</kbd> to fly · <kbd>Space</kbd> up · <kbd>C</kbd> down · <kbd>Shift</kbd> faster · you keep drifting after you let go · click the
                glowing dots
              </>
            )}
          </p>
        </aside>
      )}
      {stop && <p className="fly-credit">{stop.credit}</p>}
    </div>
  );
}
