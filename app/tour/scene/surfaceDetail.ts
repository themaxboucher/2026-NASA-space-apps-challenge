import * as THREE from "three";

// Surface detail for flat-coloured models (mostly the team's Blender ones): each untextured material is sorted by
// name, then colour, into a kind (foil, metal, solar cells...) and given small tiling textures drawn here once and
// shared. Materials are changed in place, so every copy of a model gets it and it is only done once per material.
// Textured materials (NASA's own maps) are left alone.

type Kind = "foil" | "metal" | "cell" | "paint" | "rough" | "glass" | "weave" | "generic";

const S = 256; // texture size in pixels

function hash(i: number, j: number, seed: number) {
  let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(seed, 1013904223)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

// Value noise over the tile with `cx` × `cy` lattice cells, wrapping so the texture tiles without seams.
function noise(x: number, y: number, cx: number, cy: number, seed: number) {
  const fx = (x / S) * cx, fy = (y / S) * cy;
  const xi = Math.floor(fx), yi = Math.floor(fy);
  const u = (fx - xi) * (fx - xi) * (3 - 2 * (fx - xi));
  const v = (fy - yi) * (fy - yi) * (3 - 2 * (fy - yi));
  const w = (i: number, j: number) => hash(((i % cx) + cx) % cx, ((j % cy) + cy) % cy, seed);
  const a = w(xi, yi), b = w(xi + 1, yi), c = w(xi, yi + 1), d = w(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

const cache = new Map<string, THREE.DataTexture>();
// One tile covering `meters` of surface (the models get UVs in meters, see boxUV).
function texture(key: string, meters: number, srgb: boolean, fill: (px: Uint8Array) => void) {
  let t = cache.get(key);
  if (t) return t;
  const px = new Uint8Array(S * S * 4);
  fill(px);
  t = new THREE.DataTexture(px, S, S);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.repeat.setScalar(1 / meters);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  cache.set(key, t);
  return t;
}

// Height field (in pixels of height per pixel across) to a tangent-space normal map.
function normalMap(key: string, meters: number, height: (x: number, y: number) => number) {
  return texture(key, meters, false, (px) => {
    const h = new Float32Array(S * S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) h[y * S + x] = height(x, y);
    const at = (x: number, y: number) => h[((y + S) % S) * S + ((x + S) % S)];
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const dx = (at(x + 1, y) - at(x - 1, y)) / 2, dy = (at(x, y + 1) - at(x, y - 1)) / 2;
        const l = Math.hypot(dx, dy, 1), i = (y * S + x) * 4;
        px[i] = (-dx / l + 1) * 127.5;
        px[i + 1] = (-dy / l + 1) * 127.5;
        px[i + 2] = (1 / l + 1) * 127.5;
        px[i + 3] = 255;
      }
  });
}

// Grey 0..1 in every channel (roughness reads green).
function greyMap(key: string, meters: number, value: (x: number, y: number) => number) {
  return texture(key, meters, false, (px) => {
    for (let i = 0; i < S * S; i++) px.fill(Math.max(0, Math.min(255, value(i % S, (i / S) | 0) * 255)), i * 4, i * 4 + 4);
  });
}

// Crumpled foil: a tiling Voronoi pattern where every cell is a flat facet tilted its own way (the jumps between
// facets are the creases), plus fine wrinkles. Each facet is a little rougher or smoother than its neighbours.
const FACETS = Array.from({ length: 26 }, (_, k) => ({ x: hash(k, 1, 7) * S, y: hash(k, 2, 7) * S, tx: hash(k, 3, 7) - 0.5, ty: hash(k, 4, 7) - 0.5, r: hash(k, 5, 7) }));
function facet(x: number, y: number) {
  let best = FACETS[0], dx = 0, dy = 0, d2 = Infinity;
  for (const f of FACETS) {
    const ox = ((x - f.x + S * 1.5) % S) - S / 2, oy = ((y - f.y + S * 1.5) % S) - S / 2;
    const d = ox * ox + oy * oy;
    if (d < d2) [best, dx, dy, d2] = [f, ox, oy, d];
  }
  return { f: best, dx, dy };
}
const foil = () => ({
  n: normalMap("foil", 0.45, (x, y) => {
    const { f, dx, dy } = facet(x, y);
    return (dx * f.tx + dy * f.ty) * 0.7 + 3 * noise(x, y, 32, 32, 1) + 1.5 * noise(x, y, 64, 64, 2);
  }),
  r: greyMap("foil-r", 0.45, (x, y) => 0.45 + 0.45 * facet(x, y).f.r + 0.08 * noise(x, y, 64, 64, 3)),
});

// Brushed aluminium: long, fine streaks along one direction.
const streak = (x: number, y: number) => 0.6 * noise(x, y, 2, 96, 4) + 0.4 * noise(x, y, 4, 192, 5);
const metal = () => ({
  n: normalMap("brushed", 0.25, (x, y) => 2.2 * streak(x, y) + 0.4 * noise(x, y, 16, 16, 6)),
  r: greyMap("brushed-r", 0.25, (x, y) => 0.7 + 0.3 * streak(x, y)),
});

// Solar cells: an 8 × 8 grid of 4 cm cells, each a slightly different shade of the panel's colour, with dark gaps
// and two thin silver bus bars. Baked per panel colour (only a handful exist).
const CELL = S / 8;
const cellPart = (x: number, y: number) => {
  const cx = x % CELL, cy = y % CELL;
  if (cx < 2 || cy < 2) return "gap";
  return cx === 11 || cx === 23 ? "bar" : "cell";
};
function cells(color: THREE.Color) {
  const base = color.clone().convertLinearToSRGB();
  return {
    map: texture(`cell-${color.getHexString()}`, 0.32, true, (px) => {
      for (let y = 0; y < S; y++)
        for (let x = 0; x < S; x++) {
          const part = cellPart(x, y), i = (y * S + x) * 4;
          const k = 0.88 + 0.24 * hash((x / CELL) | 0, (y / CELL) | 0, 8) + 0.06 * (1 - (y % CELL) / CELL);
          const c = part === "gap" ? [0.05, 0.05, 0.06] : part === "bar" ? [0.72, 0.73, 0.75] : [base.r * k, base.g * k, base.b * k];
          px.set([...c.map((v) => Math.min(255, v * 255)), 255], i);
        }
    }),
    n: normalMap("cell-n", 0.32, (x, y) => ({ gap: -1.5, bar: 0.6, cell: 0 })[cellPart(x, y)] + 0.3 * noise(x, y, 64, 64, 9)),
  };
}

// Woven wire (the LRV's wheels): 4 wires each way, going over and under at every crossing, dark gaps between.
const PITCH = S / 4;
function weaveAt(x: number, y: number) {
  const wire = (along: number, across: number, flip: number) => {
    const j = Math.floor(across / PITCH), d = (across % PITCH) - PITCH / 2, p = 1 - (d / 14) ** 2;
    return p > 0 ? { h: 4 * Math.sqrt(p) + 3 * flip * Math.cos((Math.PI * along) / PITCH + Math.PI * j), p } : null;
  };
  const a = wire(x, y, 1), b = wire(y, x, -1);
  const top = a && b ? (a.h > b.h ? a : b) : (a ?? b);
  return top ?? { h: -6, p: 0 };
}
const weave = () => ({
  map: greyMap("weave", 0.1, (x, y) => {
    const w = weaveAt(x, y);
    return w.p > 0 ? 0.55 + 0.45 * Math.sqrt(w.p) : 0.12;
  }),
  n: normalMap("weave-n", 0.1, (x, y) => weaveAt(x, y).h),
});

const peel = () => normalMap("peel", 0.4, (x, y) => 1.6 * noise(x, y, 16, 16, 10) + 0.8 * noise(x, y, 32, 32, 11));
const grain = () => normalMap("grain", 0.3, (x, y) => 1.2 * noise(x, y, 64, 64, 12) + 0.7 * noise(x, y, 128, 128, 13));
const micro = () => normalMap("micro", 0.5, (x, y) => 1.2 * noise(x, y, 32, 32, 14) + 0.6 * noise(x, y, 64, 64, 15));

const hsl = { h: 0, s: 0, l: 0 };
function classify(m: THREE.MeshStandardMaterial): Kind {
  const n = m.name.toLowerCase();
  if (/glass|lens|visor|mirror|osr/.test(n) || (m.metalness > 0.9 && m.roughness < 0.08)) return "glass";
  if (/mesh/.test(n)) return "weave";
  if (/cell|solar(?!.*back)/.test(n)) return "cell";
  if (/cable|line|wire/.test(n)) return "generic";
  if (/gold|foil|kapton|mli|blanket|krinkle/.test(n)) return "foil";
  if (/alu|silver|metal|steel|chrome|iron|brass|bronze|copper|gunmetal|chevron|ribbed|polished|spring|frame|nozzle|tank|mast/.test(n)) return "metal";
  if (/black|rubber|tire|tyre|phenolic|inner|cloth|airbag|webbing|suit|beta|velcro/.test(n)) return "rough";
  if (/white|paint|radiator|shell|face|fender|orange|red|maroon|blue|navy|deck|aft/.test(n)) return "paint";
  // NASA's exports often have meaningless names (blinn1SG), so fall back on the colour: amber-gold is foil.
  m.color.getHSL(hsl);
  if (hsl.h > 0.05 && hsl.h < 0.14 && hsl.s > 0.6 && hsl.l > 0.2 && hsl.l < 0.6) return "foil";
  if (hsl.l < 0.06) return "rough";
  if (m.metalness >= 0.5) return "metal";
  return "generic";
}

function apply(m: THREE.MeshStandardMaterial, kind: Kind) {
  switch (kind) {
    case "foil": {
      const t = foil();
      m.normalMap = t.n;
      m.roughnessMap = t.r;
      m.normalScale.setScalar(0.9);
      m.metalness = Math.max(m.metalness, 0.75);
      m.roughness = 0.5; // times the map: about 0.25 to 0.45
      break;
    }
    case "metal": {
      const t = metal();
      m.normalMap = t.n;
      m.roughnessMap = t.r;
      m.normalScale.setScalar(0.45);
      m.metalness = Math.max(m.metalness, 0.6);
      m.roughness = Math.min(1, m.roughness / 0.85); // the map averages about 0.85
      break;
    }
    case "cell": {
      const t = cells(m.color);
      m.map = t.map;
      m.normalMap = t.n;
      m.normalScale.setScalar(0.6);
      m.color.set("#ffffff");
      m.metalness = 0.25;
      m.roughness = 0.2;
      break;
    }
    case "paint":
      m.normalMap = peel();
      m.normalScale.setScalar(0.22);
      m.metalness = 0;
      m.roughness = Math.max(m.roughness, 0.7);
      break;
    case "rough":
      m.normalMap = grain();
      m.normalScale.setScalar(0.6);
      m.roughness = Math.max(m.roughness, 0.85);
      break;
    case "glass":
      m.roughness = Math.min(m.roughness, 0.05);
      m.envMapIntensity = 1.5;
      break;
    case "weave": {
      const t = weave();
      m.map = t.map;
      m.normalMap = t.n;
      m.normalScale.setScalar(0.8);
      m.metalness = Math.max(m.metalness, 0.6);
      m.roughness = 0.45;
      break;
    }
    case "generic":
      m.normalMap = micro();
      m.normalScale.setScalar(0.35);
      break;
  }
  m.needsUpdate = true;
}

const kinds = new WeakMap<THREE.Material, Kind | null>();
function detail(mat: THREE.Material) {
  if (kinds.has(mat)) return kinds.get(mat)!;
  const m = mat as THREE.MeshStandardMaterial;
  const kind = m.isMeshStandardMaterial && !m.map && !m.normalMap && !m.transparent ? classify(m) : null;
  if (kind) apply(m, kind);
  kinds.set(mat, kind);
  return kind;
}

// Box-projected UVs in meters: each triangle takes the two axes its face is most square to. The geometry is
// un-indexed first so a triangle never shares a corner (and its UV) with a face projected another way.
// Done once per source geometry; the model's scale at that moment sets the meters.
const boxed = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>();
function boxUV(src: THREE.BufferGeometry, scale: number) {
  let g = boxed.get(src);
  if (g) return g;
  g = src.index ? src.toNonIndexed() : src.clone();
  const p = g.attributes.position;
  const uv = new Float32Array(p.count * 2);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i + 2 < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    c.fromBufferAttribute(p, i + 2);
    const n = c.clone().sub(b).cross(a.clone().sub(b));
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    for (let k = 0; k < 3; k++) {
      const v = [a, b, c][k];
      const [u, w] = ax >= ay && ax >= az ? [v.z, v.y] : ay >= az ? [v.x, v.z] : [v.x, v.y];
      uv[(i + k) * 2] = u * scale;
      uv[(i + k) * 2 + 1] = w * scale;
    }
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  boxed.set(src, g);
  return g;
}

// Call with the model at its final scale (matrixWorld up to date).
export function addSurfaceDetail(root: THREE.Object3D) {
  const s = new THREE.Vector3();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (!mats.map(detail).some((k) => k && k !== "glass")) return;
    s.setFromMatrixScale(mesh.matrixWorld);
    mesh.geometry = boxUV(mesh.geometry, (s.x + s.y + s.z) / 3);
  });
}
