import * as THREE from "three";
import { DEG, latLon } from "../tour/lib/geo";
import { createStore } from "../tour/lib/store";

// One atlas record (public/data/moon.json, mars.json, deepspace.json), with the file it came from.
export type Machine = {
  id: string;
  name: string;
  mission?: string;
  body?: string;
  type?: string;
  lat?: number | null;
  lon?: number | null;
  distance_au?: number | null;
  ecl_lon?: number | null;
  ecl_lat?: number | null;
  status?: string;
  lastContact?: string | null;
  ended?: string | null;
  world: "moon" | "mars" | "deep";
};

export type Status = "alive" | "echo" | "silent";
// The atlas's colours and words (app/atlas/atlas.css --signal, --echo, --quiet; its legend).
export const STATUS_COLOR: Record<Status, string> = { alive: "#d9814a", echo: "#5ea6d6", silent: "#a8937f" };
export const STATUS_LABEL: Record<Status, string> = { alive: "Still sending data", echo: "Silent mirror, still used", silent: "Gone quiet" };
const RANK: Record<Status, number> = { alive: 2, echo: 1, silent: 0 };

const yr = (s?: string | null) => (s ? +s.slice(0, 4) : null);
// The atlas's rule (engine.js stateAt) for today.
export function statusOf(m: Machine): Status {
  if (/reflector/i.test(m.type ?? "")) return "echo";
  const end = yr(m.lastContact || m.ended);
  if (end) return end >= 2026 ? "alive" : "silent";
  const s = m.status ?? "";
  return /\b(still|active|operational|working|transmitting)\b/i.test(s) && !/inactive|silent|dead|lost|ended/i.test(s) ? "alive" : "silent";
}

// Distance from the Sun on a log scale, like the atlas's deep-space map: Mercury ~95 units out, Neptune ~690,
// the heliopause ~880, Voyager 1 ~930. Real distances would leave every planet an invisible speck.
export const auR = (au: number) => 60 + (900 * Math.log10(Math.max(au, 0.3) / 0.3)) / Math.log10(220 / 0.3);
export function helio(au: number, lonDeg: number, latDeg = 0, out = new THREE.Vector3()) {
  const r = auR(au), l = lonDeg * DEG, b = latDeg * DEG;
  return out.set(r * Math.cos(b) * Math.cos(l), r * Math.sin(b), -r * Math.cos(b) * Math.sin(l));
}
export const HELIOPAUSE_AU = 121.6; // where Voyager 1 crossed it in 2012
export const Y = new THREE.Vector3(0, 1, 0);

export type BodyKey = "sun" | "mercury" | "venus" | "earth" | "moon" | "mars" | "jupiter" | "saturn" | "uranus" | "neptune" | "pluto" | "ceres" | "eros" | "tempel1" | "dimorphos";
// `face`: the average direction of its landing sites, so the camera arrives over the side with the machines.
// `frame`: radius that takes in the world and every machine around it (orbit view framing).
export type Body = { key: BodyKey; name: string; r: number; pos: THREE.Vector3; rotY: number; small: boolean; count: number; face?: THREE.Vector3; frame?: number };

// a (AU), mean longitude at J2000 (deg), deg/day, and the enlarged radius drawn here (Earth = 1).
// Earth, the Moon, Mars and Saturn keep the tour's own sizes (app/tour/scene/Space.tsx BODY_RADIUS).
const PLANETS: [BodyKey, string, number, number, number, number][] = [
  ["mercury", "Mercury", 0.387, 252.25, 4.09233, 0.42],
  ["venus", "Venus", 0.723, 181.98, 1.60213, 0.95],
  ["earth", "Earth", 1, 100.46, 0.98561, 1],
  ["mars", "Mars", 1.524, 355.45, 0.52403, 0.75],
  ["jupiter", "Jupiter", 5.203, 34.4, 0.08309, 3.2],
  ["saturn", "Saturn", 9.537, 49.94, 0.03346, 2.6],
  ["uranus", "Uranus", 19.19, 313.23, 0.01173, 1.7],
  ["neptune", "Neptune", 30.07, 304.88, 0.00598, 1.65],
];
// Small worlds a machine visited: size drawn here, and the machine whose (JPL Horizons) position places them.
const SMALL: [BodyKey, string, number, string][] = [
  ["ceres", "Ceres", 0.2, "dawn"],
  ["eros", "Eros", 0.08, "near_shoemaker"],
  ["tempel1", "Comet Tempel 1", 0.07, "deep_impact_impactor"],
  ["dimorphos", "Dimorphos", 0.05, "dart"],
];
export const MOON_DIST = 12; // Earth radii here; the real Moon is 60 away, the geostationary ring 6.6.

// Turns a globe about its axis so longitude `lonDeg` faces the horizontal direction `dir`.
const faceDir = (dir: THREE.Vector3, lonDeg: number) => Math.atan2(-dir.z, dir.x) - lonDeg * DEG;

export type Target = {
  key: string; // "b:<body>" or "c:<first machine id>"
  kind: "body" | "site";
  name: string;
  pos: THREE.Vector3;
  r: number; // body radius, or 0 for a site
  host: Body | null;
  normal: THREE.Vector3 | null; // set for sites on a surface
  items: Machine[];
  status: Status;
  where: string;
};

export type World = { bodies: Body[]; targets: Map<string, Target>; sites: Target[]; siteOf: Map<string, string>; machines: Machine[] };

export async function loadWorld(): Promise<World> {
  const get = (f: string) => fetch(`/data/${f}.json`).then((r) => {
    if (!r.ok) throw new Error(`Could not load ${f}.json`);
    return r.json() as Promise<Omit<Machine, "world">[]>;
  });
  const [moon, mars, deep] = await Promise.all([get("moon"), get("mars"), get("deepspace")]);
  const machines: Machine[] = [
    ...moon.map((m) => ({ ...m, world: "moon" as const })),
    ...mars.map((m) => ({ ...m, world: "mars" as const })),
    ...deep.map((m) => ({ ...m, world: "deep" as const })),
  ];
  return buildWorld(machines, new Date());
}

const num = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

export function buildWorld(machines: Machine[], now: Date): World {
  const days = (now.getTime() - Date.parse("2000-01-01T12:00Z")) / 864e5;
  const byId = new Map(machines.map((m) => [m.id, m]));
  const hostKey = (m: Machine): BodyKey | null => {
    if (m.world !== "deep") return m.world;
    const b = String(m.body ?? "").toLowerCase();
    return PLANETS.some((p) => p[0] === b) || SMALL.some((s) => s[0] === b) ? (b as BodyKey) : null;
  };
  const bodies: Body[] = [{ key: "sun", name: "The Sun", r: 8, pos: new THREE.Vector3(), rotY: 0, small: false, count: 0 }];
  for (const [key, name, a, L0, rate, r] of PLANETS) {
    // Like the atlas: a real (Horizons) longitude from a machine parked there, else the circular-orbit estimate.
    const hit = machines.find((m) => m.world === "deep" && hostKey(m) === key && num(m.ecl_lon));
    const lon = hit ? hit.ecl_lon! : (((L0 + rate * days) % 360) + 360) % 360;
    bodies.push({ key, name, r, pos: helio(a, lon), rotY: 0, small: false, count: 0 });
  }
  // ponytail: Pluto's place is fixed (about 35 AU, ecliptic longitude ~302 deg in 2026); fine for years.
  bodies.push({ key: "pluto", name: "Pluto", r: 0.3, pos: helio(35.3, 302, -3), rotY: 0, small: false, count: 0 });
  for (const [key, name, r, via] of SMALL) {
    const m = byId.get(via);
    if (m && num(m.distance_au) && num(m.ecl_lon)) bodies.push({ key, name, r, pos: helio(m.distance_au, m.ecl_lon, m.ecl_lat ?? 0), rotY: 0, small: true, count: 0 });
  }
  const body = (k: BodyKey) => bodies.find((b) => b.key === k)!;
  const earth = body("earth"), mars = body("mars");

  // The Moon sits a little past Earth on the night side, so the near side (and every Apollo site) faces the
  // Sun and Earth together: a nearly full Moon, with the Sun ~25 deg east of the sub-Earth point.
  const toSun = earth.pos.clone().negate().normalize();
  const side = new THREE.Vector3().crossVectors(toSun, Y).normalize();
  const moonDir = toSun.clone().multiplyScalar(-Math.cos(25 * DEG)).addScaledVector(side, -Math.sin(25 * DEG)).normalize();
  const moonPos = earth.pos.clone().addScaledVector(moonDir, MOON_DIST);
  bodies.splice(4, 0, { key: "moon", name: "The Moon", r: 0.6, pos: moonPos, rotY: faceDir(moonDir.clone().negate(), 0), small: false, count: 0 });
  // Mars is turned so Jezero, Gale, InSight and Opportunity are in daylight.
  mars.rotY = faceDir(mars.pos.clone().negate(), 60);

  // Machines: on a surface at their lat/lon, in a little ring around the world they orbit (or fell into),
  // or out in space at their real distance and ecliptic longitude.
  const sites: Target[] = [];
  const ring = new Map<BodyKey, Machine[]>();
  for (const m of machines) {
    const h = hostKey(m);
    if (h && (h === "moon" || h === "mars") && num(m.lat) && num(m.lon)) {
      const b = body(h);
      const n = latLon(m.lat, m.lon, 1).applyAxisAngle(Y, b.rotY);
      // Crowded landing sites (an Apollo LM, its rover, ALSEP and mirror) share one marker: within ~0.5 deg.
      const near = sites.find((s) => s.host === b && s.normal!.angleTo(n) < 0.5 * DEG);
      if (near) near.items.push(m);
      else sites.push({ key: `c:${m.id}`, kind: "site", name: "", pos: b.pos.clone().addScaledVector(n, b.r * 1.004), r: 0, host: b, normal: n, items: [m], status: "silent", where: h === "moon" ? "On the Moon" : "On Mars" });
    } else if (h) {
      const list = ring.get(h) ?? [];
      list.push(m);
      ring.set(h, list);
    } else {
      // ponytail: Stardust has no position in the data; it circles the Sun between ~1 and 2.7 AU, so put it at 1.8.
      const au = num(m.distance_au) ? m.distance_au : 1.8;
      const lon = num(m.ecl_lon) ? m.ecl_lon : 200;
      sites.push({ key: `c:${m.id}`, kind: "site", name: "", pos: helio(au, lon, m.ecl_lat ?? 0), r: 0, host: null, normal: null, items: [m], status: "silent", where: `In deep space, ${au < 10 ? au.toFixed(1) : Math.round(au)} AU from the Sun` });
    }
  }
  for (const [h, list] of ring) {
    const b = body(h);
    // Clear of the sphere, and of Saturn's rings (out to 2.34 Saturn radii).
    const rr = b.r * (h === "saturn" ? 2.7 : 1.9) + 0.3;
    list.forEach((m, j) => {
      const a = (j / list.length) * Math.PI * 2 + 0.6;
      const pos = b.pos.clone().add(new THREE.Vector3(Math.cos(a) * rr, 0.18 * rr, -Math.sin(a) * rr));
      sites.push({ key: `c:${m.id}`, kind: "site", name: "", pos, r: 0, host: b, normal: null, items: [m], status: "silent", where: `At ${b.name.replace(/^The /, "the ")}` });
    });
  }
  const siteOf = new Map<string, string>();
  for (const s of sites) {
    s.status = s.items.reduce<Status>((best, m) => (RANK[statusOf(m)] > RANK[best] ? statusOf(m) : best), "silent");
    const missions = new Set(s.items.map((m) => m.mission));
    s.name = s.items.length === 1 ? s.items[0].name : missions.size === 1 && s.items[0].mission ? `${s.items[0].mission} site` : `${s.items[0].name} and ${s.items.length - 1} more`;
    for (const m of s.items) siteOf.set(m.id, s.key);
    if (s.host) s.host.count += s.items.length;
    if (s.host && s.normal) s.host.face = (s.host.face ?? new THREE.Vector3()).addScaledVector(s.normal, s.items.length);
    if (s.host) s.host.frame = Math.max(s.host.frame ?? s.host.r, s.pos.distanceTo(s.host.pos));
  }
  const targets = new Map<string, Target>();
  for (const b of bodies) targets.set(`b:${b.key}`, { key: `b:${b.key}`, kind: "body", name: b.name, pos: b.pos, r: b.r, host: b, normal: null, items: [], status: "silent", where: "" });
  for (const s of sites) targets.set(s.key, s);
  return { bodies, targets, sites, siteOf, machines };
}

// Where to park the camera to look at a target: sunlit, a little above, close enough to read its card.
export function viewFor(t: Target) {
  const look = t.pos.clone();
  const toSun = look.lengthSq() > 1e-6 ? look.clone().negate().normalize() : new THREE.Vector3(0.3, 0.2, 1).normalize();
  const side = new THREE.Vector3().crossVectors(toSun, Y).normalize();
  let u: THREE.Vector3, d: number;
  if (t.normal) {
    const east = new THREE.Vector3().crossVectors(Y, t.normal);
    if (east.lengthSq() < 1e-4) east.set(1, 0, 0);
    u = t.normal.clone().multiplyScalar(0.75).addScaledVector(east.normalize(), 0.65).normalize();
    d = t.host!.r * 0.32;
  } else if (t.kind === "body") {
    const face = t.host!.face?.clone().normalize();
    u = t.host!.key === "sun" ? toSun : face ? face.multiplyScalar(0.85).addScaledVector(toSun, 0.3).addScaledVector(Y, 0.12).normalize() : toSun.clone().multiplyScalar(0.75).addScaledVector(Y, 0.28).addScaledVector(side, 0.6).normalize();
    d = Math.max(t.r * (t.host!.key === "saturn" ? 3.6 : t.host!.small ? 6 : 3.2), (t.host!.frame ?? 0) * 2.2);
  } else {
    u = toSun.clone().multiplyScalar(0.6).addScaledVector(Y, 0.3).addScaledVector(side, 0.75).normalize();
    d = 1.4;
  }
  return { look, pos: look.clone().addScaledVector(u, d) };
}

// How close you must be for a site's label and card to appear.
export const labelDist = (t: Target) => (t.normal ? t.host!.r * 0.9 : 30);
export const cardDist = (t: Target) => (t.normal ? t.host!.r * 0.55 : 4);

export type Key = "fwd" | "back" | "left" | "right" | "up" | "down" | "boost";

// Per-frame state shared by the scene and the overlay, kept out of React.
export const fly = {
  keys: new Set<Key>(),
  pointer: { x: 0, y: 0, on: false },
  hovered: null as string | null,
  labels: new Map<string, HTMLElement>(),
  hud: { speed: null as HTMLElement | null, zoom: null as HTMLElement | null, nearBody: null as HTMLElement | null, nearMachine: null as HTMLElement | null, minimap: null as HTMLCanvasElement | null },
  // Set by Flight.tsx: zoom in (f < 1) or out.
  zoomBy: ((f: number) => void f) as (f: number) => void,
};

// public/data/earth-orbit.json: ESA Space Debris Office counts of what's around Earth.
export type EarthOrbit = {
  asOf: string;
  source: { label: string; url: string; credit: string };
  tracked: number;
  satellitesWorking: number;
  satellitesDead: number;
  trackedNotWorking: number;
  fragmentationEvents: number;
  modelled: { from1to10cm: number };
  shells: { name: string; altitudeKm: string; note: string }[];
  kidLines: string[];
};
export const loadEarthOrbit = () =>
  fetch("/data/earth-orbit.json")
    .then((r) => (r.ok ? (r.json() as Promise<EarthOrbit>) : null))
    .catch(() => null);

export const ui = createStore({
  card: null as string | null, // the site you're next to
  nearEarth: false,
  debris: false, // the Earth's orbit card was opened by clicking the junk around Earth
  locked: false,
  orbit: null as BodyKey | null, // the world you're circling in orbit view
  go: null as null | { key: string; n: number }, // an auto-flight request
});
let goN = 0;
export const flyTo = (key: string) => ui.set({ go: { key, n: ++goN } });
