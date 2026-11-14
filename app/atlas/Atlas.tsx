"use client";

import { useEffect, type CSSProperties } from "react";
import "./atlas.css";

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
    })().catch((err) => console.error("Ghost Rover Atlas failed to start", err));
  }, []);

  return (
    <>
      <header className="hero">
        <div className="hero-in">
          <div className="hero-copy">
            <p className="eyebrow">NASA Space Apps 2026 · Abandoned but not Forgotten</p>
            <h1>Ghost Rover Atlas</h1>
            <p className="lede">
              Since the 1960s NASA has left rovers, landers, mirrors and probes all over the solar system. They are still
              out there. Pick a world, find a machine, and let it tell you its story.
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
          <p className="eyebrow">Positions as of 14 Nov 2026</p>
        </div>

        <main className="console">
          <div className="mapcol">
            <section className="stage" aria-label="Map">
              <canvas id="globe" aria-label="Spinning globe. Use the machine list below to pick a machine with the keyboard."></canvas>
              <div className="pins" id="pins"></div>
              {/* SVG has no typed `hidden` prop; the engine toggles the attribute itself. */}
              <svg id="beyond" viewBox="-500 -500 1000 1000" preserveAspectRatio="xMidYMid meet" {...{ hidden: true }}></svg>
              <p className="hint" id="hint">Drag to spin · scroll to zoom</p>
              <button className="peg" id="peg" type="button" aria-label="Explorer: drag onto a glowing site to walk around it">
                <svg viewBox="0 0 16 22" aria-hidden="true">
                  <circle cx="8" cy="3.5" r="3.2" fill="currentColor" />
                  <path d="M3 9.5c0-1.4 1.1-2.5 2.5-2.5h5c1.4 0 2.5 1.1 2.5 2.5V15h-2v7H5v-7H3z" fill="currentColor" />
                </svg>
                Drag to explore
              </button>
              <div className="ground" id="ground" hidden>
                <canvas id="groundCv" tabIndex={0}></canvas>
                <p className="gload" id="gLoad">Landing…</p>
                <div className="ghud top">
                  <button className="gbtn primary" id="gBack" type="button">← Back to the map</button>
                  <div><p className="eyebrow" id="gWorld"></p><h3 id="gTitle"></h3></div>
                  <span id="gCompass" aria-live="off">N</span>
                </div>
                <div className="ghud bottom">
                  <div className="gctl" id="gGo"></div>
                  <div className="gctl">
                    <button className="gbtn" data-k="KeyW" type="button" aria-label="Walk forward">▲</button>
                    <button className="gbtn" data-k="KeyS" type="button" aria-label="Walk back">▼</button>
                    <button className="gbtn" id="gJump" type="button">Jump</button>
                    <button className="gbtn" id="gMode" type="button" aria-pressed="false">Fly over</button>
                    <label htmlFor="gExag">Hills ×<input type="range" id="gExag" min="1" max="5" step="0.5" defaultValue="1" /></label>
                  </div>
                  <p className="gnote" id="gHelp">
                    Drag to look around · W A S D or arrow keys to walk (Shift runs) · double-click the ground to go there · Space to jump
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
            <p className="eyebrow">Ghost Rover Atlas</p>
          </div>
        </div>
        <div className="strip" aria-hidden="true"></div>
      </footer>
    </>
  );
}
