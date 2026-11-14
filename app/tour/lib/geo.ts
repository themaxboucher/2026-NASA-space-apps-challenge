import * as THREE from "three";

export const DEG = Math.PI / 180;

// Lat/lon (east-positive) to a point on three.js's default sphere UV layout (u = 0 at lon -180), as in the atlas.
export function latLon(lat: number, lon: number, r = 1, out = new THREE.Vector3()) {
  const p = (lon + 180) * DEG;
  const t = lat * DEG;
  return out.set(-Math.cos(p) * Math.cos(t) * r, Math.sin(t) * r, Math.sin(p) * Math.cos(t) * r);
}

// Y rotation that turns a globe so the given longitude faces `toward` (+1 = +z, -1 = -z).
export function faceLonRotation(lon: number, toward: 1 | -1) {
  return toward === 1 ? -(Math.PI / 2 + lon * DEG) : Math.PI / 2 - lon * DEG;
}

// Surface scenes use +x = east, -z = north, +y = up. Azimuth is measured clockwise from north.
export function skyDir(azimuthDeg: number, elevationDeg: number, out = new THREE.Vector3()) {
  const a = azimuthDeg * DEG;
  const e = elevationDeg * DEG;
  return out.set(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e));
}

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (x: number) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};
export const smoother = (x: number) => {
  const t = clamp01(x);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
export const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);
export const easeIn = (x: number) => Math.pow(clamp01(x), 3);
// Remaps x from [a, b] to [0, 1].
export const span = (x: number, a: number, b: number) => clamp01((x - a) / (b - a));

// Small deterministic random generator, so terrain and rocks are the same on every visit.
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1_000_000) / 1_000_000;
  };
}

function hash2(x: number, y: number, seed: number) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

// Smooth value noise in [0, 1].
export function noise2(x: number, y: number, seed = 1) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x: number, y: number, octaves = 4, seed = 1) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * (noise2(x * freq, y * freq, seed + i * 17) * 2 - 1);
    freq *= 2;
    amp *= 0.5;
  }
  return sum;
}

// Points the camera at `target` with `up` kept as the vertical, without touching camera.up.
const m4 = new THREE.Matrix4();
export function aim(camera: THREE.Camera, eye: THREE.Vector3, target: THREE.Vector3, up = UP) {
  camera.position.copy(eye);
  m4.lookAt(eye, target, up);
  camera.quaternion.setFromRotationMatrix(m4);
}
export const UP = new THREE.Vector3(0, 1, 0);

export function formatKm(km: number) {
  if (km >= 1e9) return `${(km / 1e9).toFixed(km >= 1e10 ? 1 : 2)} billion km`;
  if (km >= 1e6) return `${Math.round(km / 1e6).toLocaleString("en-US")} million km`;
  return `${Math.round(km).toLocaleString("en-US")} km`;
}
