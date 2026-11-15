// Any of the atlas's 79 machines can be opened in the tour (/#<atlas id>), not just the six story stops.
// Its Stop is built at runtime from the atlas record plus its site file (public/data/sites/<id>.json, see
// siteData.ts) and appended to STOPS, after the story stops, so every scene, plan and HUD piece that reads
// STOPS[index] works for it unchanged.
import { DEG, latLon } from "./lib/geo";
import type { SiteFile } from "./siteData";
import type { BodyKey } from "./state";
import { STOPS, type Hotspot, type ModelSpec, type Stop, type Vec3 } from "./stops";
import { CRATERS, loadRealTerrain } from "./scene/terrain";

export type Fate = { category: string; label: string; summary?: string };
export type AtlasRecord = {
  id: string;
  name: string;
  body: string; // "moon", "mars", or what a deep-space machine orbits / hit ("saturn", "eros", "heliocentric"...)
  type?: string;
  mission?: string;
  lat?: number;
  lon?: number;
  arrived?: string;
  launched?: string;
  status?: string;
  summary?: string;
  why?: string;
  story?: string;
  lastWords?: string;
  funFact?: string;
  distance_au?: number | null;
  fate?: Fate;
  source?: string;
};
type ModelInfo = { file: string; title: string; credit?: string; license?: string; size_m?: number; covers?: string[] };

// Without a site file, pick the model whose "covers" names appear in the machine's name (the one ending
// furthest along wins, then the longest: "Perseverance's Backshell" is the backshell, not the rover).
function guessModel(name: string, models: Record<string, ModelInfo>) {
  const n = name.toLowerCase();
  let best: [key: string, end: number, len: number] | null = null;
  for (const [key, m] of Object.entries(models))
    for (const c of m.covers ?? []) {
      const at = n.indexOf(c.toLowerCase());
      if (at < 0) continue;
      const end = at + c.length;
      if (!best || end > best[1] || (end === best[1] && c.length > best[2])) best = [key, end, c.length];
    }
  return best?.[0] ?? null;
}

const json = <T>(url: string, empty: T) =>
  fetch(url)
    .then((r) => (r.ok ? (r.json() as Promise<T>) : empty))
    .catch(() => empty);

let atlasP: Promise<Record<string, AtlasRecord>> | null = null;
export function loadAtlas() {
  atlasP ??= Promise.all(["moon", "mars", "deepspace"].map((w) => json<AtlasRecord[]>(`/data/${w}.json`, []))).then((lists) =>
    Object.fromEntries(lists.flat().map((m) => [m.id, m])),
  );
  return atlasP;
}

// Salvage grades (public/data/salvage.json): how hard and how worthwhile each machine would be to reuse or fix.
export type Salvage = {
  grade: string | null;
  working?: boolean;
  needsRepair?: { part: string; problem: string }[];
  approaches?: { text: string; kind: "real" | "idea"; source?: string }[];
  engineersSay?: string;
};
export type SalvageFile = { rubric: { grades: { grade: string; min: number; meaning: string }[] }; machines: Record<string, Salvage> };
let salvageP: Promise<SalvageFile | null> | null = null;
export const loadSalvage = () => (salvageP ??= json<SalvageFile | null>("/data/salvage.json", null));

// Models whose files carry no real size (models.json size_m): their real longest side in metres, booms included
// (prepareModel fits the model's longest side to it). Pioneer and Voyager's files are already true size: their dishes
// are 2.74 m and 3.7 m across (NSSDCA: https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1972-012A ,
// https://science.nasa.gov/mission/voyager/spacecraft/), and their magnetometer booms make the longest side.
const SPAN: Record<string, number> = {
  "apollo-lm": 9.4, ladee: 2.4, viking: 3, curiosity: 3, pioneer: 8.25, voyager: 16.9, "new-horizons": 2.7, dawn: 19.7, near: 5, kepler: 4.7,
  galileo: 9, cassini: 6.8, messenger: 6, magellan: 6.4, "deep-impact": 3.3, stardust: 4.8, ingenuity: 1.2,
};
// Spacecraft whose long booms would pull the middle (and the view) off the main body: the parts to centre on, and
// the main body's size, which sets where you appear and how close you can float.
const BODY: Record<string, { centerOn: string[]; size: number }> = {
  pioneer: { centerOn: ["dish_AO"], size: 2.9 },
  voyager: { centerOn: ["tex_02_AO", "tex_02_AO_dark"], size: 3.7 }, // as the Voyager 1 story stop
  "pioneer-venus-orbiter": { centerOn: ["pvcell"], size: 2.6 },
  dawn: { centerOn: ["black_krinkle"], size: 2 }, // its solar wings span 19.7 m
  juno: { centerOn: ["foil_gold"], size: 3.6 }, // its solar wings span about 20 m
};
const DEG_V = (v: [number, number, number]): Vec3 => [v[0] * DEG, v[1] * DEG, v[2] * DEG];

// What hangs behind a machine in space, by what it orbits (or hit); and roughly how far that is from the Sun (AU).
const BACKDROP: Record<string, [BodyKey, number]> = {
  moon: ["moon", 1], mars: ["mars", 1.52], mercury: ["mercury", 0.39], venus: ["venus", 0.72], jupiter: ["jupiter", 5.2],
  saturn: ["saturn", 9.5], ceres: ["ceres", 2.8], eros: ["rock", 1.46], tempel1: ["rock", 1.6], dimorphos: ["rock", 1.2],
};
// Worlds with thick air: a probe that went in there burned up, so there is no ground to stand on.
const GAS = new Set(["jupiter", "saturn", "venus", "heliocentric"]);
const AU_KM = 149_597_870.7;

// Earth's place in the lunar sky from a site: Earth hangs over the near side's centre (0, 0).
function earthFrom(lat: number, lon: number) {
  const el = 90 - latLon(lat, lon).angleTo(latLon(0, 0)) / DEG;
  if (el < 2) return undefined; // far side: Earth is below the horizon
  // Compass bearing from the site to (0, 0).
  const p1 = lat * DEG, dl = -lon * DEG;
  const az = Math.atan2(Math.sin(dl), -Math.sin(p1) * Math.cos(dl)) / DEG;
  return { az: (az + 360) % 360, el };
}

const year = (d?: string) => (d ? d.slice(0, 4) : "");

// Moon sites on the bright highlands (lighter, rougher ground) rather than the dark lava plains of the maria.
const HIGHLANDS = /^(apollo16-(lm|alsep|lrv)|apollo14-(lm|alsep|lrrr)$|apollo17-lm-ascent|surveyor7|grail|ladee|lcross|lunar-prospector)/;

// Spots placed by a model part when the site has no model sit on a ring around the middle instead.
function ringPos(i: number, n: number, r: number, y: number): Vec3 {
  const a = (i / Math.max(1, n)) * Math.PI * 2 + 0.6;
  return [Math.cos(a) * r, y, Math.sin(a) * r];
}

export function buildStop(rec: AtlasRecord, site: SiteFile | null, models: Record<string, ModelInfo>): Stop {
  const world = rec.body === "moon" ? "moon" : rec.body === "mars" ? "mars" : "deep";
  const impactish = rec.type === "impactor" || rec.type === "crash";
  let setting = site?.setting ?? (impactish ? "impact" : world === "deep" ? "space" : "surface");
  // Nothing to stand on inside a gas giant or Venus's clouds: show those as space, with the planet behind.
  if (setting !== "space" && GAS.has(rec.body)) setting = "space";
  const space = setting === "space";
  const impact = setting === "impact";

  const key = impact ? null : site ? site.model : guessModel(rec.name, models);
  const info = key ? models[key] : undefined;
  const span = info ? info.size_m ?? SPAN[key!] ?? 3 : 3;
  const body = key ? BODY[key] : undefined;
  const size = body?.size ?? span; // what you came to see, for framing
  let model: ModelSpec = { kind: "none" };
  if (info && key === "apollo-lm") model = { kind: "gltf", url: "/models/apollo-lm.gltf.json", scale: 1.43, hideAbove: 2.95, origin: "ground" }; // the descent stage left behind
  else if (info && key === "lrv-team") model = { kind: "gltf", url: `/${info.file}`, scale: 1, rotationY: Math.PI / 2, origin: "ground", centerOn: ["chassis"] }; // as the Apollo 15 story stop
  else if (info) model = { kind: "gltf", url: `/${info.file}`, span, origin: space ? "center" : "ground", centerOn: body?.centerOn };
  if (model.kind === "gltf") {
    if (site?.modelTilt) model.tilt = DEG_V(site.modelTilt);
    if (site?.modelCut) model.cut = site.modelCut;
  }

  // An impact's crater radius: the real one from the site file, else a guess (an S-IVB's is about 35 m across).
  const crater = impact ? (site?.crater ? site.crater.diameterM / 2 : /sivb/.test(rec.id) ? 17 : 6) : undefined;
  if (impact && site?.crater) CRATERS.set(rec.id, site.crater);
  const r = Math.max(0.5, size / 2);
  const hasSite = world !== "deep" && typeof rec.lat === "number" && typeof rec.lon === "number";

  // Where you appear: off one side of the machine, far enough to take it all in.
  let spawn: Stop["spawn"];
  let colliders: Stop["colliders"] = [];
  let bounds: number;
  if (space) {
    const d = info ? Math.min(22, Math.max(6, r * 2.4)) : 9;
    spawn = { pos: [d * 0.62, d * 0.14, d * 0.78], look: [0, 0, 0] };
    if (info) colliders = [{ pos: [0, 0, 0], r: r * 0.95 }];
    bounds = Math.max(60, size * 8);
  } else if (crater) {
    // Stand just outside the rim crest, looking down into the bowl. Room to walk out along the ejecta and rays.
    const d = crater + Math.max(2, crater * 0.08); // far enough back to take in a small crater whole
    const depth = site?.crater?.depthM ?? crater * 0.36;
    // From the south-west, so the inner wall facing away from the Sun (az 100) is in view, dark against the rest.
    spawn = { pos: [-d * 0.6, 0, d * 0.8], look: [0, -depth * 0.7, 0] };
    bounds = Math.max(60, crater * 8);
  } else {
    const d = Math.max(3.2, size * 1.5);
    spawn = { pos: [d * 0.55, 0, d * 0.83], look: [0, Math.min(1.5, size * 0.35), 0] };
    if (info) colliders = [{ pos: [0, 0, 0], r: Math.max(0.4, size * 0.4) }];
    bounds = Math.max(40, size * 12);
  }
  if (site?.spawn) spawn = site.spawn;
  if (site?.bounds) bounds = site.bounds;

  const spots = [...(site?.hotspots ?? [])];
  // A crater nobody has photographed is drawn from the best estimate, and says so (on the far rim, in view on arrival).
  if (impact && crater && site?.crater && !site.crater.seen)
    spots.push({
      id: "never-photographed",
      title: "Never photographed",
      text: `No spacecraft has ever clearly photographed this crater, so nobody knows exactly what it looks like. What you see is a best guess, about ${Math.round(site.crater.diameterM)} m across, worked out from how big and how fast the machine was.`,
      anchor: { pos: [crater * 0.62, 0.4, -crater * 0.82], ground: true },
      source: site.crater.source,
    });
  const hotspots: Hotspot[] = spots.map((h, i) => ({
    id: h.id,
    title: h.title,
    text: h.text,
    source: h.source,
    // Without a model there are no parts to find, so part-anchored spots go on a ring around the site.
    anchor: "part" in h.anchor && model.kind === "none" ? { pos: ringPos(i, spots.length, crater ? crater * 0.7 : 3, 0.4), ground: !space } : h.anchor,
    face: null,
    broken: h.broken,
    glow: h.glow,
    glowRadius: h.glowRadius,
    tag: h.tag,
    photo: h.photo,
    video: h.video,
  }));

  const kind: Stop["setting"]["kind"] = space ? "space" : world === "mars" ? "mars" : "moon"; // asteroids and Mercury: airless grey ground
  const [backdrop, au] = BACKDROP[rec.body] ?? [undefined, rec.distance_au ?? 5];
  const distanceKm = world === "moon" ? 384_400 : world === "mars" ? 225_000_000 : (rec.distance_au ?? au) * AU_KM;
  const credit = info ? `${info.title} model: ${info.credit ?? "NASA"}` : "Ground and pieces drawn in code";

  return {
    id: rec.id,
    chapter: world === "moon" ? "Moon" : world === "mars" ? "Mars" : "Deep space",
    body: world,
    name: site?.name ?? rec.name,
    mission: rec.mission ?? rec.name,
    when: rec.arrived ? `Arrived ${year(rec.arrived)}` : rec.launched ? `Launched ${year(rec.launched)}` : "",
    status: site?.status ?? rec.status ?? "",
    intro: site?.intro ?? rec.summary ?? rec.why ?? "",
    site: hasSite ? { lat: rec.lat!, lon: rec.lon! } : undefined,
    distanceKm,
    distanceLabel: world === "deep" ? "Distance from the Sun" : "Distance from Earth",
    model,
    setting: space
      ? {
          kind,
          sun: { az: 140, el: 28 },
          backdrop: backdrop ?? (au > 30 ? "sun-far" : undefined),
          // The Sun looks smaller the farther out you are.
          sunSize: au < 2 ? 520 : au < 6 ? 340 : au < 12 ? 240 : au < 40 ? 150 : 90,
        }
      : {
          kind,
          terrain: kind === "mars" ? "slope" : HIGHLANDS.test(rec.id) ? "highlands" : "mare",
          sun: site?.sun ?? (kind === "mars" ? { az: 150, el: 40 } : { az: 100, el: 24 }),
          fill: site?.fill,
          earth: world === "moon" && hasSite ? earthFrom(rec.lat!, rec.lon!) : undefined,
          flatRadius: crater ? crater * 1.1 : Math.max(1.6, size * 0.9), // rocks keep off a crater and its rim
          crater,
        },
    spawn,
    colliders,
    bounds,
    hotspots,
    credit,
    info: {
      stats: site?.stats ?? [],
      fun: site?.funFact ?? rec.funFact,
    },
    whyLeft: site?.whyLeft ?? rec.lastWords ?? rec.fate?.label,
    repurpose: site?.repurpose,
  };
}

// Opens (builds once) the stop for an atlas id and returns its index in STOPS, or null if there's no such machine.
const building = new Map<string, Promise<number | null>>();
export function openSite(id: string): Promise<number | null> {
  const known = STOPS.findIndex((s) => s.id === id);
  if (known >= 0) return Promise.resolve(known);
  if (!/^[\w-]+$/.test(id)) return Promise.resolve(null);
  let p = building.get(id);
  if (!p) {
    p = (async () => {
      const [atlas, models, site] = await Promise.all([
        loadAtlas(),
        json<Record<string, ModelInfo>>("/models/models.json", {}),
        // A missing site file (still being written) falls back to the atlas's own text, with no hotspots.
        json<SiteFile | null>(`/data/sites/${id}.json`, null),
      ]);
      const rec = atlas[id];
      if (!rec) return null;
      const i = STOPS.push(buildStop(rec, site?.id === id ? site : null, models)) - 1;
      if (STOPS[i].site && STOPS[i].setting.kind !== "space") void loadRealTerrain(i);
      return i;
    })();
    building.set(id, p);
  }
  return p;
}

// What's orbiting Earth: ESA Space Debris Office figures (public/data/earth-orbit.json), for the debris caption and
// the "Earth's orbit" card.
export type EarthOrbit = {
  title: string;
  asOf: string;
  source: { label: string; url: string; credit: string };
  tracked: number;
  satellitesInOrbit: number;
  satellitesWorking: number;
  satellitesDead: number;
  trackedNotWorking: number;
  fragmentationEvents: number;
  massTonnes: number;
  modelled: { reference: string; over10cm: number; from1to10cm: number; from1mmTo1cm: number };
  shells: { name: string; altitudeKm: string; note: string }[];
  kidLines: string[];
};
let orbitP: Promise<EarthOrbit | null> | null = null;
let orbitLine = "";
export const loadEarthOrbit = () =>
  (orbitP ??= json<EarthOrbit | null>("/data/earth-orbit.json", null).then((d) => {
    if (d) orbitLine = `About ${(Math.round(d.trackedNotWorking / 1000) * 1000).toLocaleString("en-US")} dead satellites and rocket parts we can track still circle Earth`;
    return d;
  }));
// The one-line caption ("" until the file has loaded), for the trip home.
export const debrisLine = () => orbitLine;
if (typeof window !== "undefined") void loadEarthOrbit();
