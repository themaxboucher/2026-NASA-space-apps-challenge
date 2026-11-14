import * as THREE from "three";
import { fbm, noise2, rng, smooth } from "../lib/geo";
import { STOPS, type Stop } from "../stops";

// One terrain per stop, shared by the ground mesh, the walker and the camera planner.
const built = new Map<number, Terrain>();
export function terrainFor(index: number) {
  let t = built.get(index);
  if (!t) {
    t = makeTerrain(STOPS[index], index * 101 + 7);
    built.set(index, t);
  }
  return t;
}

export type Terrain = {
  height: (x: number, z: number) => number;
  // Ground color (linear sRGB-ish) at a point, before lighting.
  color: (x: number, z: number, out: THREE.Color) => THREE.Color;
};

type Crater = { x: number; z: number; r: number; depth: number };

function craterField(seed: number, count: number, maxR: number, spread: number, keepClear: number): Crater[] {
  const rand = rng(seed);
  const out: Crater[] = [];
  for (let i = 0; i < count; i++) {
    // Many small craters, a few big ones.
    const r = 0.4 + Math.pow(rand(), 3.2) * maxR;
    const a = rand() * Math.PI * 2;
    const d = keepClear + r + Math.sqrt(rand()) * spread;
    out.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, r, depth: r * (0.12 + rand() * 0.1) });
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

export function makeTerrain(stop: Stop, seed: number): Terrain {
  const flat = stop.setting.flatRadius ?? 4;
  const kind = stop.setting.terrain ?? "mare";
  // Machines (and Falcon, beside the rover) stand on level ground; the terrain eases in around them.
  const landers = (stop.extras ?? []).filter((e) => e.kind === "lm-descent");
  const flats = [{ x: 0, z: 0, r: flat }, ...landers.map((e) => ({ x: e.pos[0], z: e.pos[2], r: 6 }))];
  const settle = (x: number, z: number) => {
    let k = 1;
    for (const f of flats) k *= smooth((Math.hypot(x - f.x, z - f.z) - f.r) / (f.r * 1.4));
    return k;
  };

  if (kind === "mare" || kind === "highlands") {
    const big = kind === "highlands";
    const craters = craterField(seed, big ? 160 : 220, big ? 26 : 18, 520, flat * 0.6);
    // Little West crater, about 33 m across, some 60 m east of Eagle (Armstrong jogged over to look into it).
    if (!big) craters.push({ x: 60, z: 2, r: 16.5, depth: 4 });
    return {
      height(x, z) {
        const roll = fbm(x / 90, z / 90, 4, seed) * (big ? 2.6 : 1.1) + fbm(x / 14, z / 14, 3, seed + 5) * (big ? 0.35 : 0.22);
        return (roll + craterHeight(craters, x, z)) * settle(x, z);
      },
      color(x, z, out) {
        const n = fbm(x / 40, z / 40, 3, seed + 9) * 0.5 + noise2(x / 3, z / 3, seed + 3) * 0.18;
        const v = (big ? 0.5 : 0.44) + n * 0.12;
        return out.setRGB(v, v * 0.985, v * 0.96);
      },
    };
  }

  if (kind === "slope") {
    // Perseverance Valley runs down the inside of Endeavour crater's rim, so the ground falls away to the east.
    const craters = craterField(seed, 60, 6, 300, flat);
    return {
      height(x, z) {
        const fall = -0.11 * x + fbm(x / 70, z / 70, 3, seed) * 2.2 - 1.2 * Math.exp(-((z + 6) ** 2) / 260);
        const grit = fbm(x / 6, z / 6, 3, seed + 4) * 0.18;
        return (fall + grit + craterHeight(craters, x, z) * 0.6) * settle(x, z);
      },
      color(x, z, out) {
        const n = fbm(x / 25, z / 25, 3, seed + 7);
        const rock = smooth((noise2(x / 9, z / 9, seed + 2) - 0.62) * 6);
        return out.setRGB(0.6 + n * 0.08 - rock * 0.12, 0.36 + n * 0.05 - rock * 0.08, 0.22 + n * 0.03 - rock * 0.05);
      },
    };
  }

  // Valinor Hills: smooth, almost featureless sand ripples, which is what confused Ingenuity's navigation.
  return {
    height(x, z) {
      const along = x * 0.82 + z * 0.57;
      const ripple = Math.sin(along * 1.75 + fbm(x / 9, z / 9, 2, seed) * 2.5) * 0.06;
      const swell = fbm(x / 55, z / 55, 3, seed + 1) * 1.6;
      return (ripple + swell) * settle(x, z);
    },
    color(x, z, out) {
      const n = fbm(x / 30, z / 30, 3, seed + 6) * 0.6;
      return out.setRGB(0.63 + n * 0.05, 0.4 + n * 0.035, 0.25 + n * 0.02);
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
export function rockGeometry(seed: number) {
  const g = new THREE.IcosahedronGeometry(1, 2);
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
