import * as THREE from "three";
import { noise2, rng } from "../lib/geo";

// Textures drawn in code, so the tour needs no extra downloads for stars, ground grain, wheels or Saturn.
const cache = new Map<string, THREE.Texture>();

function canvasTexture(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, srgb = true) {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, t);
  return t;
}

export function dotTexture() {
  return canvasTexture("dot", 64, 64, (ctx, w) => {
    const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.25, "rgba(255,255,255,0.85)");
    g.addColorStop(0.6, "rgba(255,255,255,0.18)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, w);
  });
}

export function glowTexture() {
  return canvasTexture("glow", 256, 256, (ctx, w) => {
    const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.08, "rgba(255,250,240,0.95)");
    g.addColorStop(0.2, "rgba(255,236,200,0.35)");
    g.addColorStop(0.45, "rgba(255,220,170,0.08)");
    g.addColorStop(1, "rgba(255,210,160,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, w);
  });
}

// Value noise that wraps every `period` cells, so a texture built from it tiles without seams.
function tileNoise(x: number, y: number, period: number, seed: number) {
  const hash = (i: number, j: number) => {
    let h = (((i % period) + period) % period) * 374761393 + (((j % period) + period) % period) * 668265263 + seed * 2147483647;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const u = (x - xi) * (x - xi) * (3 - 2 * (x - xi));
  const v = (y - yi) * (y - yi) * (3 - 2 * (y - yi));
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// Fine ground grain that repeats every 3 m: pebbles, dust and little pits.
export function grainTexture(kind: "moon" | "mars") {
  const t = canvasTexture(`grain-${kind}`, 512, 512, (ctx, w, h) => {
    const img = ctx.createImageData(w, h);
    const rand = rng(kind === "moon" ? 7 : 11);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const n = tileNoise(x / 16, y / 16, 32, 3) * 0.45 + tileNoise(x / 4, y / 4, 128, 5) * 0.35 + rand() * 0.2;
        const v = 0.72 + (n - 0.5) * 0.5;
        const i = (y * w + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.max(0, Math.min(255, v * 255));
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    // Pebbles: small dark-and-light specks with a shadow side, drawn again across the edges so the tile wraps.
    for (let k = 0; k < 900; k++) {
      const x = rand() * w;
      const y = rand() * h;
      const r = 0.6 + Math.pow(rand(), 3) * 4;
      const dark = 0.25 + rand() * 0.3;
      const light = 0.2 + rand() * 0.3;
      for (const ox of [-w, 0, w]) {
        for (const oy of [-h, 0, h]) {
          if (x + ox < -8 || x + ox > w + 8 || y + oy < -8 || y + oy > h + 8) continue;
          ctx.fillStyle = `rgba(20,16,12,${dark})`;
          ctx.beginPath();
          ctx.arc(x + ox + r * 0.4, y + oy + r * 0.4, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = `rgba(255,250,240,${light})`;
          ctx.beginPath();
          ctx.arc(x + ox, y + oy, r * 0.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

// The rover's tires: woven wire with titanium chevrons, drawn as an alpha pattern.
export function wireTexture() {
  const t = canvasTexture("wire", 512, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(225,225,220,0.95)";
    ctx.lineWidth = 1.4;
    for (let x = -h; x < w + h; x += 7) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + h, h);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + h, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(200,205,210,1)";
    for (let x = 0; x < w; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, h * 0.12);
      ctx.lineTo(x + 10, h * 0.5);
      ctx.lineTo(x, h * 0.88);
      ctx.lineTo(x + 6, h * 0.88);
      ctx.lineTo(x + 16, h * 0.5);
      ctx.lineTo(x + 6, h * 0.12);
      ctx.closePath();
      ctx.fill();
    }
  });
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

// Saturn's cloud bands, drawn from pale gold to tan with soft turbulence.
export function saturnTexture() {
  return canvasTexture("saturn", 1024, 512, (ctx, w, h) => {
    const bands = [
      [0, "#8a7a62"], [0.08, "#a8946f"], [0.18, "#c9b48a"], [0.27, "#bfa77b"], [0.34, "#d8c49a"], [0.4, "#cdb282"],
      [0.46, "#e2d0a6"], [0.5, "#e8d8b0"], [0.54, "#dcc596"], [0.6, "#d3bb8c"], [0.66, "#c7ad7f"], [0.73, "#d4bf94"],
      [0.82, "#b9a37c"], [0.92, "#9b8a6c"], [1, "#857760"],
    ] as const;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    for (const [o, c] of bands) g.addColorStop(o, c);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const n = noise2(x / 60, y / 6, 2) * 0.6 + noise2(x / 14, y / 3, 4) * 0.4;
        const k = 0.93 + n * 0.12;
        const i = (y * w + x) * 4;
        img.data[i] *= k;
        img.data[i + 1] *= k;
        img.data[i + 2] *= k;
      }
    }
    ctx.putImageData(img, 0, 0);
  });
}

// Saturn's rings across their real radii (in Saturn radii, R = 60,268 km): C, B, the Cassini Division, A, Encke gap, F.
export const RING_INNER = 1.11;
export const RING_OUTER = 2.34;
export function ringTexture() {
  return canvasTexture("rings", 2048, 4, (ctx, w, h) => {
    const img = ctx.createImageData(w, h);
    for (let x = 0; x < w; x++) {
      const r = RING_INNER + (x / (w - 1)) * (RING_OUTER - RING_INNER);
      let a = 0;
      let c = [0.8, 0.72, 0.6];
      if (r < 1.236) a = 0.03; // D ring
      else if (r < 1.527) {
        a = 0.12 + 0.08 * Math.sin(r * 90); // C ring, faint and grey
        c = [0.62, 0.58, 0.52];
      } else if (r < 1.951) {
        a = 0.72 + 0.2 * noise2(r * 80, 1, 3); // B ring, bright and dense
        c = [0.9, 0.83, 0.7];
      } else if (r < 2.027) a = 0.06; // Cassini Division
      else if (r < 2.27) {
        a = r > 2.214 && r < 2.219 ? 0.04 : 0.5 + 0.12 * noise2(r * 120, 2, 5); // A ring with the Encke gap
        c = [0.82, 0.76, 0.66];
      } else if (Math.abs(r - 2.326) < 0.004) a = 0.35; // F ring
      for (let y = 0; y < h; y++) {
        const i = (y * w + x) * 4;
        img.data[i] = c[0] * 255;
        img.data[i + 1] = c[1] * 255;
        img.data[i + 2] = c[2] * 255;
        img.data[i + 3] = a * 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  });
}
