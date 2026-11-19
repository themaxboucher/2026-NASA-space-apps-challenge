"use client";

import { Canvas } from "@react-three/fiber";
import Link from "next/link";
import { Suspense, useDeferredValue, useEffect, useMemo, useState } from "react";
import { reducedMotion } from "../tour/lib/device";
import { useStore } from "../tour/lib/store";
import { Science } from "../tour/Science";
import { buildWorld, fly, flyTo, loadEarthOrbit, loadMachines, loadTracks, readSeen, saveSeen, STATUS_COLOR, STATUS_LABEL, statusOf, THIS_YEAR, ui, type EarthOrbit, type Machine, type Status, type Target, type Tracks, type World } from "./model";
import { DEBRIS_DOTS, SolarScene } from "./Scene";
import "./solar.css";

type Ready = { machines: Machine[]; tracks: Tracks; start: string; still: boolean; orbit: EarthOrbit | null; veil: boolean };

export default function Solar({ className = "" }: { className?: string }) {
  const [ready, setReady] = useState<Ready | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let off = false;
    Promise.all([loadMachines(), loadEarthOrbit(), loadTracks()]).then(
      ([machines, orbit, tracks]) => {
        if (off) return;
        const world = buildWorld(machines, ui.get().date, tracks);
        // /solar?from=<atlas id> starts you right next to that machine; ?from=<world> (moon, mars, ...) in its orbit view.
        const from = new URLSearchParams(location.search).get("from")?.replace(/^b:/, "");
        // A machine on a crowded site (Surveyor 3 beside Apollo 12's lander) leads that site's card.
        if (from && world.siteOf.has(from)) ui.set({ pick: from });
        // From the explore page's map (?intro=map): the scene opens on black and fades up on the overhead view.
        setReady({ machines, tracks, orbit, start: (from && (world.siteOf.get(from) ?? (world.targets.has(`b:${from}`) ? `b:${from}` : null))) || "b:earth", still: reducedMotion(), veil: new URLSearchParams(location.search).get("intro") === "map" });
      },
      (e) => !off && setError(e instanceof Error ? e.message : "Could not load the space objects."),
    );
    return () => {
      off = true;
    };
  }, []);
  // The timeline rebuilds the world for its date; deferred, so dragging the slider stays smooth.
  const date = useDeferredValue(useStore(ui, (s) => s.date));
  const world = useMemo(() => ready && buildWorld(ready.machines, date, ready.tracks), [ready, date]);

  return (
    <div className={`solar ${className}`}>
      {ready?.veil && <MapHandover />}
      {ready && world && (
        <Canvas className="sol-canvas" dpr={[1, 2]} gl={{ antialias: true, powerPreference: "high-performance" }} camera={{ fov: 50, near: 0.01, far: 20000 }}>
          <Suspense fallback={null}>
            <SolarScene world={world} tracks={ready.tracks} date={date} start={ready.start} still={ready.still} working={ready.orbit ? ready.orbit.satellitesWorking / ready.orbit.tracked : 1 / 3} />
          </Suspense>
        </Canvas>
      )}
      <header className="sol-head">
        <Link className="sol-home" href="/">
          ← Home
        </Link>
        <div>
          <p className="sol-eyebrow">Echoes of Exploration</p>
          <h1>Fly the solar system</h1>
        </div>
      </header>
      {ready && world ? <Hud world={world} orbit={ready.orbit} /> : <p className="sol-note">{error ?? "Loading the solar system…"}</p>}
    </div>
  );
}

const dot = (s: Status) => <i className="sol-dot" style={{ background: STATUS_COLOR[s] }} aria-hidden="true" />;

function Hud({ world, orbit }: { world: World; orbit: EarthOrbit | null }) {
  const card = useStore(ui, (s) => s.card);
  const nearEarth = useStore(ui, (s) => s.nearEarth);
  const locked = useStore(ui, (s) => s.locked);
  const debris = useStore(ui, (s) => s.debris);
  const orbitKey = useStore(ui, (s) => s.orbit);
  const orbiting = orbitKey ? world.targets.get(orbitKey) : undefined;
  const wide = () => window.matchMedia("(min-width: 900px)").matches;
  const [open, setOpen] = useState(wide);
  const site = card ? world.targets.get(card) : undefined;
  const year = new Date(useStore(ui, (s) => s.date)).getUTCFullYear();
  // Space objects opened here or in the atlas (shared progress): a card that shows counts as opening them.
  const [seen, setSeen] = useState(readSeen);
  if (site?.items.some((m) => !seen.has(m.id))) setSeen(new Set([...seen, ...site.items.map((m) => m.id)]));
  useEffect(() => saveSeen(seen), [seen]);

  const pick = (key: string) => {
    flyTo(key);
    if (!wide()) setOpen(false);
  };

  return (
    <>
      <div className="sol-labels">
        {[...world.targets.values()].map((t) => (
          <button
            key={t.key}
            type="button"
            tabIndex={-1}
            className={`sol-label ${t.kind}`}
            ref={(el) => {
              if (el) fly.labels.set(t.key, el);
              return () => {
                fly.labels.delete(t.key);
              };
            }}
            onClick={() => flyTo(t.key)}
          >
            {t.kind === "site" && dot(t.status)}
            {t.name}
            {t.kind === "site" && t.items.every((m) => seen.has(m.id)) && <Check />}
            {t.kind === "body" && t.host!.count > 0 && <small title={`${t.host!.count} space objects`}>{t.host!.count}</small>}
          </button>
        ))}
      </div>
      {locked && <div className="sol-cross" aria-hidden="true" />}

      {/* Left column (list, credits) and right column (map, card): flex columns, so panels stack and never overlap. */}
      <div className="sol-left">
        <aside className={`sol-panel${open ? " open" : ""}`}>
          <button type="button" className="sol-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? "Hide the list" : "Find a place"}
          </button>
          {open && <Finder world={world} pick={pick} seen={seen} year={year} />}
        </aside>
        <Credits />
      </div>

      <div className="sol-right">
        <nav className="sol-map" aria-label="Where you are">
          <canvas
            width={360}
            height={360}
            ref={(el) => {
              fly.hud.minimap = el;
            }}
            aria-label="Map of the solar system seen from above, with you as an arrow"
            role="img"
          />
          <p>
            <span>Nearest world</span>
            <b ref={(el) => void (fly.hud.nearBody = el)} />
          </p>
          <p>
            <span>Nearest space object</span>
            <b ref={(el) => void (fly.hud.nearMachine = el)} />
          </p>
        </nav>
        {site ? <SiteCard key={site.key} site={site} year={year} /> : (nearEarth || debris) && orbit && <EarthCard orbit={orbit} year={year} />}
      </div>

      <Timeline world={world} />

      <footer className="sol-foot">
        <p className="sol-dist">
          From Earth <b ref={(el) => void (fly.hud.dist = el)} />
        </p>
        <p className="sol-speed">
          Speed <b ref={(el) => void (fly.hud.speed = el)}>×1</b>
        </p>
        <p className="sol-zoom">
          <button type="button" aria-label="Zoom out" onClick={() => fly.zoomBy(1.25)}>
            −
          </button>
          {orbiting ? "Closer" : "Zoom"} <b ref={(el) => void (fly.hud.zoom = el)}>×1</b>
          <button type="button" aria-label="Zoom in" onClick={() => fly.zoomBy(0.8)}>
            +
          </button>
        </p>
        {orbiting && (
          <button type="button" className="sol-back" onClick={() => ui.set({ orbit: null })}>
            Fly freely (Esc)
          </button>
        )}
        <p className="sol-help">
          {orbiting
            ? `Circling ${orbiting.name.replace(/^The /, "the ")}${orbiting.kind === "body" && orbiting.host!.count ? `: point at a space object to see it, click to fly down to it` : ""} · drag to turn it around · wheel or + − to move closer · Esc or W A S D to fly freely`
            : `${locked ? "Esc frees the mouse" : "Click the sky to look around"} · click a world or space object to circle it · W A S D or arrows to fly · Space up, C down · hold Shift to speed up · wheel or + − to zoom, Z to reset`}
        </p>
      </footer>
    </>
  );
}

const Check = () => (
  <span className="sol-seen" title="You've opened it" aria-label="opened">
    ✓
  </span>
);

// The timeline: a month slider from 1959 to today. The planets move to that date, and each space object appears from
// the day it arrived (or launched).
const FIRST_YEAR = 1959;
const monthOf = (ms: number) => (new Date(ms).getUTCFullYear() - FIRST_YEAR) * 12 + new Date(ms).getUTCMonth();
function Timeline({ world }: { world: World }) {
  const date = useStore(ui, (s) => s.date);
  const [now] = useState(Date.now);
  const max = monthOf(now), at = monthOf(date), today = at >= max;
  const set = (i: number) => ui.set({ date: i >= max ? now : Date.UTC(FIRST_YEAR, i, 15) });
  const when = new Date(date).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  return (
    <section className="sol-time" aria-label="Timeline">
      <p className="sol-time-head">
        <span>{today ? "Today" : "Back in"}</span> <b>{when}</b>
        {!today && (
          <button type="button" onClick={() => set(max)}>
            Back to today
          </button>
        )}
      </p>
      <input type="range" min={0} max={max} value={Math.min(at, max)} onChange={(e) => set(+e.target.value)} aria-label="Date" aria-valuetext={when} />
      <p className="sol-time-scale" aria-hidden="true">
        <span>{FIRST_YEAR}</span>
        <span>{new Date(now).getUTCFullYear()}</span>
      </p>
      <p className="sol-small">
        {world.siteOf.size} of {world.machines.length} space objects had arrived by then
      </p>
    </section>
  );
}

function Finder({ world, pick, seen, year }: { world: World; pick: (key: string) => void; seen: Set<string>; year: number }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const groups = useMemo(() => {
    const site = (id: string) => world.targets.get(world.siteOf.get(id)!)!;
    const machines = (w: "moon" | "mars" | "deep") => world.machines.filter((m) => m.world === w && world.siteOf.has(m.id)).map((m) => ({ key: site(m.id).key, id: m.id, name: m.name, sub: w === "deep" ? site(m.id).where : m.mission ?? "", status: statusOf(m, year) as Status | null, hay: `${m.name} ${m.mission ?? ""} ${m.body ?? ""}`.toLowerCase() }));
    return [
      { title: "Worlds", rows: world.bodies.map((b) => ({ key: `b:${b.key}`, id: b.key, name: b.name, sub: b.count ? `${b.count} space object${b.count > 1 ? "s" : ""}` : "", status: null, hay: b.name.toLowerCase() })) },
      { title: "On the Moon", rows: machines("moon") },
      { title: "On Mars", rows: machines("mars") },
      { title: "In deep space", rows: machines("deep") },
    ];
  }, [world, year]);
  const opened = world.machines.filter((m) => seen.has(m.id)).length;
  return (
    <div className="sol-find">
      <p className="sol-progress">
        You&apos;ve opened <b>{opened}</b> of {world.machines.length} space objects
        {opened > 0 && " (here or in the atlas)"} ·{" "}
        { }
        <a href="/signals">What we heard back</a>
      </p>
      <label className="sol-search">
        <span>Find a world or space object</span>
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Try Voyager or Apollo 11" />
      </label>
      <div className="sol-list">
        {groups.map((g) => {
          const rows = q ? g.rows.filter((r) => r.hay.includes(q)) : g.rows;
          if (!rows.length) return null;
          return (
            <section key={g.title}>
              <h2>{g.title}</h2>
              <ul>
                {rows.map((r) => (
                  <li key={r.id}>
                    <button type="button" onClick={() => pick(r.key)}>
                      {r.status ? dot(r.status) : <i className="sol-dot world" aria-hidden="true" />}
                      <span>
                        {r.name}
                        {r.sub && <small>{r.sub}</small>}
                      </span>
                      {r.status && seen.has(r.id) && <Check />}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      <ul className="sol-legend">
        {(["alive", "echo", "silent"] as Status[]).map((s) => (
          <li key={s}>
            {dot(s)}
            {STATUS_LABEL[s]}
          </li>
        ))}
      </ul>
    </div>
  );
}

// "Why it was left" lines come from public/data/sites/<id>.json; most machines don't have one (yet).
const whyCache = new Map<string, Promise<string | null>>();
const STORY_IDS = new Set(["apollo11-lm", "apollo15-lrv", "opportunity", "ingenuity", "cassini", "voyager1"]);
const whyLeft = (id: string) => {
  let p = whyCache.get(id);
  // The six story stops keep their data in app/tour/stops.ts, not in a site file.
  if (!p && STORY_IDS.has(id)) p = Promise.resolve(null);
  if (!p) {
    p = fetch(`/data/sites/${encodeURIComponent(id)}.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { whyLeft?: unknown } | null) => (typeof j?.whyLeft === "string" && j.whyLeft.trim() ? j.whyLeft : null))
      .catch(() => null);
    whyCache.set(id, p);
  }
  return p;
};

// The atlas's status line is about today. Back on the timeline, a machine still working then says so instead of
// "Silent since 2003"; one already gone quiet (or a mirror) keeps its line, which is still true.
const statusLine = (m: Machine, s: Status, year: number) => {
  if (s === "alive" && year < THIS_YEAR) return ` in ${year}`;
  return m.status ? ` · ${m.status}` : "";
};

function SiteCard({ site, year }: { site: Target; year: number }) {
  const [why, setWhy] = useState<Record<string, string | null>>({});
  useEffect(() => {
    let off = false;
    Promise.all(site.items.map((m) => whyLeft(m.id))).then((vals) => !off && setWhy(Object.fromEntries(site.items.map((m, i) => [m.id, vals[i]]))));
    return () => {
      off = true;
    };
  }, [site]);
  const many = site.items.length > 1;
  const pick = useStore(ui, (s) => s.pick);
  const first = many ? site.items.find((m) => m.id === pick) : undefined;
  const items = first ? [first, ...site.items.filter((m) => m !== first)] : site.items;
  const missions = new Set(site.items.map((m) => m.mission));
  return (
    <section className="sol-card" aria-live="polite">
      <p className="sol-eyebrow">{site.where}</p>
      <h2>{first && missions.size > 1 ? `${first.name} and ${site.items.length - 1} more` : site.name}</h2>
      {many && <p className="sol-sub">{site.items.length} space objects here</p>}
      <ul>
        {items.map((m) => {
          const s = statusOf(m, year);
          return (
            <li key={m.id}>
              {many && <h3>{m.name}</h3>}
              <p className="sol-status">
                {dot(s)}
                <span>
                  <b>{STATUS_LABEL[s]}</b>
                  {statusLine(m, s, year)}
                </span>
              </p>
              {why[m.id] && (
                <p className="sol-why">
                  <b>Why it was left:</b> {why[m.id]}
                </p>
              )}
              {/* "How it worked" at the reader's level (shared with the tour and the atlas); folded so the card stays small. */}
              <details className="sol-sci">
                <summary>How it worked</summary>
                <Science id={m.id} />
              </details>
              <p className="sol-actions">
                <a className="sol-land" href={`/#${encodeURIComponent(m.id)}`}>
                  {site.normal ? "Walk around it →" : "See it up close →"}
                </a>
                <a href={`/explore#${encodeURIComponent(m.id)}`}>Open in the atlas →</a>
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const n = (x: number) => (x >= 1e6 ? `${(x / 1e6).toLocaleString("en-US", { maximumFractionDigits: 1 })} million` : x.toLocaleString("en-US"));

// What's around Earth, from ESA's counts (public/data/earth-orbit.json).
function EarthCard({ orbit: o, year }: { orbit: EarthOrbit; year: number }) {
  const pct = (o.satellitesWorking / (o.satellitesWorking + o.trackedNotWorking)) * 100;
  const perDot = Math.round(o.tracked / (DEBRIS_DOTS.leo + DEBRIS_DOTS.meo + DEBRIS_DOTS.geo));
  return (
    <section className="sol-card" aria-live="polite">
      <p className="sol-eyebrow">Around Earth</p>
      <h2>Earth&apos;s orbit</h2>
      {/* ponytail: ESA's counts are only for today; the timeline doesn't change them, so say so rather than show 2026's crowd in 1970. */}
      {year < +o.asOf.slice(-4) && (
        <p className="sol-past">
          These are today&apos;s counts ({o.asOf}). Back in {year} there was far less up there.
        </p>
      )}
      <p>{o.kidLines[0]}</p>
      <div className="sol-bar" role="img" aria-label={`${n(o.satellitesWorking)} working satellites and ${n(o.trackedNotWorking)} objects that don't work`}>
        <span style={{ width: `${pct.toFixed(1)}%` }} />
      </div>
      <p className="sol-barkey">
        <span>
          <i className="sol-dot work" aria-hidden="true" />
          <b>{n(o.satellitesWorking)}</b> working
        </span>
        <span>
          <i className="sol-dot dead" aria-hidden="true" />
          <b>{n(o.trackedNotWorking)}</b> not working
        </span>
      </p>
      <dl className="sol-facts">
        <div>
          <dt>Tracked objects</dt>
          <dd>{n(o.tracked)}</dd>
        </div>
        <div>
          <dt>Dead satellites</dt>
          <dd>{n(o.satellitesDead)}</dd>
        </div>
        <div>
          <dt>Break-ups and collisions</dt>
          <dd>{n(o.fragmentationEvents)}+</dd>
        </div>
        <div>
          <dt>Untracked bits, 1–10 cm</dt>
          <dd>about {n(o.modelled.from1to10cm)}</dd>
        </div>
      </dl>
      <h3>Where they fly</h3>
      <ul className="sol-shells">
        {o.shells.map((sh) => (
          <li key={sh.name}>
            <b>{sh.name}</b> · {sh.altitudeKm} km up
            <br />
            <span>{sh.note}</span>
          </li>
        ))}
      </ul>
      <p className="sol-small">Each dot here stands for about {perDot} tracked objects, drawn far bigger than real. Warm dots are working satellites, grey ones are not.</p>
      <p className="sol-small">
        Source:{" "}
        <a href={o.source.url} target="_blank" rel="noreferrer">
          {o.source.credit}
        </a>
        , updated {o.asOf}
      </p>
    </section>
  );
}

function Credits() {
  return (
    <details className="sol-credits">
      <summary>Credits</summary>
      <ul>
        <li>Earth: NASA Earth Observatory, Blue Marble Next Generation, clouds and Black Marble 2016 (public domain).</li>
        <li>Moon: NASA Scientific Visualization Studio, CGI Moon Kit: LRO LROC colour (NASA/GSFC/Arizona State University, educational use with credit) and LOLA elevation (public domain).</li>
        <li>Mars: USGS Astrogeology, Viking MDIM 2.1 colour mosaic and MGS MOLA elevation (public domain).</li>
        <li>
          Jupiter: NASA/JPL/Space Science Institute, Cassini global map,{" "}
          <a href="https://photojournal.jpl.nasa.gov/catalog/PIA07782" target="_blank" rel="noreferrer">
            PIA07782
          </a>{" "}
          (public domain).
        </li>
        <li>
          Mercury: NASA/Johns Hopkins University APL/Carnegie Institution of Washington, MESSENGER global mosaic,{" "}
          <a href="https://photojournal.jpl.nasa.gov/catalog/PIA17386" target="_blank" rel="noreferrer">
            PIA17386
          </a>
          , turned grey here (public domain).
        </li>
        <li>The Sun, Venus, Saturn, Uranus, Neptune, Pluto, Ceres and the small rocks are drawn in code.</li>
        <li>
          Planets on any date: JPL&apos;s Keplerian elements,{" "}
          <a href="https://ssd.jpl.nasa.gov/planets/approx_pos.html" target="_blank" rel="noreferrer">
            Approximate Positions of the Planets
          </a>
          . Paths of Voyager 1 and 2, Pioneer 10 and 11 and New Horizons: NASA/JPL Horizons, public domain.
        </li>
        <li>Other machines&apos; positions: NASA JPL Horizons, via the atlas data. Satellite and junk counts: ESA Space Debris Office (public/data/earth-orbit.json).</li>
      </ul>
    </details>
  );
}

// The explore page's deep-space map, carried over (sessionStorage) and laid over the matching overhead 3D view at
// the same scale (its heliopause ring on the 3D one), then dissolved as the camera swoops down into 3D.
function MapHandover() {
  const [svg] = useState(() => {
    try {
      const raw = sessionStorage.getItem("gra-map") || "";
      sessionStorage.removeItem("gra-map");
      // Our own markup from the atlas; keep only the SVG drawing (no scripts or event handlers).
      const doc = new DOMParser().parseFromString(raw, "image/svg+xml");
      const el = doc.documentElement;
      if (el.nodeName !== "svg") return "";
      el.querySelectorAll("script, foreignObject").forEach((n) => n.remove());
      el.querySelectorAll("*").forEach((n) => [...n.attributes].forEach((at) => /^on/i.test(at.name) && n.removeAttribute(at.name)));
      el.removeAttribute("hidden");
      el.removeAttribute("style");
      el.setAttribute("viewBox", "-500 -500 1000 1000");
      return new XMLSerializer().serializeToString(el);
    } catch {
      return "";
    }
  });
  return (
    <>
      <div className="solar-intro-veil" aria-hidden="true" />
      {svg && <div className="solar-map-handover" aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />}
    </>
  );
}
