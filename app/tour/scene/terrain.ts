import * as THREE from "three";
import { fbm, noise2, rng, smooth } from "../lib/geo";
import type { SiteCrater } from "../siteData";
import { STOPS, type Stop } from "../stops";

// One terrain per stop, shared by the ground mesh, the walker and the camera planner.
const built = new Map<number, Terrain>();
export function terrainFor(index: number) {
  let t = built.get(index);
  if (!t) {
    t = makeTerrain(STOPS[index], index * 101 + 7, realTiles.get(index));
    built.set(index, t);
  }
  return t;
}

// ---- Real ground under the surface stops -----------------------------------------------------
// The atlas ships measured elevation for every site (public/terrain/<world>/<site>: LROC NAC and HiRISE terrain
// models, about 6 to 8 m per sample, plus the orbital photo of the same square). The tour uses it for the true
// lie of the land (slopes, real craters, valleys) and keeps procedural detail only below that resolution.
export type RealTile = {
  h: Float32Array; // heights in meters, row 0 = north edge, column 0 = west edge
  n: number;
  w: number; // extent east-west and north-south, in meters
  d: number;
  ox: number; // where the machine sits inside the tile, in meters east / south of the tile center
  oz: number;
  zero: number; // tile height under the machine, so the machine still stands on y = 0
  res: number; // the measurement's own sample spacing, in meters (LOLA-only tiles are about 20 to 200 m)
  lum: Float32Array | null; // orbital photo brightness, 0..1
  ln: number;
  lumMean: number;
  credit: string;
};
const realTiles = new Map<number, RealTile>();
const loading = new Map<number, Promise<boolean>>();
const listeners = new Set<() => void>();

// Called when a stop's real ground finishes loading, so a scene that is already showing can rebuild.
export function onTerrainChange(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export const terrainCredit = (index: number) => realTiles.get(index)?.credit ?? null;

function grid(a: Float32Array, n: number, u: number, v: number) {
  const x = Math.min(n - 1.001, Math.max(0, u));
  const y = Math.min(n - 1.001, Math.max(0, v));
  const c = Math.floor(x);
  const r = Math.floor(y);
  const fx = x - c;
  const fy = y - r;
  const i = r * n + c;
  return (a[i] * (1 - fx) + a[i + 1] * fx) * (1 - fy) + (a[i + n] * (1 - fx) + a[i + n + 1] * fx) * fy;
}

// Height relative to the ground under the machine. Past the tile's edge it holds the edge value.
const realHeight = (t: RealTile, x: number, z: number) =>
  grid(t.h, t.n, ((x + t.ox) / t.w + 0.5) * (t.n - 1), ((z + t.oz) / t.d + 0.5) * (t.n - 1)) - t.zero;

async function pixels(url: string) {
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  return { data: ctx.getImageData(0, 0, img.width, img.height).data, n: Math.min(img.width, img.height), width: img.width };
}

type TileMeta = {
  extent_m: [number, number];
  res_m?: { height?: number };
  places?: { id: string; x_m: number; y_m: number }[];
  sources?: { height?: { credit?: string; product?: string } };
};

export function loadRealTerrain(index: number): Promise<boolean> {
  const known = loading.get(index);
  if (known) return known;
  const stop = STOPS[index];
  const run = (async () => {
    if (typeof window === "undefined" || !stop?.site || stop.setting.kind === "space") return false;
    try {
      const paths: Record<string, string> = await fetch(`/terrain/index-${stop.setting.kind}.json`).then((r) => r.json());
      const path = paths[stop.id];
      if (!path || !/^(moon|mars)\/[\w-]+$/.test(path)) return false;
      const base = `/terrain/${path}/`;
      const meta: TileMeta = await fetch(base + "meta.json").then((r) => r.json());
      const [hp, cp] = await Promise.all([pixels(base + "height.png"), pixels(base + "color.jpg").catch(() => null)]);
      const n = hp.n;
      const h = new Float32Array(n * n);
      for (let r = 0; r < n; r++)
        for (let c = 0; c < n; c++) {
          const k = (r * hp.width + c) * 4;
          // Terrarium encoding: meters = R * 256 + G + B / 256 - 32768.
          h[r * n + c] = hp.data[k] * 256 + hp.data[k + 1] + hp.data[k + 2] / 256 - 32768;
        }
      let lum: Float32Array | null = null;
      let ln = 0;
      let lumMean = 0.5;
      if (cp) {
        ln = cp.n;
        lum = new Float32Array(ln * ln);
        let sum = 0;
        for (let r = 0; r < ln; r++)
          for (let c = 0; c < ln; c++) {
            const k = (r * cp.width + c) * 4;
            const v = (cp.data[k] * 0.3 + cp.data[k + 1] * 0.59 + cp.data[k + 2] * 0.11) / 255;
            lum[r * ln + c] = v;
            sum += v;
          }
        lumMean = sum / (ln * ln) || 0.5;
      }
      const place = meta.places?.find((p) => p.id === stop.id);
      const [w, d] = meta.extent_m.map(Number);
      const tile: RealTile = { h, n, w, d, ox: place?.x_m ?? 0, oz: -(place?.y_m ?? 0), zero: 0, res: meta.res_m?.height ?? 6, lum, ln, lumMean, credit: "" };
      tile.zero = realHeight(tile, 0, 0);
      const src = meta.sources?.height;
      tile.credit = `Ground shape: ${src?.credit ?? "NASA"}${src?.product ? ` (${src.product})` : ""}`;
      realTiles.set(index, tile);
      built.delete(index);
      listeners.forEach((fn) => fn());
      return true;
    } catch {
      return false;
    }
  })();
  loading.set(index, run);
  return run;
}

// Start fetching every surface stop's ground as soon as the tour loads, so it is ready before you arrive.
if (typeof window !== "undefined") STOPS.forEach((s, i) => s.site && s.setting.kind !== "space" && void loadRealTerrain(i));

export type Terrain = {
  height: (x: number, z: number) => number;
  // Ground color (linear sRGB-ish) at a point, before lighting.
  color: (x: number, z: number, out: THREE.Color) => THREE.Color;
};

type Crater = { x: number; z: number; r: number; depth: number };

function craterField(seed: number, count: number, minR: number, maxR: number, spread: number, keepClear: number): Crater[] {
  const rand = rng(seed);
  const out: Crater[] = [];
  for (let i = 0; i < count; i++) {
    // Power-law sizes, as on real cratered ground: the number bigger than D falls off about as D^-2.
    const r = Math.min(maxR, minR * Math.pow(1 - rand(), -1 / 2));
    const a = rand() * Math.PI * 2;
    const d = keepClear + r + Math.sqrt(rand()) * spread;
    // Fresh craters are about a fifth as deep as they are wide; old, worn-down ones much shallower.
    out.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, r, depth: r * (0.08 + Math.pow(rand(), 2) * 0.32) });
  }
  return out;
}

function craterHeight(craters: Crater[], x: number, z: number) {
  let h = 0;
  for (const c of craters) {
    const dx = x - c.x;
    const dz = z - c.z;
    const d2 = dx * dx + dz * dz;
    const lim = c.r * 1.6;
    if (d2 > lim * lim) continue;
    const t = Math.sqrt(d2) / c.r;
    // Bowl inside, raised rim just outside, fading out by 1.6 r.
    if (t < 1) h += -c.depth * (1 - t * t) + c.depth * 0.25 * t * t * t * t;
    else h += c.depth * 0.25 * Math.pow(1 - (t - 1) / 0.6, 2);
  }
  return h;
}

// Extra landers (Falcon, beside the rover) stand on a small level pad at the height the ground really has there,
// instead of being pulled to the main machine's level.
export function makeTerrain(stop: Stop, seed: number, tile?: RealTile): Terrain {
  const base = withCrater(stop, makeBase(stop, seed, tile), seed);
  const pads = (stop.extras ?? [])
    .filter((e) => e.kind === "lm-descent")
    .map((e) => ({ x: e.pos[0], z: e.pos[2], r: 6, y: base.height(e.pos[0], e.pos[2]) }));
  if (!pads.length) return base;
  return {
    color: base.color,
    height(x, z) {
      let h = base.height(x, z);
      for (const p of pads) h = p.y + (h - p.y) * smooth((Math.hypot(x - p.x, z - p.z) - p.r) / (p.r * 1.4));
      return h;
    },
  };
}

// Impact sites' real craters (public/data/sites/<id>.json "crater"), by stop id; sites.ts fills it in.
export const CRATERS = new Map<string, SiteCrater>();
export function craterSpec(stop: Stop): SiteCrater | null {
  const r = stop.setting.crater;
  if (!r) return null;
  // A site file without crater data yet: a plain fresh crater of the radius sites.ts picked.
  return CRATERS.get(stop.id) ?? { diameterM: r * 2, depthM: r * 0.36, ejecta: "bright", seen: true, source: { label: "", url: "" } };
}

// A fresh crater where the machine hit, cut into the real ground (so it follows a slope), at its true size:
// a bowl with a raised rim, a central mound if the crater has one (the S-IVB craters do), and the thrown-out
// blanket thinning outward as about 1/r^3. The soil it threw out is coloured in: fresh bright, dark (GRAIL's is
// probably the probes' own carbon), or the S-IVBs' long bright and dark rays. The outline wobbles a little, as
// real ones do.
function withCrater(stop: Stop, base: Terrain, seed: number): Terrain {
  const c = craterSpec(stop);
  if (!c) return base;
  const R = c.diameterM / 2;
  const d = c.depthM;
  const rim = d * 0.3; // rim crest above the old ground; the floor is the rest of the depth below it
  const mound = c.ejecta === "rays" ? d * 0.25 : 0;
  const rand = rng(seed + 31);
  const rays = Array.from({ length: c.ejecta === "rays" ? 16 : 0 }, () => ({
    a: rand() * Math.PI * 2,
    w: 0.06 + rand() * 0.08, // angular half-width: wide enough for the ground mesh's 160 segments to draw
    len: 6 + rand() * 30, // in crater radii (LROC: the Apollo 14 stage's rays run more than 1.5 km)
    k: rand() < 0.7 ? 0.32 : -0.22, // bright or dark
  }));
  const polar = (x: number, z: number) => {
    const a = Math.atan2(z, x);
    // Wobble the outline (about ±7%) and make the blanket patchy, both smooth around the circle.
    const wob = noise2(Math.cos(a) * 1.4 + 3, Math.sin(a) * 1.4 + 3, seed) * 2 - 1;
    const lobe = noise2(Math.cos(a) * 2.6 + 9, Math.sin(a) * 2.6 + 9, seed + 1);
    return { a, t: Math.hypot(x, z) / (R * (1 + 0.07 * wob)), lobe };
  };
  return {
    height(x, z) {
      const { t, lobe } = polar(x, z);
      let h: number;
      if (t < 1) h = rim - d * (1 - t * t) + mound * Math.exp(-((t / 0.3) ** 2));
      else h = rim * Math.pow(t, -3) * (1 + (lobe - 0.5) * 0.8 * smooth((t - 1) / 0.4)) * (1 - smooth((t - 2.5) / 2));
      return base.height(x, z) + h;
    },
    color(x, z, out) {
      base.color(x, z, out);
      const { a, t, lobe } = polar(x, z);
      // Freshly dug soil and its blanket: strongest on the walls and rim, fading out by about 3 to 4 radii.
      const blanket = t < 1 ? 0.75 + 0.25 * t : Math.pow(t, -2.2) * (0.5 + lobe) * (1 - smooth((t - 3) / 1.5));
      let k = 0;
      if (c.ejecta === "bright" || c.ejecta === "rays") k = 0.42 * blanket;
      else if (c.ejecta === "dark") k = -0.38 * blanket * (t < 1 ? 0.6 : 1);
      else k = 0.1 * blanket; // even with nothing seen from orbit, the walls are fresh
      for (const r of rays) {
        let da = Math.abs(a - r.a) % (Math.PI * 2);
        if (da > Math.PI) da = Math.PI * 2 - da;
        if (da > r.w * 3 || t < 0.9) continue;
        const along = smooth((t - 0.9) / 0.6) * (1 - smooth((t - 1) / (r.len - 1)));
        k += r.k * Math.exp(-((da / r.w) ** 2)) * along * (0.55 + 0.45 * noise2(t * 0.6, r.a * 10, seed + 2));
      }
      return out.multiplyScalar(Math.max(0.45, 1 + k));
    },
  };
}

function makeBase(stop: Stop, seed: number, tile?: RealTile): Terrain {
  const flat = stop.setting.flatRadius ?? 4;
  // Measured ground, when loaded. It replaces every procedural feature bigger than its own sample spacing.
  const real = tile ? (x: number, z: number) => realHeight(tile, x, z) : null;
  // Far from the machine, tint the ground with the orbital photo, so real bright and dark patches show.
  const photo = (x: number, z: number, out: THREE.Color) => {
    if (!tile?.lum) return out;
    const k = smooth((Math.hypot(x, z) - 12) / 70) * 0.55;
    if (k <= 0) return out;
    const v = grid(tile.lum, tile.ln, ((x + tile.ox) / tile.w + 0.5) * (tile.ln - 1), ((z + tile.oz) / tile.d + 0.5) * (tile.ln - 1));
    return out.multiplyScalar(Math.min(1.6, Math.max(0.55, 1 + (v / tile.lumMean - 1) * k)));
  };
  const kind = stop.setting.terrain ?? "mare";
  // The machine stands on level ground at y = 0; the terrain eases in around it. An impact crater is cut into the
  // ground as it really lies (GRAIL's and LADEE's are on slopes of 20 degrees or more), so nothing is levelled there.
  const crater = stop.setting.crater ?? 0;
  const settle = crater ? () => 1 : (x: number, z: number) => smooth((Math.hypot(x, z) - flat) / (flat * 1.4));
  // Made-up craters stay off a fresh impact crater and its rim (nothing has hit it since).
  const clear = crater ? crater * 1.3 : flat * 0.6;
  // Where the measurement is coarse (LOLA alone, 20 to 200 m per sample), it is smooth below that size, so add
  // the gentle rolls and craters it cannot see. Fine measured ground (LROC and HiRISE, 2 to 6 m) needs none of this.
  const coarse = tile ? smooth((tile.res - 8) / 22) : 0;

  if (kind === "mare" || kind === "highlands") {
    const big = kind === "highlands";
    // With measured ground, only craters too small for the data (under about 9 m across) are made up.
    const craters = [
      ...craterField(seed, real ? 260 : big ? 160 : 220, 1.2, real ? 4.5 + coarse * 9 : big ? 26 : 18, 520, clear),
      // Small craters, 0.5 to 3 m across, packed close around you: the Moon is cratered at every scale.
      ...craterField(seed + 1, 520, 0.25, 1.5, 70, clear),
    ];
    // Little West crater, about 33 m across, east of Eagle (Armstrong jogged over to look into it).
    // The measured ground already has it (about 3.5 m deep, 75 m east), so it is only added by hand without data.
    if (!big && !real) craters.push({ x: 60, z: 2, r: 16.5, depth: 4 });
    return {
      height(x, z) {
        const fine = fbm(x / 14, z / 14, 3, seed + 5) * (big ? 0.35 : 0.22);
        const roll = real ? real(x, z) + fine + coarse * fbm(x / 70, z / 70, 3, seed) * (big ? 1.6 : 0.9) : fbm(x / 90, z / 90, 4, seed) * (big ? 2.6 : 1.1) + fine;
        return (roll + craterHeight(craters, x, z)) * settle(x, z);
      },
      color(x, z, out) {
        const n = fbm(x / 40, z / 40, 3, seed + 9) * 0.5 + noise2(x / 3, z / 3, seed + 3) * 0.18;
        // Walked-on and driven-on soil is darker than untouched regolith (LROC sees the astronauts' paths).
        const trodden = smooth((22 - Math.hypot(x, z)) / 14) * smooth((noise2(x / 5, z / 5, seed + 8) - 0.35) * 3);
        const v = ((big ? 0.5 : 0.44) + n * 0.12) * (1 - trodden * 0.12);
        return photo(x, z, out.setRGB(v, v * 0.985, v * 0.96));
      },
    };
  }

  if (kind === "slope") {
    // Perseverance Valley runs down the inside of Endeavour crater's rim, so the ground falls away to the east.
    // The measured ground here falls east at about 15 degrees, steeper than the stand-in slope below.
    const craters = craterField(seed, 60 + Math.round(coarse * 60), 0.6, real ? 4 + coarse * 6 : 6, 300, crater ? clear : flat);
    // Wind-blown sand collects in patches between the rocks and forms ripples about 3 m apart, crests running
    // across the valley (Opportunity drove over these in Perseverance Valley).
    const sand = (x: number, z: number) => smooth((noise2(x / 14, z / 14, seed + 12) - 0.5) * 5);
    return {
      height(x, z) {
        const fall = real ? real(x, z) + coarse * fbm(x / 60, z / 60, 3, seed) * 1.2 : -0.11 * x + fbm(x / 70, z / 70, 3, seed) * 2.2 - 1.2 * Math.exp(-((z + 6) ** 2) / 260);
        const grit = fbm(x / 6, z / 6, 3, seed + 4) * 0.18;
        const ripple = Math.sin((x * 0.35 + z * 0.94) * 2.1 + fbm(x / 8, z / 8, 2, seed + 3) * 2) * 0.07 * sand(x, z);
        return (fall + grit * (1 - sand(x, z) * 0.7) + ripple + craterHeight(craters, x, z) * 0.6) * settle(x, z);
      },
      color(x, z, out) {
        const n = fbm(x / 25, z / 25, 3, seed + 7);
        // Darker, greyer basaltic outcrop where the dust is thin; ruddier sand where it has piled up.
        const rock = smooth((noise2(x / 9, z / 9, seed + 2) - 0.62) * 6) * (1 - sand(x, z));
        const s = sand(x, z) * 0.05;
        return photo(x, z, out.setRGB(0.55 + n * 0.07 - rock * 0.17 + s, 0.35 + n * 0.045 - rock * 0.12, 0.23 + n * 0.03 - rock * 0.07 - s * 0.4));
      },
    };
  }

  // Valinor Hills: smooth, almost featureless sand ripples, which is what confused Ingenuity's navigation.
  return {
    height(x, z) {
      const along = x * 0.82 + z * 0.57;
      const ripple = Math.sin(along * 1.75 + fbm(x / 9, z / 9, 2, seed) * 2.5) * 0.06;
      const swell = real ? real(x, z) : fbm(x / 55, z / 55, 3, seed + 1) * 1.6;
      return (ripple + swell) * settle(x, z);
    },
    color(x, z, out) {
      const n = fbm(x / 30, z / 30, 3, seed + 6) * 0.6;
      // Ripple crests catch a little coarser, darker grit; troughs hold the fine bright dust.
      const crest = Math.sin((x * 0.82 + z * 0.57) * 1.75 + fbm(x / 9, z / 9, 2, seed) * 2.5) * 0.02;
      return photo(x, z, out.setRGB(0.58 + n * 0.05 - crest, 0.38 + n * 0.035 - crest * 0.8, 0.25 + n * 0.02 - crest * 0.6));
    },
  };
}

// A disc of ground with rings that get wider with distance: fine detail at your feet, cheap at the horizon.
export function groundGeometry(terrain: Terrain, radius: number, curvatureR: number) {
  const segments = 160;
  const radii: number[] = [0];
  let r = 0.18;
  while (r < radius) {
    radii.push(r);
    r *= r < 30 ? 1.045 : 1.07;
  }
  radii.push(radius);
  const pos: number[] = [];
  const col: number[] = [];
  const uv: number[] = [];
  const c = new THREE.Color();
  for (const rr of radii) {
    const n = rr === 0 ? 1 : segments;
    for (let i = 0; i < n; i++) {
      const a = (i / segments) * Math.PI * 2;
      const x = Math.cos(a) * rr;
      const z = Math.sin(a) * rr;
      // Drop the far ground with the planet's curvature, so the horizon sits where it really would.
      const y = terrain.height(x, z) - (rr * rr) / (2 * curvatureR);
      pos.push(x, y, z);
      terrain.color(x, z, c);
      col.push(c.r, c.g, c.b);
      uv.push(x / 3, z / 3);
    }
  }
  const index: number[] = [];
  for (let i = 0; i < segments; i++) index.push(0, 1 + ((i + 1) % segments), 1 + i);
  for (let ring = 1; ring < radii.length - 1; ring++) {
    const a0 = 1 + (ring - 1) * segments;
    const b0 = 1 + ring * segments;
    for (let i = 0; i < segments; i++) {
      const i1 = (i + 1) % segments;
      index.push(a0 + i, a0 + i1, b0 + i);
      index.push(a0 + i1, b0 + i1, b0 + i);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

// A lumpy rock: an icosphere pushed in and out by noise, then squashed.
export function rockGeometry(seed: number, detail = 2) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = 0.75 + noise2(v.x * 2.1 + seed, v.y * 2.1 + v.z * 1.7, seed) * 0.5;
    v.multiplyScalar(n);
    v.y *= 0.62;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}
