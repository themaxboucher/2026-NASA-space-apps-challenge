"use client";

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
    })().catch((err) => console.error("Ruins Among the Stars atlas failed to start", err));
  }, []);

  return (
    <>
      <header className="hero">
        <div className="hero-in">
          <div className="hero-copy">
            <p className="eyebrow">NASA Space Apps 2026 · Abandoned but not Forgotten</p>
            <h1>Ruins Among the Stars</h1>
            <p className="lede">
              Since the 1960s NASA has left rovers, landers, mirrors and probes all over the solar system. They are not
              junk: some still work, many could be fixed, and all of them have a story. Pick a world, find a machine, and
              work out what it would take to bring it back.
            </p>
          </div>
          <div className="cta">
            {/* A full page load on purpose: the tour runs its own WebGL scene, and Next keeps visited routes mounted. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a className="btn ghost" href="/">← Back to the tour</a>
            <a className="btn" href="#moon" data-go="moon">Explore the Moon →</a>
            <a className="btn ghost" href="#mars" data-go="mars">Visit Mars →</a>
          </div>
        </div>
      </header>

      <div className="wrap">
        <div className="bar">
          <nav className="worlds" role="tablist" aria-label="Choose a world">
            <button role="tab" data-world="moon" aria-selected="true">Moon<span className="n"></span></button>
            <button role="tab" data-world="mars" aria-selected="false">Mars<span className="n"></span></button>
            <button role="tab" data-world="beyond" aria-selected="false">Deep space<span className="n"></span></button>
          </nav>
          <div className="search">
            <input id="q" type="search" placeholder="Search machines and places…" aria-label="Search machines and places" aria-controls="qres" autoComplete="off" />
            <ul id="qres" role="listbox" hidden></ul>
          </div>
          <p className="eyebrow">Positions as of 14 Nov 2026</p>
        </div>

        <div className="explored" id="explored">
          <div className="explored-top">
            <span id="exploredText" aria-live="polite">You&apos;ve explored 0 machines</span>
            <span className="explored-worlds" id="exploredWorlds"></span>
            <button type="button" id="exploredReset" className="explored-reset" hidden>Start over</button>
          </div>
          <div className="explored-bar" id="exploredBar" role="progressbar" aria-label="Machines explored" aria-valuemin={0} aria-valuemax={79} aria-valuenow={0}>
            <b></b>
          </div>
        </div>

        <main className="console">
          <div className="mapcol">
            <section className="stage" aria-label="Map">
              <canvas id="globe" aria-label="Spinning globe. Use the machine list below to pick a machine with the keyboard."></canvas>
              <div className="pins" id="pins"></div>
              {/* SVG has no typed `hidden` prop; the engine toggles the attribute itself. */}
              <svg id="beyond" viewBox="-500 -500 1000 1000" preserveAspectRatio="xMidYMid meet" {...{ hidden: true }}></svg>
              <p className="hint" id="hint">Drag to spin · scroll to zoom</p>
              <button className="gbtn fsbtn" id="fsBtn" type="button" aria-pressed="false">⛶ Full screen</button>
              <button className="peg" id="peg" type="button" aria-label="Explorer: drag onto a glowing site to walk around it" title="Drag me onto a glowing site">
                <svg viewBox="-6 -2 52 72" aria-hidden="true"><g className="pm-legL"><rect x="13" y="37" width="7" height="17" rx="3.2" fill="#ebe5dc" stroke="#2a1a12" strokeWidth="1.3"/><rect x="11.8" y="51" width="9.2" height="6.5" rx="2.4" fill="#8f877d" stroke="#2a1a12" strokeWidth="1.3"/></g><g className="pm-legR"><rect x="20" y="37" width="7" height="17" rx="3.2" fill="#ebe5dc" stroke="#2a1a12" strokeWidth="1.3"/><rect x="19" y="51" width="9.2" height="6.5" rx="2.4" fill="#8f877d" stroke="#2a1a12" strokeWidth="1.3"/></g><rect x="9" y="18.5" width="22" height="17" rx="2.5" fill="#b9b0a4" stroke="#2a1a12" strokeWidth="1.3"/><g className="pm-armL"><rect x="4.6" y="21" width="6.4" height="15" rx="3.2" fill="#ebe5dc" stroke="#2a1a12" strokeWidth="1.3"/><circle cx="7.8" cy="37" r="3.1" fill="#8f877d" stroke="#2a1a12" strokeWidth="1.3"/></g><g className="pm-armR"><rect x="29" y="21" width="6.4" height="15" rx="3.2" fill="#ebe5dc" stroke="#2a1a12" strokeWidth="1.3"/><circle cx="32.2" cy="37" r="3.1" fill="#8f877d" stroke="#2a1a12" strokeWidth="1.3"/></g><rect x="11.5" y="19.5" width="17" height="20" rx="4.5" fill="#f4efe8" stroke="#2a1a12" strokeWidth="1.3"/><rect x="16" y="25" width="8" height="5" rx="1.2" fill="#d9814a"/><circle cx="20" cy="11.5" r="10" fill="#f4efe8" stroke="#2a1a12" strokeWidth="1.3"/><rect x="12.6" y="7.2" width="14.8" height="9.4" rx="4.7" fill="#2f2219"/><path d="M15 9.6c1.6-1.2 3.4-1.5 5.2-1.2" stroke="#c9a27e" strokeWidth="1.3" fill="none" strokeLinecap="round"/></svg>
              </button>
              <div className="ground" id="ground" hidden>
                <canvas id="groundCv" tabIndex={0}></canvas>
                <p className="gload" id="gLoad">Landing…</p>
                <div className="ghud top">
                  <button className="gbtn primary" id="gBack" type="button">← Back to the map</button>
                  <div><p className="eyebrow" id="gWorld"></p><h3 id="gTitle"></h3></div>
                  <button className="gbtn" id="gFs" type="button" aria-pressed="false">⛶ Full screen</button>
                  <span id="gCompass" aria-live="off">N</span>
                </div>
                <div className="ghud bottom">
                  <div className="gctl" id="gGo"></div>
                  <div className="gctl">
                    <button className="gbtn" data-k="KeyW" type="button" aria-label="Walk forward">▲</button>
                    <button className="gbtn" data-k="KeyS" type="button" aria-label="Walk back">▼</button>
                    <button className="gbtn" id="gJump" data-k="Space" type="button" aria-label="Fly up (hold)">Fly up</button>
                    <button className="gbtn" id="gDown" data-k="KeyC" type="button" aria-label="Fly down (hold)">Down</button>
                    <button className="gbtn" id="gMode" type="button" aria-pressed="false">Fly over</button>
                    <button className="gbtn primary" id="gPhoto" type="button" aria-pressed="false" hidden>Real photo 360°</button>
                  </div>
                  <p className="gnote" id="gHelp">
                    Click the view to look around with your mouse · W A S D or arrow keys to walk (Shift runs) · hold Space to fly up, C to go down · double-click the ground to go there
                  </p>
                  <p className="gnote credit" id="gCredit"></p>
                </div>
              </div>
            </section>
            <div className="legend">
              <span><i style={dot("var(--signal)")}></i>still sending data</span>
              <span><i style={dot("var(--echo)")}></i>silent, still used</span>
              <span><i style={dot("var(--quiet)")}></i>gone quiet</span>
              <span><i className="sq"></i>rover</span>
              <span><i className="ring"></i>impact / crash</span>
              <span><i className="seenmark"></i>you&apos;ve explored it</span>
            </div>
          </div>
          <aside className="dossier" id="dossier" aria-live="polite"></aside>
        </main>

        <section className="time" aria-label="Timeline">
          <div className="timehead">
            <button id="play" type="button">▶ Play history</button>
            <output id="yearOut" htmlFor="year">2026</output>
            <span id="yearNote"></span>
          </div>
          <div className="lives" id="lives"><div className="cursor" id="cursor"></div></div>
          <input type="range" id="year" min="1959" max="2026" step="1" defaultValue="2026" aria-label="Year" />
          <div className="axis" aria-hidden="true">
            <span>1959</span><span>1970</span><span>1980</span><span>1990</span><span>2000</span><span>2010</span><span>2026</span>
          </div>
        </section>

        <details className="roster" id="rosterBox">
          <summary>
            <span><span className="eyebrow">The roster · tap to open</span><span className="rtitle" id="rosterTitle">Machines</span></span>
            <span className="chev" aria-hidden="true">▾</span>
          </summary>
          <ul id="list"></ul>
        </details>
      </div>

      <footer className="foot">
        <div className="foot-in">
          <div className="foot-top">
            <p className="foot-title">Every machine has a story.</p>
            <a className="btn ghost" href="#beyond" data-go="beyond">Into deep space →</a>
          </div>
          <div className="cols">
            <div>
              <h2>Explore</h2>
              <ul>
                <li><a href="#moon" data-go="moon">Moon</a></li>
                <li><a href="#mars" data-go="mars">Mars</a></li>
                <li><a href="#beyond" data-go="beyond">Deep space</a></li>
              </ul>
            </div>
            <div>
              <h2>Sources</h2>
              <ul>
                <li><a href="https://nssdc.gsfc.nasa.gov/" target="_blank" rel="noopener">NSSDCA catalog ↗</a></li>
                <li><a href="https://science.nasa.gov/3d-resources/" target="_blank" rel="noopener">NASA 3D Resources ↗</a></li>
                <li><a href="https://www.lroc.asu.edu/" target="_blank" rel="noopener">LROC ↗</a></li>
                <li><a href="https://astrogeology.usgs.gov/" target="_blank" rel="noopener">USGS Astrogeology ↗</a></li>
              </ul>
            </div>
            <div className="creds">
              <h2>Credits</h2>
              <p>Machine facts compiled from NASA&apos;s NSSDCA catalog and NASA/JPL mission pages; every dossier links its source.</p>
              <p>Moon map: NASA/GSFC/Arizona State University (LROC, SVS CGI Moon Kit). Mars map: Solar System Scope, CC BY 4.0, from NASA data.</p>
              <p>
                Header photo: Apollo 15 rover at its final parking spot, AS15-88-11901, NASA/David R. Scott, public domain (
                <a href="https://commons.wikimedia.org/wiki/File:AS15-88-11901_(21472944789).jpg" target="_blank" rel="noopener">source</a>).
                Footer panorama: Perseverance Mastcam-Z at Jezero, NASA/JPL-Caltech/ASU/MSSS, public domain (
                <a href="https://commons.wikimedia.org/wiki/File:Mastcam-Z%27s_First_360-Degree_Panorama.jpg" target="_blank" rel="noopener">source</a>).
              </p>
              <p>
                3D spacecraft: <a href="https://science.nasa.gov/3d-resources/" target="_blank" rel="noopener">NASA 3D Resources</a> (free under
                NASA media guidelines; each model links its page).
              </p>
              <p>Deep-space positions: JPL Horizons for 14 Nov 2026; other planets approximate.</p>
            </div>
          </div>
          <div className="foot-bottom">
            <p className="eyebrow">NASA Space Apps 2026 · Abandoned but not Forgotten</p>
            <p className="eyebrow">Ruins Among the Stars</p>
          </div>
        </div>
        <div className="strip" aria-hidden="true"></div>
      </footer>
    </>
  );
}
