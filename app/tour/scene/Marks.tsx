"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { Mark } from "../stops";

// Footprints and wheel tracks pressed into the ground: small textured quads laid flat along a path, each at
// the terrain height under it. The textures are drawn here, so there are no image files to credit.

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Prints are pressed INTO the ground: each comes with a depth map turned into a normal map, so the real sun
// lights one wall of the hollow and shades the other, and the tread ridges cast little shadows.
type Relief = { map: THREE.Texture; normalMap: THREE.Texture };
function relief(w: number, h: number, height: (x: number, y: number) => number, strength: number): Relief {
  const H = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) H[y * w + x] = height(x, y);
  const col = document.createElement("canvas"), nor = document.createElement("canvas");
  col.width = nor.width = w;
  col.height = nor.height = h;
  const ci = col.getContext("2d")!.createImageData(w, h), ni = nor.getContext("2d")!.createImageData(w, h);
  const at = (x: number, y: number) => H[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, v = H[y * w + x];
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength, dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      ni.data[i] = (-dx / len * 0.5 + 0.5) * 255;
      ni.data[i + 1] = (dy / len * 0.5 + 0.5) * 255;
      ni.data[i + 2] = (1 / len * 0.5 + 0.5) * 255;
      ni.data[i + 3] = 255;
      // Pressed soil is a touch darker; the rim of pushed-up dust a touch lighter.
      const shade = v < 0 ? 128 + v * 26 : 140 + v * 30;
      ci.data[i] = shade;
      ci.data[i + 1] = shade * 0.97;
      ci.data[i + 2] = shade * 0.93;
      ci.data[i + 3] = Math.min(255, Math.abs(v) * 900);
    }
  col.getContext("2d")!.putImageData(ci, 0, 0);
  nor.getContext("2d")!.putImageData(ni, 0, 0);
  const map = new THREE.CanvasTexture(col), normalMap = new THREE.CanvasTexture(nor);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = normalMap.anisotropy = 4;
  return { map, normalMap };
}

// An Apollo boot print: a rounded sole with the deep cross-bar tread you see in Buzz Aldrin's famous photo.
const bootTexture = () =>
  relief(64, 128, (x, y) => {
    const inSole = (cx: number, cy: number, rx: number, ry: number) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
    const d = Math.min(inSole(32, 36, 22, 30), inSole(32, 96, 18, 26), x > 14 && x < 50 && y > 36 && y < 96 ? 0 : 9);
    if (d <= 1) {
      const bar = (y % 9) < 3.5 ? 1 : 0; // the soil left standing between the sole's grooves
      return -1 + 0.55 * bar + 0.25 * d;
    }
    return d < 1.35 ? 0.3 * (1 - (d - 1) / 0.35) : 0; // a little rim of pushed-out dust
  }, 3.2);

// One wheel's track: a shallow groove with the chevron tread pressed into it (LRV titanium chevrons, MER cleats).
const treadTexture = () =>
  relief(32, 64, (x, y) => {
    if (x < 3 || x > 28) return x < 1 || x > 30 ? 0 : 0.2;
    const v = (y + Math.abs(x - 16) * 0.45) % 16;
    return -0.8 + (v < 4 ? 0.5 : 0);
  }, 2.6);

type Print = { x: number; z: number; yaw: number; w: number; l: number };

// Points every `step` metres along a polyline, with the heading at each.
function along(path: [number, number][], step: number) {
  const out: { x: number; z: number; yaw: number }[] = [];
  let carry = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, az] = path[i], [bx, bz] = path[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const yaw = Math.atan2(bx - ax, bz - az);
    for (let d = carry; d < len; d += step) out.push({ x: ax + ((bx - ax) * d) / len, z: az + ((bz - az) * d) / len, yaw });
    carry = (carry - len) % step;
    if (carry < 0) carry += step;
  }
  return out;
}

function prints(marks: Mark[], kind: Mark["kind"]) {
  const list: Print[] = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);
  for (const m of marks) {
    if (m.kind !== kind) continue;
    if (kind === "boots") {
      // Two astronauts' worth of loping steps: left, right, a little untidy.
      along(m.path, 0.8).forEach((p, i) => {
        const side = i % 2 ? 0.14 : -0.14;
        list.push({ x: p.x + Math.cos(p.yaw) * side + rnd() * 0.08, z: p.z - Math.sin(p.yaw) * side + rnd() * 0.08, yaw: p.yaw + rnd() * 0.25, w: 0.16, l: 0.33 });
      });
    } else {
      const gauge = (m.gauge ?? 1.8) / 2, w = m.width ?? 0.23;
      for (const p of along(m.path, 0.5))
        for (const s of [-gauge, gauge]) list.push({ x: p.x + Math.cos(p.yaw) * s, z: p.z - Math.sin(p.yaw) * s, yaw: p.yaw, w, l: 0.52 });
    }
  }
  return list;
}

function Layer({ list, texture, ground }: { list: Print[]; texture: Relief; ground: (x: number, z: number) => number }) {
  const mesh = useMemo(() => {
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ map: texture.map, normalMap: texture.normalMap, normalScale: new THREE.Vector2(1.6, 1.6), transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 });
    const m = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
    const o = new THREE.Object3D();
    list.forEach((p, i) => {
      o.position.set(p.x, ground(p.x, p.z) + 0.012, p.z);
      o.rotation.set(0, p.yaw, 0);
      o.scale.set(p.w, 1, p.l);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.count = list.length;
    m.receiveShadow = true;
    return m;
  }, [list, texture, ground]);
  useEffect(
    () => () => {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    },
    [mesh],
  );
  return <primitive object={mesh} />;
}

export function GroundMarks({ marks, ground }: { marks: Mark[]; ground: (x: number, z: number) => number }) {
  const tex = useMemo(() => ({ boots: bootTexture(), tracks: treadTexture() }), []);
  useEffect(() => () => Object.values(tex).forEach((t) => (t.map.dispose(), t.normalMap.dispose())), [tex]);
  const boots = useMemo(() => prints(marks, "boots"), [marks]);
  const tracks = useMemo(() => prints(marks, "tracks"), [marks]);
  return (
    <>
      {boots.length > 0 && <Layer list={boots} texture={tex.boots} ground={ground} />}
      {tracks.length > 0 && <Layer list={tracks} texture={tex.tracks} ground={ground} />}
    </>
  );
}

// Apollo 11's flag, lying where the ascent engine's blast knocked it over, its colours faded by 57 years of sunlight.
export function FallenFlag({ position, rotationY }: { position: [number, number, number]; rotationY: number }) {
  const { group, dispose } = useMemo(() => {
    // Drawn in the cloth's own frame on the ground: canvas top = the hoist (along the pole), canvas right = the
    // top edge (along the crossbar). So the stripes run down the canvas and the blue canton sits top-right.
    const W = 192, H = 320;
    const cloth = canvasTexture(W, H, (g) => {
      const sw = W / 13;
      for (let i = 0; i < 13; i++) {
        g.fillStyle = i % 2 ? "#ece6dc" : "#b8473b"; // stripe 0 (the top stripe) is red, at the right edge
        g.fillRect(W - (i + 1) * sw, 0, sw + 0.5, H);
      }
      const cw = sw * 7, ch = H * 0.4;
      g.fillStyle = "#33467e";
      g.fillRect(W - cw, 0, cw, ch);
      // 50 stars: 9 rows of 6 and 5, alternating.
      g.fillStyle = "#f4efe6";
      const star = (cx: number, cy: number, r: number) => {
        g.beginPath();
        for (let k = 0; k < 10; k++) {
          const a = -Math.PI / 2 + (k * Math.PI) / 5, rr = k % 2 ? r * 0.42 : r;
          g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
        }
        g.closePath();
        g.fill();
      };
      for (let row = 0; row < 9; row++) {
        const n = row % 2 ? 5 : 6;
        for (let c = 0; c < n; c++) {
          // Rows run along the fly (down the canvas), columns across the canton's height (right to left).
          const y = ((c * 2 + (row % 2 ? 2 : 1)) / 12) * ch;
          const x = W - ((row + 1) / 10) * cw;
          star(x, y, 4.2);
        }
      }
      // Half a century of unfiltered sunlight: the colours washed out, strongest where it faces up.
      g.fillStyle = "rgba(248,244,236,0.4)";
      g.fillRect(0, 0, W, H);
      // Moon dust thrown up by the blast and settled since: grey-brown, patchy, thicker toward the fly end and edges.
      let seed = 11;
      const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      const dust = g.createLinearGradient(0, 0, 0, H);
      dust.addColorStop(0, "rgba(120,114,104,0.08)");
      dust.addColorStop(1, "rgba(120,114,104,0.38)");
      g.fillStyle = dust;
      g.fillRect(0, 0, W, H);
      for (let i = 0; i < 70; i++) {
        const x = rnd() * W, y = H * Math.pow(rnd(), 0.6), r = 6 + rnd() * 26;
        const blot = g.createRadialGradient(x, y, 0, x, y, r);
        blot.addColorStop(0, `rgba(112,106,97,${(0.18 + rnd() * 0.25).toFixed(2)})`);
        blot.addColorStop(1, "rgba(112,106,97,0)");
        g.fillStyle = blot;
        g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      for (let i = 0; i < 900; i++) {
        g.fillStyle = `rgba(${rnd() < 0.5 ? "90,86,80" : "160,154,145"},${(0.15 + rnd() * 0.3).toFixed(2)})`;
        g.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 1.5, 1 + rnd() * 1.5);
      }
    });
    const grp = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: "#c9c6c0", metalness: 0.6, roughness: 0.4 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 2.3, 8).rotateZ(Math.PI / 2), metal);
    pole.position.set(0, 0.03, 0);
    // The top crossbar that held the flag out (there is no wind on the Moon).
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.5, 8), metal);
    bar.position.set(1.05, 0.04, 0.75);
    bar.rotation.set(Math.PI / 2, 0, 0);
    const clothMat = new THREE.MeshStandardMaterial({ map: cloth, roughness: 0.95, side: THREE.DoubleSide });
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.5, 8, 12).rotateX(-Math.PI / 2), clothMat);
    // A few soft wrinkles where it fell.
    const pos = flag.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, 0.02 + 0.03 * Math.sin(pos.getX(i) * 9) * Math.cos(pos.getZ(i) * 5));
    flag.geometry.computeVertexNormals();
    flag.position.set(0.6, 0, 0.75);
    for (const m of [pole, bar, flag]) {
      m.castShadow = true;
      m.receiveShadow = true;
      grp.add(m);
    }
    return { group: grp, dispose: () => [cloth, metal, clothMat, pole.geometry, bar.geometry, flag.geometry].forEach((x) => x.dispose()) };
  }, []);
  useEffect(() => dispose, [dispose]);
  return <primitive object={group} position={position} rotation={[0, rotationY, 0]} />;
}
