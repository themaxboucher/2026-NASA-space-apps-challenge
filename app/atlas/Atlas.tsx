"use client";

import { ArrowLeft, ArrowRight, ChevronDown, ChevronUp, Maximize, Play } from "lucide-react";
import { useEffect, type CSSProperties } from "react";
import "./atlas.css";
import "./atlas-type.css";
import "./salvage.css";
import "./live.css";

// three.js r128 (UMD) and its loaders are self-hosted in /public/vendor/three; the engine expects the global THREE.
const VENDOR = ["/vendor/three/three.min.js", "/vendor/three/GLTFLoader.js", "/vendor/three/DRACOLoader.js"];

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    if (document.querySelector(`script[data-atlas="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.async = false;
    s.dataset.atlas = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

let started = false; // the engine owns the DOM below; start it once (React may run effects twice in dev)

const dot = (c: string) => ({ "--c": c }) as CSSProperties;

export default function Atlas() {
  useEffect(() => {
    if (started) return;
    started = true;
    (async () => {
      for (const src of VENDOR) await loadScript(src);
      const { startAtlas } = await import("./engine.js");
      startAtlas();
    })().catch((err) => console.error("Ruins Among the Stars failed to start", err));
  }, []);

  return (
    <>
      <div className="wrap">
        <h1 className="sr-only">Ruins Among the Stars</h1>
        <div className="bar">
          <div className="barl">
            {/* A full page load on purpose: the tour runs its own WebGL scene, and Next keeps visited routes mounted. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a className="back" href="/" aria-label="Back to the tour"><ArrowLeft aria-hidden="true" /><span className="backtxt"> Tour</span></a>
            <a className="back solar-cta" href="/solar">Fly around the solar system <ArrowRight aria-hidden="true" /></a>
            <nav className="worlds" role="tablist" aria-label="Choose a world">
              <button role="tab" data-world="moon" aria-selected="true">Moon<span className="n"></span></button>
              <button role="tab" data-world="mars" aria-selected="false">Mars<span className="n"></span></button>
              <button role="tab" data-world="beyond" aria-selected="false">Deep space<span className="n"></span></button>
            </nav>
          </div>
          <div className="search">
            <input id="q" type="search" placeholder="Search space objects and places…" aria-label="Search space objects and places" aria-controls="qres" autoComplete="off" />
            <ul id="qres" role="listbox" hidden></ul>
          </div>
          <p className="eyebrow">Positions as of 14 Nov 2026</p>
        </div>

        <div className="explored" id="explored">
          <div className="explored-top">
            <span id="exploredText" aria-live="polite">You&apos;ve explored 0 space objects</span>
            <span className="explored-worlds" id="exploredWorlds"></span>
            <button type="button" id="exploredReset" className="explored-reset" hidden>Start over</button>
          </div>
          <div className="explored-bar" id="exploredBar" role="progressbar" aria-label="Space objects explored" aria-valuemin={0} aria-valuemax={79} aria-valuenow={0}>
            <b></b>
          </div>
        </div>

        <main className="console">
          <div className="mapcol">
            <section className="stage" aria-label="Map">
              <canvas id="globe" aria-label="Spinning globe. Use the space object list below to pick a space object with the keyboard."></canvas>
              <div className="pins" id="pins"></div>
              {/* SVG has no typed `hidden` prop; the engine toggles the attribute itself. */}
              <svg id="beyond" viewBox="-500 -500 1000 1000" preserveAspectRatio="xMidYMid meet" {...{ hidden: true }}></svg>
              <p className="hint" id="hint">Drag to spin · +/− or Ctrl + scroll to zoom</p>
              <button className="gbtn fsbtn" id="fsBtn" type="button" aria-pressed="false"><Maximize aria-hidden="true" /> Full screen</button>
              <button className="peg" id="peg" type="button" aria-label="Explorer: drag onto a glowing site to walk around it" title="Drag me onto a glowing site">
                <svg viewBox="-6 -2 52 72" aria-hidden="true"><g className="pm-legL"><rect x="13" y="37" width="7" height="17" rx="3.2" fill="#eceef1" stroke="#15181e" strokeWidth="1.3"/><rect x="11.8" y="51" width="9.2" height="6.5" rx="2.4" fill="#8a909a" stroke="#15181e" strokeWidth="1.3"/></g><g className="pm-legR"><rect x="20" y="37" width="7" height="17" rx="3.2" fill="#eceef1" stroke="#15181e" strokeWidth="1.3"/><rect x="19" y="51" width="9.2" height="6.5" rx="2.4" fill="#8a909a" stroke="#15181e" strokeWidth="1.3"/></g><rect x="9" y="18.5" width="22" height="17" rx="2.5" fill="#b4bac3" stroke="#15181e" strokeWidth="1.3"/><g className="pm-armL"><rect x="4.6" y="21" width="6.4" height="15" rx="3.2" fill="#eceef1" stroke="#15181e" strokeWidth="1.3"/><circle cx="7.8" cy="37" r="3.1" fill="#8a909a" stroke="#15181e" strokeWidth="1.3"/></g><g className="pm-armR"><rect x="29" y="21" width="6.4" height="15" rx="3.2" fill="#eceef1" stroke="#15181e" strokeWidth="1.3"/><circle cx="32.2" cy="37" r="3.1" fill="#8a909a" stroke="#15181e" strokeWidth="1.3"/></g><rect x="11.5" y="19.5" width="17" height="20" rx="4.5" fill="#f5f6f8" stroke="#15181e" strokeWidth="1.3"/><rect x="16" y="25" width="8" height="5" rx="1.2" fill="#146ef5"/><circle cx="20" cy="11.5" r="10" fill="#f5f6f8" stroke="#15181e" strokeWidth="1.3"/><rect x="12.6" y="7.2" width="14.8" height="9.4" rx="4.7" fill="#1c2129"/><path d="M15 9.6c1.6-1.2 3.4-1.5 5.2-1.2" stroke="#9cc3ff" strokeWidth="1.3" fill="none" strokeLinecap="round"/></svg>
              </button>
              <div className="ground" id="ground" hidden>
                <canvas id="groundCv" tabIndex={0}></canvas>
                <p className="gload" id="gLoad">Landing…</p>
                <div className="ghud top">
                  <button className="gbtn primary" id="gBack" type="button"><ArrowLeft aria-hidden="true" /> Back to the map</button>
                  <div><p className="eyebrow" id="gWorld"></p><h3 id="gTitle"></h3></div>
                  <button className="gbtn" id="gFs" type="button" aria-pressed="false"><Maximize aria-hidden="true" /> Full screen</button>
                  <span id="gCompass" aria-live="off">N</span>
                </div>
                <div className="ghud bottom">
                  <div className="gctl" id="gGo"></div>
                  <div className="gctl">
                    <button className="gbtn" data-k="KeyW" type="button" aria-label="Walk forward"><ChevronUp aria-hidden="true" /></button>
                    <button className="gbtn" data-k="KeyS" type="button" aria-label="Walk back"><ChevronDown aria-hidden="true" /></button>
                    <button className="gbtn" id="gJump" data-k="Space" type="button" aria-label="Jump (hold to fly up)">Jump</button>
                    <button className="gbtn" id="gDown" data-k="KeyC" type="button" aria-label="Fly down (hold)">Down</button>
                    <button className="gbtn" id="gMode" type="button" aria-pressed="false">Fly over</button>
                    <button className="gbtn primary" id="gPhoto" type="button" aria-pressed="false" hidden>Real photo 360°</button>
                  </div>
                  <p className="gnote" id="gHelp">
                    Click the view to look around with your mouse · W A S D or arrow keys to walk (Shift runs) · tap Space to jump, hold it to fly up, C to go down · double-click the ground to go there
                  </p>
                  <p className="gnote credit" id="gCredit"></p>
                </div>
              </div>
            </section>
            <div className="legend">
              <span><i className="alive" style={dot("var(--signal)")}></i>still sending data</span>
              <span><i className="echo" style={dot("var(--echo)")}></i>silent mirror, still used</span>
              <span><i style={dot("var(--quiet)")}></i>gone quiet</span>
              <span><i className="sq"></i>rover</span>
              <span><i className="ring"></i>impact / crash</span>
              <span><i className="seenmark"></i>you&apos;ve opened it</span>
              <span><i className="fullmark">✓</i>you&apos;ve fully explored it (every spot found)</span>
              <span><i className="site">3</i>space objects at one landing site</span>
            </div>
          </div>
          <aside className="dossier" id="dossier"></aside>
          <p className="sr-only" id="announce" aria-live="polite"></p>
        </main>

        <section className="time" aria-label="Timeline">
          <div className="timehead">
            <button id="play" type="button"><Play aria-hidden="true" /> Play history</button>
            <output id="yearOut" htmlFor="year">2026</output>
            <span id="yearNote"></span>
          </div>
          <div className="lives" id="lives"><div className="cursor" id="cursor"></div></div>
          <input type="range" id="year" min="1959" max="2026" step="1" defaultValue="2026" aria-label="Year" />
          <div className="axis" aria-hidden="true">
            {/* Same scale as the bars: 1959 at the left edge, end of 2026 at the right. */}
            {[1960, 1970, 1980, 1990, 2000, 2010, 2020].map(y => (
              <span key={y} className={y % 20 ? "odd" : undefined} style={{ left: `${((y - 1959) / 68) * 100}%` }}>{y}</span>
            ))}
          </div>
        </section>

        <details className="roster" id="rosterBox">
          <summary>
            <span><span className="eyebrow">The roster · tap to open</span><span className="rtitle" id="rosterTitle">Space objects</span></span>
            <ChevronDown className="chev" aria-hidden="true" />
          </summary>
          <ul id="list"></ul>
        </details>

        {/* CC BY material (the team's Blender models, the Apollo LRV model) needs its attribution on the page. */}
        <p className="credits">
          Facts: <a href="https://nssdc.gsfc.nasa.gov/" target="_blank" rel="noopener">NASA NSSDCA</a> and mission pages, linked in each dossier ·
          Moon map: NASA SVS CGI Moon Kit (LRO LROC/LOLA) · Mars map: USGS Astrogeology Viking MDIM 2.1 and MGS MOLA ·
          Mars surroundings: NASA/JPL/MSSS/The Caltech Murray Lab/Esri (CTX) · Geology: USGS SIM 3292 ·
          Team 3D models (Blender, from NASA reference photos): CC BY 4.0 · Photos: NASA, public domain, credited on each ·
          3D models: <a href="https://science.nasa.gov/3d-resources/" target="_blank" rel="noopener">NASA 3D Resources</a> ·
          Deep-space positions: JPL Horizons, 14 Nov 2026
        </p>
      </div>
    </>
  );
}
