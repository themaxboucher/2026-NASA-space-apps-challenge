"use client";

import { useEffect, useMemo, useState } from "react";
import { getLevel, LEVELS } from "../atlas/level.js";
import "./signals.css";

// What We Heard Back: an encyclopedia of the signals you've collected. Every space object we left out there gets an
// entry, silent until you visit it (in the tour, the atlas or the solar system; all three save to "gra-explored" in
// this browser). Then its entry fills in: where it rests, when we last heard from it, what it made possible and one
// piece of the science behind it. Collect all 79 and the encyclopedia closes with a certificate.
type Photo = { file: string; credit?: string; license?: string; caption?: string };
type Item = {
  id: string;
  name: string;
  mission: string;
  status: string;
  arrived?: string;
  launched?: string;
  why?: string;
  lastContact?: string;
  ended?: string;
  lastWords?: string;
  photo?: Photo;
};
type Sci = {
  breakthrough: string;
  tech: { title: string; text: string; source: { label: string; url: string } }[];
  levels?: Record<string, { breakthrough?: string; tech?: { title?: string; text?: string }[] }>;
};
const WORLDS = [
  { key: "moon", title: "The Moon", file: "/data/moon.json" },
  { key: "mars", title: "Mars", file: "/data/mars.json" },
  { key: "deepspace", title: "Deep space", file: "/data/deepspace.json" },
] as const;
const DATES_KEY = "gra-book-dates"; // when each signal was first received in this browser

const readSet = (k: string) => {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(k) || "[]");
    return new Set(Array.isArray(v) ? (v as string[]) : []);
  } catch {
    return new Set<string>();
  }
};
const year = (it: Item) => (it.arrived || it.launched || "").slice(0, 4);
// "1969-07-21" -> "21 July 1969"; a bare year stays a year.
const fmtDay = (s: string) =>
  s.length < 10 ? s.slice(0, 4) : new Date(s.slice(0, 10) + "T12:00:00Z").toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const fmtDate = (ms: number) => new Date(ms).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" });

export default function Signals() {
  const [worlds, setWorlds] = useState<{ key: string; title: string; items: Item[] }[] | null>(null);
  const [sci, setSci] = useState<Record<string, Sci>>({});
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [sealed, setSealed] = useState<Set<string>>(new Set());
  const [dates, setDates] = useState<Record<string, number>>({});
  const [level, setLvl] = useState("student");

  useEffect(() => {
    Promise.all(WORLDS.map((w) => fetch(w.file).then((r) => (r.ok ? r.json() : [])))).then((all: Item[][]) =>
      setWorlds(
        WORLDS.map((w, i) => ({
          key: w.key,
          title: w.title,
          items: [...(Array.isArray(all[i]) ? all[i] : [])].sort((a, b) => (a.arrived || a.launched || "").localeCompare(b.arrived || b.launched || "")),
        })),
      ),
    );
    fetch("/data/science.json")
      .then((r) => (r.ok ? r.json() : {}))
      .then(setSci)
      .catch(() => {});
    const load = () => {
      const s = readSet("gra-explored");
      setSeen(s);
      setSealed(readSet("gra-complete"));
      setLvl(getLevel());
      // Date each page the first time the book sees it remembered.
      let d: Record<string, number> = {};
      try {
        d = JSON.parse(localStorage.getItem(DATES_KEY) || "{}") || {};
      } catch {
        /* fresh */
      }
      let changed = false;
      s.forEach((id) => {
        if (!d[id]) {
          d[id] = Date.now();
          changed = true;
        }
      });
      if (changed)
        try {
          localStorage.setItem(DATES_KEY, JSON.stringify(d));
        } catch {
          /* private mode */
        }
      setDates(d);
    };
    load();
    addEventListener("storage", load);
    addEventListener("gra-level", load);
    return () => {
      removeEventListener("storage", load);
      removeEventListener("gra-level", load);
    };
  }, []);

  const total = useMemo(() => worlds?.reduce((n, w) => n + w.items.length, 0) ?? 79, [worlds]);
  const count = useMemo(() => worlds?.reduce((n, w) => n + w.items.filter((i) => seen.has(i.id)).length, 0) ?? 0, [worlds, seen]);
  const done = worlds !== null && count === total;
  const levelName = LEVELS.find((l) => l.id === level)?.label ?? LEVELS[1].label;

  return (
    <main className="book">
      <header className="book-cover">
        <nav className="book-nav">
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- full loads on purpose (the tour and atlas run their own WebGL) */}
          <a href="/">← Tour</a>
          { }
          <a href="/explore">Atlas</a>
          { }
          <a href="/solar">Solar system</a>
          <button type="button" onClick={() => print()}>
            Print the encyclopedia
          </button>
        </nav>
        <p className="book-kicker">Echoes of Exploration</p>
        <h1>What We Heard Back</h1>
        <p className="book-lede">
          Since the 1960s, NASA has left {total} space objects out there: landers and rovers on the Moon and Mars, probes that crashed on purpose,
          and spacecraft still sailing out of the solar system. Most went quiet long ago, but each one still has something to tell us. This is your
          encyclopedia of those echoes: every space object you visit sends back its entry, with the science that took it there.
        </p>
        <div className="book-progress" role="status">
          <b>
            {count} of {total}
          </b>{" "}
          signals received
          <span className="book-bar" aria-hidden="true">
            <i style={{ width: `${(count / total) * 100}%` }} />
          </span>
          <span className="book-note">Entries fill in as you visit space objects in the tour, the atlas or the solar system. Written for: {levelName}.</span>
        </div>
      </header>

      {worlds?.map((w) => (
        <section key={w.key} className="book-world" aria-labelledby={`bw-${w.key}`}>
          <h2 id={`bw-${w.key}`}>
            {w.title} <span>{w.items.filter((i) => seen.has(i.id)).length} of {w.items.length}</span>
          </h2>
          <ol className="book-pages">
            {w.items.map((it) => {
              const on = seen.has(it.id);
              const s = sci[it.id];
              const v = s?.levels?.[level];
              const tech = s?.tech?.[0];
              const tv = v?.tech?.[0];
              return (
                <li key={it.id} className={`book-page${on ? " on" : ""}${sealed.has(it.id) ? " sealed" : ""}`}>
                  {on ? (
                    <>
                      {it.photo?.file && (
                        <figure>
                          {/* eslint-disable-next-line @next/next/no-img-element -- static, already sized */}
                          <img src={`/${it.photo.file}`} alt="" loading="lazy" />
                          {it.photo.credit && (
                            <figcaption>
                              {it.photo.credit}
                              {it.photo.license ? ` · ${it.photo.license}` : ""}
                            </figcaption>
                          )}
                        </figure>
                      )}
                      <p className="bp-meta">
                        {it.mission} · {year(it)}
                      </p>
                      <h3>{it.name}</h3>
                      <p className="bp-status">{it.status}</p>
                      {(it.lastContact || it.ended) && <p className="bp-last">Last heard from: {fmtDay(it.lastContact || it.ended!)}</p>}
                      {it.lastWords && <p className="bp-words">{it.lastWords}</p>}
                      {s && <p className="bp-gave">{v?.breakthrough ?? s.breakthrough}</p>}
                      {tech && (
                        <div className="bp-sci">
                          <b>{tv?.title ?? tech.title}</b>
                          <p>{tv?.text ?? tech.text}</p>
                          <a href={tech.source.url} target="_blank" rel="noopener noreferrer">
                            {tech.source.label} ↗
                          </a>
                        </div>
                      )}
                      <p className="bp-foot">
                        {sealed.has(it.id) && <span className="bp-seal">✓ Every clue found</span>}
                        {dates[it.id] && <span>Signal received {fmtDate(dates[it.id])}</span>}
                        <a href={`/explore#${it.id}`}>Open in the atlas</a>
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="bp-meta">
                        {it.mission} · {year(it)}
                      </p>
                      <h3>{it.name}</h3>
                      <p className="bp-locked">No signal yet. Tune in by visiting it.</p>
                      <p className="bp-foot">
                        <a href={`/explore#${it.id}`}>Visit in the atlas</a>
                        <a href={`/#${it.id}`}>Walk the site</a>
                      </p>
                    </>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      ))}

      {done && (
        <section className="book-cert" aria-labelledby="cert-title">
          <p className="book-kicker">Certificate</p>
          <h2 id="cert-title">Every signal received</h2>
          <p>
            You tuned in to every one of the {total} space objects NASA left on the Moon, on Mars and in deep space, and learned the science that got
            them there. They went quiet, but their echoes keep teaching us.
          </p>
          <p className="cert-sign">Echoes of Exploration · NASA Space Apps Challenge 2026</p>
          <button type="button" onClick={() => print()}>
            Print your certificate
          </button>
        </section>
      )}
    </main>
  );
}
