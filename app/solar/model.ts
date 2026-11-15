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
  arrived?: string | null;
  launched?: string | null;
  world:"moon" | "mars" | "deep";
};

export type Status = "alive" | "echo" | "silent";
// The atlas's colours and words (app/atlas/atlas.css --signal, --echo, --quiet; its legend).
export const STATUS_COLOR: Record<Status, string> = { alive: "#4d94ff", echo: "#e5e5e5", silent: "#6b6b6b" };
export const STATUS_LABEL: Record<Status, string> = { alive: "Still sending data", echo: "Silent mirror, still used", silent: "Gone quiet" };
const RANK: Record<Status, number> = { alive: 2, echo: 1, silent: 0 };

const yr = (s?: string | null) => (s ? +s.slice(0, 4) : null);
// The atlas's rule (engine.js stateAt) for year `Y` (default: this year).
export function statusOf(m: Machine, Y = THIS_YEAR): Status {
  if (/reflector/i.test(m.type ?? "")) return "echo";
  const end = yr(m.lastContact || m.ended);
  if (end) return end >= Y ? "alive" : "silent";
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
// Its inverse (scene radius to AU), for the distance readout.
export const rAu = (r: number) => (r <= 60 ? (0.3 * r) / 60 : 0.3 * Math.pow(220 / 0.3, (r - 60) / 900));
// A heliocentric J2000 ecliptic position in AU (x to the equinox, z to ecliptic north) on the map, like helio().
export function eclToScene(x: number, y: number, z: number, out = new THREE.Vector3()) {
  const r = Math.hypot(x, y, z), k = r > 1e-9 ? auR(r) / r : 0;
  return out.set(x * k, z * k, -y * k);
}
export const HELIOPAUSE_AU = 121.6; // where Voyager 1 crossed it in 2012
export const Y = new THREE.Vector3(0, 1, 0);

export type BodyKey = "sun" | "mercury" | "venus" | "earth" | "moon" | "mars" | "jupiter" | "saturn" | "uranus" | "neptune" | "pluto" | "ceres" | "eros" | "tempel1" | "dimorphos";
// `face`: the average direction of its landing sites, so the camera arrives over the side with the machines.
// `frame`: radius that takes in the world and every machine around it (orbit view framing).
export type Body = { key: BodyKey; name: string; r: number; pos: THREE.Vector3; rotY: number; small: boolean; count: number; face?: THREE.Vector3; frame?: number };

// The enlarged radius drawn here (Earth = 1), then JPL's Keplerian elements and their rates per century (a AU, e,
// I deg, L deg, long. of perihelion deg, long. of node deg) from "Approximate Positions of the Planets", Table 1, valid
// 1800-2050 (https://ssd.jpl.nasa.gov/planets/approx_pos.html). Earth is the Earth-Moon barycentre; Pluto's are from
// the earlier edition of that table. Checked against Horizons for 1965, 1979 and 2026: within 0.008 AU.
// Earth, the Moon, Mars and Saturn keep the tour's own sizes (app/tour/scene/Space.tsx BODY_RADIUS).
type Elements = number[];
const PLANETS: [BodyKey, string, number, Elements][] = [
  ["mercury", "Mercury", 0.42, [0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593, 0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081]],
  ["venus", "Venus", 0.95, [0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255, 0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418]],
  ["earth", "Earth", 1, [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0, 0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0]],
  ["mars", "Mars", 0.75, [1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891, 0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343]],
  ["jupiter", "Jupiter", 3.2, [5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909, -0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106]],
  ["saturn", "Saturn", 2.6, [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448, -0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794]],
  ["uranus", "Uranus", 1.7, [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.9542763, 74.01692503, -0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589]],
  ["neptune", "Neptune", 1.65, [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574, 0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664]],
  ["pluto", "Pluto", 0.3, [39.48211675, 0.2488273, 17.14001206, 238.92903833, 224.06891629, 110.30393684, -0.00031596, 0.0000517, 0.00004818, 145.20780515, -0.04062942, -0.01183482]],
];
// Days since J2000.0 (2000-01-01 12:00), the time scale of the elements and of public/data/trajectories.json.
export const j2000Days = (ms: number) => (ms - Date.UTC(2000, 0, 1, 12)) / 864e5;
// Heliocentric ecliptic position (AU) on the date, by JPL's recipe (Kepler's equation by Newton's method).
function kepler(el: Elements, days: number): [number, number, number] {
  const T = days / 36525;
  const [a, e, I, L, peri, node] = el.slice(0, 6).map((x, k) => x + el[k + 6] * T);
  const M = (((((L - peri + 180) % 360) + 360) % 360) - 180) * DEG;
  let E = M + e * Math.sin(M);
  for (let k = 0; k < 8; k++) E += (M - (E - e * Math.sin(E))) / (1 - e * Math.cos(E));
  const xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const w = (peri - node) * DEG, O = node * DEG, i = I * DEG;
  const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(O), sO = Math.sin(O), ci = Math.cos(i), si = Math.sin(i);
  return [(cw * cO - sw * sO * ci) * xp + (-sw * cO - cw * sO * ci) * yp, (cw * sO + sw * cO * ci) * xp + (-sw * sO + cw * cO * ci) * yp, sw * si * xp + cw * si * yp];
}

// public/data/trajectories.json: real paths from JPL Horizons, [days since J2000, x, y, z (AU)] per point.
export type Track = { name: string; points: [number, number, number, number][] };
export type Tracks = Record<string, Track>;
export const loadTracks = () =>
  fetch("/data/trajectories.json")
    .then((r) => (r.ok ? (r.json() as Promise<{ craft: Tracks }>) : null))
    .then((j) => j?.craft ?? {})
    .catch(() => ({}) as Tracks);
// Where the spacecraft was on the date (AU), straight between the samples; held at the ends.
export function trackAt(t: Track, days: number): [number, number, number] {
  const p = t.points;
  let lo = 0, hi = p.length - 1;
  if (days <= p[0][0]) return [p[0][1], p[0][2], p[0][3]];
  if (days >= p[hi][0]) return [p[hi][1], p[hi][2], p[hi][3]];
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (p[mid][0] <= days) lo = mid;
    else hi = mid;
  }
  const f = (days - p[lo][0]) / (p[hi][0] - p[lo][0]);
  return [p[lo][1] + (p[hi][1] - p[lo][1]) * f, p[lo][2] + (p[hi][2] - p[lo][2]) * f, p[lo][3] + (p[hi][3] - p[lo][3]) * f];
}

// When each space object appears on the timeline: its landing or arrival, else its launch. The atlas data has no
// arrival dates for the ones at other worlds, so here they are (orbit insertion, landing or impact).
const ARRIVED: Record<string, string> = {
  juno: "2016-07-05", galileo: "1995-12-08", galileo_probe: "1995-12-07", cassini: "2004-07-01", messenger: "2011-03-18",
  magellan: "1990-08-10", pioneer_venus_orbiter: "1978-12-04", pioneer_venus_large_probe: "1978-12-09", pioneer_venus_small_probes: "1978-12-09",
  dawn: "2015-03-06", near_shoemaker: "2000-02-14", deep_impact_impactor: "2005-07-04", dart: "2022-09-26",
};
export const bornOf = (m: Machine) => ARRIVED[m.id] ?? m.arrived ?? m.launched ?? "";
// Small worlds a machine visited: size drawn here, and the machine whose (JPL Horizons) position places them.
const SMALL: [BodyKey, string, number, string][] = [
  ["ceres", "Ceres", 0.2, "dawn"],
  ["eros", "Eros", 0.08, "near_shoemaker"],
  ["tempel1", "Comet Tempel 1", 0.07, "deep_impact_impactor"],
  ["dimorphos", "Dimorphos", 0.05, "dart"],
];
export const MOON_DIST = 12; // Earth radii here; the real Moon is 60 away, the geostationary ring 6.6.
export const THIS_YEAR = new Date().getUTCFullYear();

// How far a point on the map is from Earth, in real km. Near Earth the map is in Earth radii (Earth = 1, the satellite
// shells true to scale, the Moon squeezed in at 12 instead of 60); farther out it is the log-scale map of distance from
// the Sun, which rAu undoes exactly. Between the Moon and 60 units the two scales disagree, so the readout blends them
// (in log space, so it only grows as you fly away).
const KM_AU = 149597870.7, GEO = 6.62, OFF_MAP_AU = 300;
const a1 = new THREE.Vector3(), a2 = new THREE.Vector3();
const toAu = (p: THREE.Vector3, out: THREE.Vector3) => {
  const r = p.length();
  return out.copy(p).multiplyScalar(r > 1e-9 ? rAu(r) / r : 0);
};
export function kmFromEarth(p: THREE.Vector3, earth: THREE.Vector3) {
  const d = p.distanceTo(earth);
  // Height above the ground out to the geostationary ring (35,786 km up), then on to the Moon (384,400 km).
  const near = d <= GEO ? Math.max(0, d - 1) * 6371 : d <= MOON_DIST ? 35786 * Math.pow(384400 / 35786, (d - GEO) / (MOON_DIST - GEO)) : (384400 * d) / MOON_DIST;
  if (d <= MOON_DIST) return near;
  const far = Math.max(near, toAu(p, a1).distanceTo(toAu(earth, a2)) * KM_AU);
  const w = THREE.MathUtils.smoothstep(d, MOON_DIST, 60);
  return Math.exp((1 - w) * Math.log(near) + w * Math.log(far));
}
// "1.4 billion km · 9.5 AU · 79 light-minutes"
export function distanceText(km: number) {
  const n = (x: number) => x.toLocaleString("en-US", { maximumFractionDigits: x < 10 ? 1 : 0 });
  const big = km < 1e6 ? `${km.toLocaleString("en-US", { maximumSignificantDigits: 4 })} km` : km < 1e9 ? `${n(km / 1e6)} million km` : `${n(km / 1e9)} billion km`;
  const au = km / KM_AU;
  if (au < 0.05) return big;
  // Past Voyager 1 (~170 AU) the log scale runs away (the overhead view would be ~7 million AU): nothing real out there.
  if (au > OFF_MAP_AU) return `Over ${n((OFF_MAP_AU * KM_AU) / 1e9)} billion km · off the edge of this map`;
  const s = au * 499.005; // light crosses 1 AU in 499 s
  const light = s < 90 ? `${Math.round(s)} light-seconds` : s < 5400 ? `${Math.round(s / 60)} light-minutes` : `${n(s / 3600)} light-hours`;
  return `${big} · ${n(au)} AU · ${light}`;
}

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

export async function loadMachines(): Promise<Machine[]> {
  const get = (f: string) => fetch(`/data/${f}.json`).then((r) => {
    if (!r.ok) throw new Error(`Could not load ${f}.json`);
    return r.json() as Promise<Omit<Machine, "world">[]>;
  });
  const [moon, mars, deep] = await Promise.all([get("moon"), get("mars"), get("deepspace")]);
  return [
    ...moon.map((m) => ({ ...m, world: "moon" as const })),
    ...mars.map((m) => ({ ...m, world: "mars" as const })),
    ...deep.map((m) => ({ ...m, world: "deep" as const })),
  ];
}

const num = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

// The solar system on a date (ms): planets by their elements, spacecraft with a Horizons track along it, and only the
// space objects that had arrived (or launched) by then. `machines` stays the full list (79), for the progress count.
export function buildWorld(all: Machine[], now: number, tracks: Tracks = {}): World {
  const days = j2000Days(now);
  const year = new Date(now).getUTCFullYear();
  const iso = new Date(now).toISOString().slice(0, 10);
  const byId = new Map(all.map((m) => [m.id, m]));
  const machines = all.filter((m) => bornOf(m) <= iso);
  const hostKey = (m: Machine): BodyKey | null => {
    if (m.world !== "deep") return m.world;
    const b = String(m.body ?? "").toLowerCase();
    return PLANETS.some((p) => p[0] === b) || SMALL.some((s) => s[0] === b) ? (b as BodyKey) : null;
  };
  const bodies: Body[] = [{ key: "sun", name: "The Sun", r: 8, pos: new THREE.Vector3(), rotY: 0, small: false, count: 0 }];
  for (const [key, name, r, el] of PLANETS) bodies.push({ key, name, r, pos: eclToScene(...kepler(el, days)), rotY: 0, small: false, count: 0 });
  // ponytail: the small worlds keep today's place (from the machine that visited) at every date; give them elements if the timeline should move them.
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
    } else if (tracks[m.id]) {
      const [x, y, z] = trackAt(tracks[m.id], days), au = Math.hypot(x, y, z);
      sites.push({ key: `c:${m.id}`, kind: "site", name: "", pos: eclToScene(x, y, z), r: 0, host: null, normal: null, items: [m], status: "silent", where: `In deep space, ${au < 10 ? au.toFixed(1) : Math.round(au)} AU from the Sun` });
    } else {
      // The ones circling the Sun with no track keep today's place at every date.
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
    s.status = s.items.reduce<Status>((best, m) => (RANK[statusOf(m, year)] > RANK[best] ? statusOf(m, year) : best), "silent");
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
  return { bodies, targets, sites, siteOf, machines: all };
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
  hud: { dist: null as HTMLElement | null, speed: null as HTMLElement | null, zoom: null as HTMLElement | null, nearBody: null as HTMLElement | null, nearMachine: null as HTMLElement | null, minimap: null as HTMLCanvasElement | null },
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
  orbit: null as string | null, // the target ("b:mars", "c:voyager1") you're circling in orbit view
  go: null as null | { key: string; n: number }, // an auto-flight request
  date: Date.now(), // the timeline (ms): where the planets and spacecraft are drawn
});
let goN = 0;
export const flyTo = (key: string) => ui.set({ go: { key, n: ++goN } });

// Space objects this visitor has opened, shared with the atlas (app/atlas/engine.js SEEN_KEY) and the tour.
// Kept in this browser only; nothing is sent anywhere.
export const SEEN_KEY = "gra-explored";
export function readSeen(): Set<string> {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(SEEN_KEY) || "[]");
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}
// Adds to what's stored (another tab or the atlas may have added some since this page loaded).
export function saveSeen(ids: Iterable<string>) {
  try {
    const all = readSeen();
    for (const id of ids) all.add(id);
    localStorage.setItem(SEEN_KEY, JSON.stringify([...all]));
  } catch {
    /* private mode: progress lasts this visit */
  }
}
