"use client";

import { useFrame } from "@react-three/fiber";
import { use, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { reducedMotion } from "../../lib/device";
import { useStore } from "../../lib/store";
import { eclToScene, VOYAGER_ECL } from "../../plans";
import { endReplay, replayClock, hud, live, REPLAYS, setCaption, tour } from "../../state";
import { STOP_INDEX, type Stop } from "../../stops";
import { smooth, type Cue } from "../Ghost";
import { jupiterTexture, RING_INNER, RING_OUTER, ringTexture, saturnTexture } from "../textures";
import { caption, disposeSprite, glowSprite } from "./cassini";

REPLAYS.add("voyager1");

// Voyager 1's real path, from JPL Horizons (public/data/voyager1-trajectory.json): heliocentric ecliptic positions in
// AU for Voyager 1, Earth, Jupiter and Saturn on one shared time grid (days since 5 Sep 1977), plus Voyager's speed
// relative to the Sun in km/s. The grid is every 6 hours around the two flybys, so they line up with the real planets.
type Track = { t: number[]; voyager1: number[]; earth: number[]; jupiter: number[]; saturn: number[]; speed: number[] };
let trackData: Promise<Track | null> | null = null;
const loadTrack = () => (trackData ??= fetch("/data/voyager1-trajectory.json").then((r) => (r.ok ? r.json() : null)).catch(() => null));

const DAY0 = Date.UTC(1977, 8, 5);
const day = (y: number, m: number, d: number) => (Date.UTC(y, m - 1, d) - DAY0) / 864e5;
const dateOf = (d: number) => new Date(DAY0 + d * 864e5).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const PBD = day(1990, 2, 14) + 0.2; // the Pale Blue Dot
const TODAY = day(2026, 11, 15);
// Voyager 2 today (public/data/deepspace.json), and back in time along the same line from the Sun: since Neptune
// (1989) it has been coasting almost straight out, about 3.05 AU a year (from ~32 AU in early 1990 to 144 AU now).
const V2_NOW = eclToScene(VOYAGER_ECL.voyager2);
const V2_AU_PER_DAY = 3.05 / 365.25;
const V2_FROM = day(1990, 3, 1); // drawn only once the timeline is past its last planet

// The replay clock (seconds) against the mission clock (days). A smooth, never-backwards curve through these:
// slow at launch and at each flyby, a pause for the Pale Blue Dot, then the long years flash by.
const KEYS: [number, number][] = [
  [0, 0.54], // launch, 12:56 UTC
  [5, 40],
  [11, 505],
  [14, 546.5], // Jupiter closest approach, 5 March 1979
  [17, 590],
  [22.5, 1125],
  [25.5, 1165], // Saturn closest approach, 12 November 1980 (Titan the same morning)
  [28.5, 1210],
  [35, PBD],
  [43, PBD + 0.3],
  [48, day(2012, 8, 25)], // into interstellar space
  [51, day(2025, 2, 25)], // cosmic ray detector off
  [53.5, day(2026, 4, 17)], // particle detector off
  [56, TODAY],
];
// Monotone cubic (Fritsch-Butland slopes), so the mission clock eases between keys and never runs backwards.
function monotone(keys: [number, number][]) {
  const n = keys.length;
  const sec = keys.slice(1).map((k, i) => (k[1] - keys[i][1]) / (k[0] - keys[i][0]));
  const m = keys.map((_, k) => {
    if (k === 0) return sec[0];
    if (k === n - 1) return 0; // come to rest at today
    const h0 = keys[k][0] - keys[k - 1][0],
      h1 = keys[k + 1][0] - keys[k][0];
    return sec[k - 1] * sec[k] <= 0 ? 0 : (3 * (h0 + h1)) / ((2 * h1 + h0) / sec[k - 1] + (h1 + 2 * h0) / sec[k]);
  });
  return (t: number) => {
    if (t <= keys[0][0]) return keys[0][1];
    if (t >= keys[n - 1][0]) return keys[n - 1][1];
    let k = 0;
    while (t > keys[k + 1][0]) k++;
    const h = keys[k + 1][0] - keys[k][0],
      s = (t - keys[k][0]) / h;
    const s2 = s * s,
      s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * keys[k][1] + (s3 - 2 * s2 + s) * h * m[k] + (3 * s2 - 2 * s3) * keys[k + 1][1] + (s3 - s2) * h * m[k + 1];
  };
}
const missionDay = monotone(KEYS);

const REVEAL = 57.5; // the ghost has faded out: the real Voyager stands where it arrived, today
const SWAP = REVEAL - 1.5; // the real model appears (and the camera moves in) as the ghost starts to fade, with no empty gap
const END = 63;
const CUES: Cue[] = [
  { at: 0, text: "5 September 1977: Voyager 1 blasts off from Florida and races away from Earth, headed for the giant planets." },
  { at: 5.5, text: "Climbing away from the Sun slows it down, like a ball thrown uphill. For 18 months it coasts toward Jupiter." },
  { at: 11, text: "5 March 1979: it swings close past Jupiter. Jupiter’s gravity flings it faster, from about 13 to about 24 km every second!" },
  { at: 15, text: "Its cameras discover volcanoes erupting on Jupiter’s moon Io: the first active volcanoes ever seen beyond Earth." },
  { at: 18, text: "Jupiter has bent its path toward Saturn. Twenty months later it gets there." },
  { at: 22.5, text: "12 November 1980: Voyager 1 flies close past Titan, Saturn’s giant moon, and then past Saturn itself." },
  { at: 25.5, text: "Saturn’s gravity bends its path up and out of the flat plane where the planets travel. It will never meet another planet." },
  { at: 29, text: "Year after year it climbs away from the Sun, toward the stars." },
  { at: 34.5, text: "14 February 1990. Six billion km from home, Voyager 1 turns its cameras back for one last look." },
  { at: 38, text: "It takes a Family Portrait of the planets. In one picture, Earth is just a pale blue dot, smaller than a single pixel." },
  { at: 43, text: "Soon after, its cameras are switched off for good, to save power for the long trip ahead." },
  { at: 45.5, text: "Its nuclear power slowly fades, so over the years engineers switch off one instrument after another." },
  { at: 48, text: "25 August 2012: Voyager 1 leaves the Sun’s giant bubble and becomes the first spacecraft in interstellar space. Its twin, Voyager 2, follows in 2018." },
  { at: 51, text: "The cosmic ray detector went quiet in 2025, and a particle detector in April 2026. Just two instruments are still on." },
  { at: 54.5, text: "Today Voyager 1 is nearly 26 billion km away and still talking to us. Its messages take about 24 hours, a whole day, to reach Earth." },
];

// The ghost Voyager always sits at the scene's middle (where the real model is) and the Solar System is drawn
// around it: world = (position - Voyager) * S, at S scene units per AU. Changing S is a zoom; distances between
// things stay to scale. Only the Sun's and planets' sizes are not (see the readout note).
// The camera, per beat: its place in a frame that turns with Voyager (ahead = its direction of travel seen from above,
// up = ecliptic north, side = to its left, back = straight out along the line from the Sun), and what it looks at: a mix of
// the Sun's, Jupiter's and Saturn's places.
type Beat = { at: number; S: number; cam: [number, number, number, number]; sun: number; jup: number; sat: number; v2?: number; glow: number };
const BEATS: Beat[] = [
  { at: 0, S: 8, cam: [-7, 4, -2, 0], sun: 0.3, jup: 0, sat: 0, glow: 0.09 }, // launch
  { at: 5, S: 1.4, cam: [-5, 8, 2, 0], sun: 0, jup: 0.45, sat: 0, glow: 0.07 }, // coasting to Jupiter
  { at: 11, S: 12, cam: [-2, 9, 2, 0], sun: 0, jup: 0.6, sat: 0, glow: 0.07 }, // the Jupiter flyby, from above: the bend
  { at: 17.5, S: 1.1, cam: [-5, 8, 2, 0], sun: 0, jup: 0, sat: 0.4, glow: 0.07 }, // on to Saturn
  { at: 22, S: 14, cam: [-4, 1.2, -8, 0], sun: 0, jup: 0, sat: 0.5, glow: 0.07 }, // the Saturn flyby
  { at: 26, S: 3, cam: [0, 0.4, -10, 0], sun: 0, jup: 0, sat: 0.5, glow: 0.06 }, // side on: bent up out of the plane
  { at: 29, S: 0.45, cam: [-2, 1.5, -10, 0], sun: 0.45, jup: 0, sat: 0, glow: 0.06 }, // climbing out
  { at: 33.5, S: 30, cam: [0, 0.9, 0.6, 5], sun: 1, jup: 0, sat: 0, glow: 0.022 }, // looking back home
  { at: 43, S: 0.04, cam: [-1, 2.5, -10, 0], sun: 0.5, jup: 0, sat: 0, glow: 0.05 }, // the whole trip, side on
  { at: 47.5, S: 0.03, cam: [-1, 3, -10, 0], sun: 0.3, jup: 0, sat: 0, v2: 0.4, glow: 0.05 }, // and Voyager 2, far to the south
];
const EASE = 2.2; // seconds to glide from one beat to the next
// The two slingshots (from the coast to Jupiter until Voyager climbs away past Saturn, story seconds 5 to 29)
// play this much faster than the rest; everything else in this file is timed in story seconds.
const SLING = [5, 29] as const;
const SLING_SPEED = 1.6;
const storyTime = (real: number) =>
  real < SLING[0] ? real : Math.min(SLING[1], SLING[0] + (real - SLING[0]) * SLING_SPEED) + Math.max(0, real - SLING[0] - (SLING[1] - SLING[0]) / SLING_SPEED);
const V_NOW = { pos: [7, 1, 8] as [number, number, number], look: [0, 0, 0] as [number, number, number] };
// Saturn's north pole (RA 40.59°, Dec 83.54°) in ecliptic coordinates is lon 79.5°, lat 61.9°; its rings lie in its equator.
const SATURN_POLE = new THREE.Vector3(0.0857, 0.8825, -0.4622).normalize();
// Drawn radii in AU (true: Jupiter 0.00048, Saturn 0.00039), so the giants show up beside the path.
const R_JUP = 0.02,
  R_SAT = 0.017;
const AU_KM = 149597870.7;

// Ecliptic (x, y, z north) into the scene's axes (y up).
const put = (a: number[], i: number, out: THREE.Vector3) => out.set(a[3 * i], a[3 * i + 2], -a[3 * i + 1]);
// Position at sample i + f, moving along the arc (radius, longitude, height) rather than the straight chord, so a
// planet sampled every 60 days still goes round its orbit rather than cutting corners.
function at(a: number[], i: number, f: number, out: THREE.Vector3) {
  const ax = a[3 * i],
    ay = a[3 * i + 1],
    bx = a[3 * i + 3],
    by = a[3 * i + 4];
  const ra = Math.hypot(ax, ay),
    la = Math.atan2(ay, ax);
  let dl = Math.atan2(by, bx) - la;
  dl -= 2 * Math.PI * Math.round(dl / (2 * Math.PI));
  const r = ra + (Math.hypot(bx, by) - ra) * f,
    l = la + dl * f;
  return out.set(r * Math.cos(l), a[3 * i + 2] + (a[3 * i + 5] - a[3 * i + 2]) * f, -r * Math.sin(l));
}

// The sample just before mission day d, and how far on toward the next one.
function sample(T: number[], d: number): [number, number] {
  let lo = 0,
    hi = T.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (T[mid] <= d) lo = mid;
    else hi = mid - 1;
  }
  return [lo, Math.min(1, Math.max(0, (d - T[lo]) / (T[lo + 1] - T[lo])))];
}

function line(points: THREE.Vector3[], color: string, opacity: number, loop = false) {
  const g = new THREE.BufferGeometry().setFromPoints(points);
  const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
  return loop ? new THREE.LineLoop(g, m) : new THREE.Line(g, m);
}

// A name tag that stays the same size on screen, sitting just above its point (or wherever `center` puts it).
export function label(text: string, center: [number, number] = [0.5, -0.6]) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const g = c.getContext("2d")!;
  g.font = "600 30px system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.shadowColor = "rgba(0,0,0,0.9)";
  g.shadowBlur = 8;
  g.fillStyle = "#e8f2ff";
  g.fillText(text, 128, 32);
  const textW = Math.min(1, (g.measureText(text).width + 8) / 256); // the drawn text's share of the tag's width
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false }));
  s.scale.set(0.11, 0.0275, 1);
  s.center.set(...center);
  s.renderOrder = 1002;
  s.userData.textW = textW;
  s.userData.shown = 1;
  return s;
}

// Fades out any tag that would overlap a tag placed before it (in this order of importance), on screen.
const TAG_ORDER = ["sun", "jupiter", "saturn", "earth", "voyager", "voyager2"] as const;
const tagAt = new THREE.Vector3();
function declutter(labels: Record<(typeof TAG_ORDER)[number], THREE.Sprite>, camera: THREE.Camera, size: { width: number; height: number }, dt: number, v2On: boolean) {
  const cam = camera as THREE.PerspectiveCamera;
  // A size-fixed sprite's height on screen, in pixels, per unit of scale.
  const pxPerUnit = (size.height / 2) * cam.projectionMatrix.elements[5];
  const placed: [number, number, number, number][] = [];
  for (const k of TAG_ORDER) {
    const l = labels[k];
    tagAt.copy(l.position).project(camera);
    const w = l.scale.x * pxPerUnit * (l.userData.textW as number), h = l.scale.y * pxPerUnit * 0.7;
    // The tag's box: the sprite is anchored at `center`, and its text is centred in it.
    const cx = ((tagAt.x + 1) / 2) * size.width + (0.5 - l.center.x) * l.scale.x * pxPerUnit;
    const cy = ((1 - tagAt.y) / 2) * size.height - (0.5 - l.center.y) * l.scale.y * pxPerUnit;
    const box: [number, number, number, number] = [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2];
    const onScreen = tagAt.z < 1 && (k !== "voyager2" || v2On);
    const clear = onScreen && !placed.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1]);
    if (clear) placed.push(box);
    l.userData.shown = THREE.MathUtils.clamp((l.userData.shown as number) + (clear ? dt : -dt) * 4, 0, 1);
  }
}

// A globe lit from the Sun's actual direction (the stop's own light shines straight down, which would be wrong here).
function globeMaterial(map: THREE.Texture, sun: { value: THREE.Vector3 }, alpha: { value: number }) {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: map }, uSun: sun, uAlpha: alpha },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vW; varying vec2 vUv;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vUv = uv;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map; uniform vec3 uSun; uniform float uAlpha;
      varying vec3 vN; varying vec3 vW; varying vec2 vUv;
      void main() {
        float d = max(dot(normalize(vN), normalize(uSun - vW)), 0.0);
        gl_FragColor = vec4(texture2D(map, vUv).rgb * (0.1 + 0.9 * d), uAlpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true,
  });
}

function build(track: Track) {
  const N = track.t.length;
  const sunU = { value: new THREE.Vector3() },
    alphaU = { value: 0 };
  const sys = new THREE.Group(); // in AU, moved and scaled each frame so Voyager sits at the middle
  // Each planet's orbit, from the first full lap of its own Horizons positions.
  const orbit = (a: number[], period: number, color: string) => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < N - 1 && track.t[i] - track.t[0] < period; i++) for (let k = 0; k < 4; k++) pts.push(at(a, i, k / 4, new THREE.Vector3()));
    return line(pts, color, 0.35, true);
  };
  const orbits = [orbit(track.earth, 365.25, "#5f8fd0"), orbit(track.jupiter, 4332.6, "#b59a74"), orbit(track.saturn, 10759.2, "#b5a681")];
  // The trail: every sample Voyager has passed, plus a short piece from the last one to where it is now.
  const trail = line(
    Array.from({ length: N }, (_, i) => put(track.voyager1, i, new THREE.Vector3())),
    "#9fd8ff",
    0.9,
  );
  const head = line([new THREE.Vector3(), new THREE.Vector3()], "#9fd8ff", 0.9);
  for (const l of [trail, head]) {
    l.material.depthTest = false; // drawn over the (enlarged) planets it skims past
    l.renderOrder = 1000;
    l.frustumCulled = false;
  }
  const jupiter = new THREE.Mesh(new THREE.SphereGeometry(R_JUP, 64, 32), globeMaterial(jupiterTexture(), sunU, alphaU));
  jupiter.scale.y = 0.935;
  const saturn = new THREE.Group();
  const satBody = new THREE.Mesh(new THREE.SphereGeometry(R_SAT, 64, 32), globeMaterial(saturnTexture(), sunU, alphaU));
  satBody.scale.y = 0.902;
  const ringGeo = new THREE.RingGeometry(R_SAT * RING_INNER, R_SAT * RING_OUTER, 128, 1);
  const p = ringGeo.attributes.position,
    uv = ringGeo.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (Math.hypot(p.getX(i), p.getY(i)) / R_SAT - RING_INNER) / (RING_OUTER - RING_INNER), 0.5);
  const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ map: ringTexture(), transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  saturn.add(satBody, ring);
  saturn.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), SATURN_POLE);
  sys.add(...orbits, trail, head, jupiter, saturn);

  // Screen-sized glows and name tags (outside the scaled group, so they keep their size at any zoom).
  const glow = (color: string, hideInside: boolean) => {
    const s = glowSprite(color);
    s.material.sizeAttenuation = false;
    s.material.depthTest = hideInside; // a planet's glow hides inside its globe once you are close enough to see it
    if (hideInside) s.renderOrder = 0;
    return s;
  };
  const glows = { sun: glow("#fff1c8", false), earth: glow("#6fa8ff", true), jupiter: glow("#e8c99a", true), saturn: glow("#e6d3a0", true), voyager: glow("#9fd8ff", false), voyager2: glow("#9fd8ff", false) };
  const labels = { sun: label("Sun", [0.5, 1.6]), earth: label("Earth"), jupiter: label("Jupiter"), saturn: label("Saturn"), voyager: label("Voyager 1", [-0.08, 0.5]), voyager2: label("Voyager 2", [-0.08, 0.5]) };
  const root = new THREE.Group();
  root.add(sys, ...Object.values(glows), ...Object.values(labels));

  // The live readout, shown in the caption box under "Back in time".
  const readout = document.createElement("p");
  readout.setAttribute("aria-hidden", "true");
  readout.style.cssText = "grid-column:1/-1;margin:0;color:var(--ink);font:500 0.75rem/1.5 var(--mono);letter-spacing:0.04em";
  const now = document.createElement("span");
  const note = document.createElement("span");
  note.style.opacity = "0.6";
  note.textContent = "Distances to scale. The Sun and planets are drawn much bigger than real.";
  readout.append(now, document.createElement("br"), note);
  return { track, root, sys, sunU, alphaU, orbits, trail, head, jupiter, saturn, ring, glows, labels, readout, now };
}

export function Voyager1Replay({ stop }: { stop: Stop; ground?: (x: number, z: number) => number }) {
  const track = use(loadTrack());
  return track ? <Trip stop={stop} track={track} /> : <NoTrack stop={stop} />;
}

// Without the trajectory there is nothing to replay: hand straight back to the site.
function NoTrack({ stop }: { stop: Stop }) {
  const on = useStore(tour, (s) => s.replay);
  useEffect(() => {
    if (on) endReplay(stop.id);
  }, [on, stop.id]);
  return null;
}

function Trip({ stop, track }: { stop: Stop; track: Track }) {
  const on = useStore(tour, (s) => s.replay);
  const scene = useMemo(() => build(track), [track]);
  useEffect(
    () => () => {
      // Only what build() made: the planet textures are shared (textures.ts caches them), so they stay.
      scene.root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry && !(o as THREE.Sprite).isSprite) m.geometry.dispose();
        if (m.material && !(o as THREE.Sprite).isSprite) (m.material as THREE.Material).dispose();
      });
      for (const s of Object.values(scene.glows)) disposeSprite(s);
      for (const s of Object.values(scene.labels)) disposeSprite(s);
      live.hideMachine = false;
      live.replayLook = null;
      live.replayView = null;
    },
    [scene],
  );

  const t0 = useRef(-1);
  const shown = useRef({ text: "", at: -1 });
  const gentle = useRef(false);
  const view = useRef({ pos: [0, 0, 0] as [number, number, number], look: [0, 0, 0] as [number, number, number] });
  useEffect(() => {
    if (!on) return;
    t0.current = -1;
    gentle.current = reducedMotion();
    return () => {
      shown.current = { text: "", at: -1 };
      scene.readout.remove();
      live.replayLook = null;
      live.replayView = null;
      setCaption("", 0);
    };
  }, [on, scene]);

  const v = useMemo(() => {
    const n = () => new THREE.Vector3();
    return { craft: n(), w: n(), a: n(), b: n(), out: n(), ahead: n(), sunW: n(), jupW: n(), satW: n(), earthW: n(), v2W: n() };
  }, []);
  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const s = tour.get();
    const t = on && t0.current >= 0 ? storyTime(replayClock() - t0.current) : -1;
    live.hideMachine = (on || !s.revealed.includes(stop.id)) && t < SWAP;
    scene.root.visible = on && t >= 0;
    if (!on) return;
    if (s.replayPaused) return; // paused: everything holds still
    if (t0.current < 0) {
      t0.current = replayClock();
      return;
    }
    const { t: T, voyager1, earth, jupiter, saturn, speed } = scene.track;

    // Where everything is on this mission day.
    const D = missionDay(t);
    const [lo, f] = sample(T, D);
    at(voyager1, lo, f, v.craft);
    const pos = (a: number[], d: number, out: THREE.Vector3) => at(a, ...sample(T, d), out);

    // The camera beat, and the zoom (blended in log steps, so zooming feels even).
    let S = Math.log(BEATS[0].S),
      cam = [...BEATS[0].cam],
      look = [BEATS[0].sun, BEATS[0].jup, BEATS[0].sat, BEATS[0].v2 ?? 0],
      glowSize = BEATS[0].glow;
    for (const b of BEATS.slice(1)) {
      const k = smooth(b.at, b.at + EASE, t);
      S += (Math.log(b.S) - S) * k;
      cam = cam.map((c, i) => c + (b.cam[i] - c) * k);
      look = [look[0] + (b.sun - look[0]) * k, look[1] + (b.jup - look[1]) * k, look[2] + (b.sat - look[2]) * k, look[3] + ((b.v2 ?? 0) - look[3]) * k];
      glowSize += (b.glow - glowSize) * k;
    }
    S = Math.exp(S);
    scene.sys.scale.setScalar(S);
    scene.sys.position.copy(v.craft).multiplyScalar(-S);
    const world = (p: THREE.Vector3, out: THREE.Vector3) => out.copy(p).sub(v.craft).multiplyScalar(S);

    // Trail up to the last sample passed, then a short piece to here.
    scene.trail.geometry.setDrawRange(0, lo + 1);
    const hp = scene.head.geometry.attributes.position as THREE.BufferAttribute;
    put(voyager1, lo, v.a);
    hp.setXYZ(0, v.a.x, v.a.y, v.a.z);
    hp.setXYZ(1, v.craft.x, v.craft.y, v.craft.z);
    hp.needsUpdate = true;

    // Sun, planets, their glows and tags.
    const { glows, labels } = scene;
    const sunW = world(v.a.set(0, 0, 0), v.sunW);
    scene.sunU.value.copy(sunW);
    glows.sun.position.copy(sunW);
    labels.sun.position.copy(sunW);
    const jupW = world(at(jupiter, lo, f, scene.jupiter.position), v.jupW);
    const satW = world(at(saturn, lo, f, scene.saturn.position), v.satW);
    const earthW = world(at(earth, lo, f, v.b), v.earthW);
    glows.jupiter.position.copy(jupW);
    labels.jupiter.position.copy(jupW);
    glows.saturn.position.copy(satW);
    labels.saturn.position.copy(satW);
    glows.earth.position.copy(earthW);
    labels.earth.position.copy(earthW);
    // Voyager 2, where it really is relative to Voyager 1 on this day (once it has left the planets behind).
    const v2W = world(v.b.copy(V2_NOW).setLength(Math.max(1, V2_NOW.length() - (TODAY - D) * V2_AU_PER_DAY)), v.v2W);
    glows.voyager2.position.copy(v2W);
    labels.voyager2.position.copy(v2W);

    // Fade in, and out again as the real Voyager takes over.
    const alpha = smooth(0, 1, t) * (1 - smooth(REVEAL - 1.5, REVEAL, t));
    scene.alphaU.value = alpha;
    (scene.ring.material as THREE.Material).opacity = alpha;
    for (const o of scene.orbits) o.material.opacity = 0.35 * alpha;
    scene.trail.material.opacity = scene.head.material.opacity = 0.9 * alpha;
    const twinkle = gentle.current ? 1 : 0.85 + 0.15 * Math.sin(t * 4);
    glows.sun.material.opacity = alpha;
    glows.sun.scale.setScalar(glowSize * 1.6);
    for (const k of ["earth", "jupiter", "saturn"] as const) {
      glows[k].material.opacity = alpha;
      glows[k].scale.setScalar(k === "earth" ? 0.022 : 0.026);
    }
    glows.voyager.material.opacity = alpha * twinkle;
    glows.voyager.scale.setScalar(0.04);
    const v2a = alpha * smooth(V2_FROM, V2_FROM + 400, D);
    glows.voyager2.material.opacity = v2a * twinkle;
    glows.voyager2.scale.setScalar(0.032);
    // Name tags that would overlap one already placed fade out (zoomed far out, the Sun, Earth, Jupiter and Saturn
    // bunch up in one spot; at a flyby, the planet's tag sits on Voyager's).
    declutter(labels, state.camera, state.size, dt, labels.voyager2 && v2a > 0.05);
    for (const [k, l] of Object.entries(labels)) l.material.opacity = (k === "voyager2" ? v2a : alpha) * 0.9 * (l.userData.shown as number);

    // The camera, in a frame that turns with Voyager.
    // Its direction of travel: a chord across 60 days, so the camera doesn't whip round at a flyby.
    pos(voyager1, D + 30, v.ahead).sub(pos(voyager1, D - 30, v.out)).setY(0).normalize();
    v.out.set(0, 1, 0).cross(v.ahead); // side
    const vw = view.current;
    if (t < SWAP) {
      v.w.copy(v.ahead).multiplyScalar(cam[0]).addScaledVector(v.out, cam[2]);
      v.w.y += cam[1];
      v.w.addScaledVector(v.b.copy(sunW).normalize(), -cam[3]);
      vw.pos = [v.w.x, v.w.y, v.w.z];
      v.w.copy(sunW).multiplyScalar(look[0]).addScaledVector(jupW, look[1]).addScaledVector(satW, look[2]).addScaledVector(v2W, look[3]);
      // Aim no further than a few units from Voyager, so it stays in the picture while the view swings round.
      if (v.w.length() > 6) v.w.setLength(6);
      vw.look = [v.w.x, v.w.y, v.w.z];
      live.replayView = vw;
    } else live.replayView = V_NOW;
    live.replayLook = null;

    // Readout: the date, how far from the Sun, how fast (relative to the Sun, from Horizons).
    if (!scene.readout.isConnected && hud.replayLine?.parentElement) hud.replayLine.parentElement.insertBefore(scene.readout, hud.replayLine);
    const r = v.craft.length() * AU_KM;
    const far = r < 1e9 ? `${Math.round(r / 1e6)} million km` : `${(r / 1e9).toFixed(1)} billion km`;
    const kms = speed[lo] + (speed[lo + 1] - speed[lo]) * f;
    const text = `${dateOf(D)} · ${far} from the Sun · ${kms.toFixed(1)} km/s`;
    if (scene.now.textContent !== text) scene.now.textContent = text;

    caption(CUES, t, END, shown.current);
    // Only end our own replay: if you jump away mid-replay, endReplay would mark the stop you are going to.
    if (t >= END && s.stop === STOP_INDEX[stop.id]) endReplay();
  });

  return <primitive object={scene.root} />;
}
