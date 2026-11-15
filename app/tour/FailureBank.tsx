"use client";

import { animate, AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import { useStore } from "./lib/store";
import { tour } from "./state";
import { STOPS } from "./stops";
import "./failure-bank.css";

// "What went wrong": every machine in the atlas whose mission ended in a failure, grouped by cause.

type Machine = { id: string; name: string; body: string; arrived?: string; lastContact?: string; fate?: { category: string; label: string } };

// Order, wording and lessons per cause. Each lesson is backed by the NASA sources listed with it.
const CAUSES: { key: string; title: string; why: string; lesson: string; sources: string[] }[] = [
  {
    key: "power",
    title: "Ran out of power",
    why: "Solar panels need sunshine. Dust, long freezing nights and dark winters starved them, and old batteries wore out.",
    lesson: "NASA's newest Mars rovers, Curiosity and Perseverance, run on a nuclear power source that works day and night, even when dust covers everything.",
    sources: [
      "https://www.jpl.nasa.gov/news/press_kits/mars_2020/launch/mission/spacecraft/power/",
      "https://www.jpl.nasa.gov/podcasts/on-a-mission/season-4-mars-rovers/the-power-of-the-rovers/",
    ],
  },
  {
    key: "comms",
    title: "Lost contact",
    why: "The machine may still be sitting there, but nobody on Earth can hear it any more.",
    lesson: "Sojourner could only talk to Earth through its lander. Today's Mars rovers have more than one way home: they also send their data up to orbiters circling Mars, which pass it on to Earth.",
    sources: ["https://science.nasa.gov/mars/mars-relay-network/"],
  },
  {
    key: "stuck",
    title: "Got stuck",
    why: "Its wheels broke through a crust into soft sand and could not climb back out.",
    lesson: "Later rovers got wheels with deep zig-zag treads that shed sand, and rover drivers now mark sandy patches on their maps so they can steer around them.",
    sources: ["https://www.nasa.gov/podcasts/on-a-mission/how-to-drive-a-mars-rover-s4e8/"],
  },
  {
    key: "damaged",
    title: "Damaged",
    why: "A part broke, so the machine could not do its job any more.",
    lesson: "Ingenuity's camera could not find landmarks over smooth sand. Engineers studied the crash and tested drones over desert dunes so future Mars helicopters can fly over ground like that.",
    sources: [
      "https://www.jpl.nasa.gov/news/nasa-performs-first-aircraft-accident-investigation-on-another-world/",
      "https://www.jpl.nasa.gov/news/nasa-tests-drones-in-death-valley-preps-for-martian-sands-and-skies/",
    ],
  },
  {
    key: "crash-accident",
    title: "Crashed by accident",
    why: "It was meant to land gently, but something went wrong on the way down.",
    lesson: "Investigators found the computer mistook the legs unfolding for touchdown. The Phoenix team fixed every weak spot found in that review, and Phoenix landed safely near the Martian north pole in 2008.",
    sources: ["https://llis.nasa.gov/lesson/938", "https://www.jpl.nasa.gov/news/press_kits/phoenix-landing.pdf"],
  },
  {
    key: "lost",
    title: "Fate unknown",
    why: "We never heard from it again, so nobody knows exactly what happened.",
    lesson: "Mars Climate Orbiter was lost because one team's software used imperial units and another's used metric. Investigators said every number passed between teams must be checked.",
    sources: ["https://llis.nasa.gov/llis_lib/pdf/1009464main1_0641-mr.pdf"],
  },
];

// The part that gave out. The first group mirrors FAULTS in app/atlas/engine.js; the rest come from each fate summary in the data.
const PART: Record<string, string> = {
  opportunity: "solar panels",
  spirit: "wheels",
  insight: "solar panels",
  phoenix: "solar panels",
  ingenuity: "rotor blades",
  surveyor1: "solar panel",
  surveyor3: "solar panel",
  surveyor5: "solar panel",
  surveyor6: "solar panel",
  surveyor7: "solar panel",
  viking1: "antenna-pointing data",
  viking2: "batteries",
  pathfinder: "battery (suspected)",
  sojourner: "radio link through the lander",
  "apollo11-pse": "electronics (probably overheated)",
  "mars-polar-lander": "touchdown software",
  "mars-climate-orbiter": "navigation software (units)",
};

const WORLD: Record<string, string> = { moon: "Moon", mars: "Mars" };

type Entry = { id: string; name: string; world: string; year: string; label: string; part?: string };
let bank: Promise<Record<string, Entry[]> | null> | null = null;
function loadBank() {
  bank ??= Promise.all(["moon", "mars", "deepspace"].map((w) => fetch(`/data/${w}.json`).then((r) => (r.ok ? r.json() : [])) as Promise<Machine[]>))
    .then((lists) => {
      const out: Record<string, Entry[]> = Object.fromEntries(CAUSES.map((c) => [c.key, []]));
      for (const m of lists.flat()) {
        const list = m.fate && out[m.fate.category];
        if (!list) continue;
        list.push({
          id: m.id,
          name: m.name.replace(/\s*\(.*\)$/, ""),
          world: WORLD[m.body] ?? "Deep space",
          year: (m.lastContact ?? m.arrived ?? "").slice(0, 4),
          label: m.fate!.label,
          part: PART[m.id],
        });
      }
      for (const list of Object.values(out)) list.sort((a, b) => a.year.localeCompare(b.year));
      return out;
    })
    .catch(() => null);
  return bank;
}

// Machines the visitor has met, shared with the atlas: it stores the ids it opens under the same key.
// Every bank entry is an atlas machine, so its id unlocks it directly (tour stop ids are atlas ids).
const SEEN_KEY = "gra-explored";
function readSeen(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function markSeen(id: string) {
  try {
    const seen = readSeen();
    if (!seen.includes(id)) localStorage.setItem(SEEN_KEY, JSON.stringify([...seen, id]));
  } catch {}
}
// Reaching a tour stop counts as visiting that machine.
if (typeof window !== "undefined")
  tour.subscribe(() => {
    const s = tour.get();
    if (s.phase === "explore" && STOPS[s.stop]) markSeen(STOPS[s.stop].id);
  });

const ease = [0.22, 1, 0.36, 1] as const;

export function FailureBank() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Record<string, Entry[]> | null | undefined>(undefined);
  useStore(tour, (s) => `${s.phase}/${s.stop}`); // re-render on each new stop so newly met machines unlock
  const btn = useRef<HTMLButtonElement>(null);
  const still = useReducedMotion();
  const close = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    let off = false;
    loadBank().then((d) => !off && setData(d));
    return () => {
      off = true;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    close.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      btn.current?.focus();
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [open]);

  const total = data ? Object.values(data).reduce((n, l) => n + l.length, 0) : 0;
  const seen = new Set(data ? readSeen() : []);
  const found = data ? Object.values(data).reduce((n, l) => n + l.filter((e) => seen.has(e.id)).length, 0) : 0;
  // A small bounce on the button whenever a new entry unlocks (not on the first count).
  const lastFound = useRef(-1);
  useEffect(() => {
    if (!data) return;
    if (lastFound.current >= 0 && found > lastFound.current && btn.current && !still) animate(btn.current, { scale: [1, 1.12, 1] }, { duration: 0.6 });
    lastFound.current = found;
  }, [data, found, still]);
  return (
    <>
      <button ref={btn} type="button" className="fbank-btn" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((v) => !v)}>
        <i aria-hidden="true" />
        What went wrong{total ? ` ${found}/${total}` : ""}
      </button>
      <AnimatePresence>
        {open && (
          <motion.aside
            id={panelId}
            className="fbank"
            aria-labelledby={`${panelId}-h`}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ duration: 0.4, ease }}
          >
            <header className="fbank-head">
              <div>
                <p className="eyebrow">Mission files</p>
                <h2 id={`${panelId}-h`}>What went wrong</h2>
              </div>
              <button
                ref={close}
                type="button"
                className="fbank-close"
                aria-label="Close what went wrong"
                onClick={() => {
                  setOpen(false);
                  btn.current?.focus();
                }}
              >
                ×
              </button>
            </header>
            <p className="fbank-lede">
              Space is hard. {total ? `${total} machines` : "Some machines"} in this atlas stopped working before anyone planned. Each failure taught engineers something.
            </p>
            {total > 0 && (
              <p className="fbank-progress">
                <b>
                  {found} of {total} found.
                </b>{" "}
                {found < total ? "Each one unlocks when you visit its machine, here in the tour or in the atlas." : "You found them all!"}
              </p>
            )}
            {data === undefined && <p className="fbank-lede">Loading…</p>}
            {data === null && <p className="fbank-lede">Couldn&apos;t load the mission files. Try reloading the page.</p>}
            {data &&
              CAUSES.map((c) => {
                const list = data[c.key];
                if (!list?.length) return null;
                return (
                  <section key={c.key} className="fbank-group" aria-labelledby={`${panelId}-${c.key}`}>
                    <h3 id={`${panelId}-${c.key}`}>
                      {c.title}
                      <span className="fbank-count">
                        {list.filter((e) => seen.has(e.id)).length} of {list.length} found
                      </span>
                    </h3>
                    <p className="fbank-why">{c.why}</p>
                    <ul>
                      {list.map((e) =>
                        !seen.has(e.id) ? (
                          <li key={e.id} className="locked">
                            <span className="fbank-name">
                              <span aria-hidden="true">???</span>
                              <span className="sr-only">Locked machine</span>
                            </span>
                            <span className="fbank-meta">{e.world} · visit more machines to unlock</span>
                          </li>
                        ) : (
                        <li key={e.id}>
                          {/* A full page load on purpose: the atlas runs its own 3D engine. */}
                          <a href={`/explore#${e.id}`}>
                            <span className="fbank-name">{e.name}</span>
                            <span className="fbank-meta">
                              {e.world} · last heard {e.year} · {e.label}
                            </span>
                            {e.part && <span className="fbank-part">What gave out: {e.part}</span>}
                          </a>
                        </li>
                        ),
                      )}
                    </ul>
                    <p className="fbank-lesson">
                      <b>Lesson learned</b> {c.lesson}{" "}
                      <a href={c.sources[0]} target="_blank" rel="noopener noreferrer">
                        NASA source<span aria-hidden="true"> ↗</span>
                      </a>
                    </p>
                  </section>
                );
              })}
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}

export default FailureBank;
