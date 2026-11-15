"use client";

import { Canvas } from "@react-three/fiber";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { reducedMotion } from "../tour/lib/device";
import { useStore } from "../tour/lib/store";
import { fly, flyTo, loadEarthOrbit, loadWorld, STATUS_COLOR, STATUS_LABEL, statusOf, ui, type EarthOrbit, type Status, type Target, type World } from "./model";
import { DEBRIS_DOTS, SolarScene } from "./Scene";
import "./solar.css";

type Ready = { world: World; start: string; still: boolean; orbit: EarthOrbit | null; veil: boolean };

export default function Solar({ className = "" }: { className?: string }) {
  const [ready, setReady] = useState<Ready | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let off = false;
    Promise.all([loadWorld(), loadEarthOrbit()]).then(
      ([world, orbit]) => {
        if (off) return;
        // /solar?from=<atlas id> starts you right next to that machine; ?from=<world> (moon, mars, ...) in its orbit view.
        const from = new URLSearchParams(location.search).get("from")?.replace(/^b:/, "");
        // From the explore page's map (?intro=map): the scene opens on black and fades up on the overhead view.
        setReady({ world, orbit, start: (from && (world.siteOf.get(from) ?? (world.targets.has(`b:${from}`) ? `b:${from}` : null))) || "b:earth", still: reducedMotion(), veil: new URLSearchParams(location.search).get("intro") === "map" });
      },
      (e) => !off && setError(e instanceof Error ? e.message : "Could not load the machines."),
    );
    return () => {
      off = true;
    };
  }, []);

  return (
    <div className={`solar ${className}`}>
      {ready?.veil && <MapHandover />}
      {ready && (
        <Canvas className="sol-canvas" dpr={[1, 2]} gl={{ antialias: true, powerPreference: "high-performance" }} camera={{ fov: 50, near: 0.01, far: 20000 }}>
          <Suspense fallback={null}>
            <SolarScene world={ready.world} start={ready.start} still={ready.still} working={ready.orbit ? ready.orbit.satellitesWorking / ready.orbit.tracked : 1 / 3} />
          </Suspense>
        </Canvas>
      )}
      <header className="sol-head">
        <Link className="sol-home" href="/">
          ← Home
        </Link>
        <div>
          <p className="sol-eyebrow">Ruins Among the Stars</p>
          <h1>Fly the solar system</h1>
        </div>
      </header>
      {ready ? <Hud world={ready.world} orbit={ready.orbit} /> : <p className="sol-note">{error ?? "Loading the solar system…"}</p>}
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
  const orbiting = orbitKey ? world.bodies.find((b) => b.key === orbitKey) : undefined;
  const wide = () => window.matchMedia("(min-width: 900px)").matches;
  const [open, setOpen] = useState(wide);
  const site = card ? world.targets.get(card) : undefined;

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
            {t.kind === "body" && t.host!.count > 0 && <small title={`${t.host!.count} machines`}>{t.host!.count}</small>}
          </button>
        ))}
      </div>
      {locked && <div className="sol-cross" aria-hidden="true" />}

      <aside className={`sol-panel${open ? " open" : ""}`}>
        <button type="button" className="sol-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? "Hide the list" : "Find a place"}
        </button>
        {open && <Finder world={world} pick={pick} />}
      </aside>

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
          <span>Nearest machine</span>
          <b ref={(el) => void (fly.hud.nearMachine = el)} />
        </p>
      </nav>

      {site ? <SiteCard key={site.key} site={site} /> : (nearEarth || debris) && orbit && <EarthCard orbit={orbit} />}

      <footer className="sol-foot">
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
            ← Back to the solar system
          </button>
        )}
        <p className="sol-help">
          {orbiting
            ? `Circling ${orbiting.name.replace(/^The /, "the ")}${orbiting.count ? `: point at a machine to see it, click to fly down to it` : ""} · drag to turn it · wheel or + − to move closer · Esc or W A S D to fly freely`
            : `${locked ? "Esc frees the mouse" : "Click the sky to look around"} · W A S D or arrows to fly · Space up, C down · hold Shift to speed up · wheel or + − to zoom, Z to reset`}
        </p>
      </footer>
      <Credits />
    </>
  );
}

function Finder({ world, pick }: { world: World; pick: (key: string) => void }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const groups = useMemo(() => {
    const site = (id: string) => world.targets.get(world.siteOf.get(id)!)!;
    const machines = (w: "moon" | "mars" | "deep") => world.machines.filter((m) => m.world === w).map((m) => ({ key: site(m.id).key, id: m.id, name: m.name, sub: w === "deep" ? site(m.id).where : m.mission ?? "", status: statusOf(m) as Status | null, hay: `${m.name} ${m.mission ?? ""} ${m.body ?? ""}`.toLowerCase() }));
    return [
      { title: "Worlds", rows: world.bodies.map((b) => ({ key: `b:${b.key}`, id: b.key, name: b.name, sub: b.count ? `${b.count} machine${b.count > 1 ? "s" : ""}` : "", status: null, hay: b.name.toLowerCase() })) },
      { title: "On the Moon", rows: machines("moon") },
      { title: "On Mars", rows: machines("mars") },
      { title: "In deep space", rows: machines("deep") },
    ];
  }, [world]);
  return (
    <div className="sol-find">
      <label className="sol-search">
        <span>Find a world or machine</span>
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
const whyLeft = (id: string) => {
  let p = whyCache.get(id);
  if (!p) {
    p = fetch(`/data/sites/${encodeURIComponent(id)}.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { whyLeft?: unknown } | null) => (typeof j?.whyLeft === "string" && j.whyLeft.trim() ? j.whyLeft : null))
      .catch(() => null);
    whyCache.set(id, p);
  }
  return p;
};

function SiteCard({ site }: { site: Target }) {
  const [why, setWhy] = useState<Record<string, string | null>>({});
  useEffect(() => {
    let off = false;
    Promise.all(site.items.map((m) => whyLeft(m.id))).then((vals) => !off && setWhy(Object.fromEntries(site.items.map((m, i) => [m.id, vals[i]]))));
    return () => {
      off = true;
    };
  }, [site]);
  const many = site.items.length > 1;
  return (
    <section className="sol-card" aria-live="polite">
      <p className="sol-eyebrow">{site.where}</p>
      <h2>{site.name}</h2>
      {many && <p className="sol-sub">{site.items.length} machines here</p>}
      <ul>
        {site.items.map((m) => {
          const s = statusOf(m);
          return (
            <li key={m.id}>
              {many && <h3>{m.name}</h3>}
              <p className="sol-status">
                {dot(s)}
                <span>
                  <b>{STATUS_LABEL[s]}</b>
                  {m.status && ` · ${m.status}`}
                </span>
              </p>
              {why[m.id] && (
                <p className="sol-why">
                  <b>Why it was left:</b> {why[m.id]}
                </p>
              )}
              <p className="sol-actions">
                <a className="sol-land" href={`/#${encodeURIComponent(m.id)}`}>
                  Land here →
                </a>
                <a href={`/explore#${encodeURIComponent(m.id)}`}>Open in the atlas</a>
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
function EarthCard({ orbit: o }: { orbit: EarthOrbit }) {
  const pct = (o.satellitesWorking / (o.satellitesWorking + o.trackedNotWorking)) * 100;
  const perDot = Math.round(o.tracked / (DEBRIS_DOTS.leo + DEBRIS_DOTS.meo + DEBRIS_DOTS.geo));
  return (
    <section className="sol-card" aria-live="polite">
      <p className="sol-eyebrow">Around Earth</p>
      <h2>Earth&apos;s orbit</h2>
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
          <dd>{n(o.fragmentationEvents)}</dd>
        </div>
        <div>
          <dt>Bits 1 to 10 cm, too small to track</dt>
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
        <li>Moon: NASA Scientific Visualization Studio, CGI Moon Kit, from LRO LROC and LOLA (public domain).</li>
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
        <li>Positions of planets and machines: NASA JPL Horizons, via the atlas data. Satellite and junk counts: ESA Space Debris Office (public/data/earth-orbit.json).</li>
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
