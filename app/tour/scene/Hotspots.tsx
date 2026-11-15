"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";
import { smooth } from "../lib/geo";
import { arrowEls, hud, live, openHotspot, spotEls, spotKey, tour } from "../state";
import type { Hotspot, Stop } from "../stops";
import type { Anchors } from "./Machine";

const toCam = new THREE.Vector3();
const projected = new THREE.Vector3();
const inCam = new THREE.Vector3();
const EDGE = 34; // how far in from the screen edge the arrows sit, in px
const camFwd = new THREE.Vector3();
let mapRange = 20;

// Bottom-left minimap: you in the middle facing up, the machine, and every spot (unfound ones glow; ones out of
// range sit on the rim as arrows). It turns with you, so "up" on the map is always straight ahead.
let mapFont = ""; // the tour's mono face, read once from its CSS token
function drawMinimap(cv: HTMLCanvasElement, cam: THREE.Camera, stop: Stop, placed: Placed[], found: string[]) {
  const css = cv.clientWidth;
  if (!css) return;
  const dpr = Math.min(devicePixelRatio, 2), px = Math.round(css * dpr);
  if (cv.width !== px) cv.width = cv.height = px;
  const g = cv.getContext("2d")!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const R = css / 2, rim = R - 10;
  g.clearRect(0, 0, css, css);
  g.fillStyle = "rgba(18,21,27,0.88)"; // --panel
  g.beginPath(); g.arc(R, R, R - 1, 0, Math.PI * 2); g.fill();
  g.strokeStyle = "rgba(52,59,72,1)"; g.lineWidth = 1; g.stroke(); // --line2
  g.beginPath(); g.arc(R, R, rim / 2, 0, Math.PI * 2); g.strokeStyle = "rgba(35,40,51,1)"; g.stroke(); // --line

  camFwd.set(0, 0, -1).applyQuaternion(cam.quaternion);
  let fx = camFwd.x, fz = camFwd.z;
  const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
  const cx = cam.position.x, cz = cam.position.z;
  // Zoom so the farthest unfound spot fits (12–70 m across the radius), easing between stops.
  let want = 12;
  for (const p of placed) if (!found.includes(p.spot.id)) want = Math.max(want, Math.hypot(p.pos.x - cx, p.pos.z - cz) * 1.15);
  mapRange += (Math.min(70, want) - mapRange) * 0.05;
  const k = rim / mapRange;
  const toMap = (x: number, z: number) => {
    const dx = x - cx, dz = z - cz;
    return [R + (dx * -fz + dz * fx) * k, R - (dx * fx + dz * fz) * k] as const;
  };
  // North (−z) tick on the rim.
  const [nx, ny] = toMap(cx, cz - 1e6);
  const na = Math.atan2(ny - R, nx - R);
  g.fillStyle = "rgba(150,158,172,1)"; g.font = (mapFont ||= `500 10px ${getComputedStyle(cv).getPropertyValue("--mono").trim() || "monospace"}`); g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText("N", R + Math.cos(na) * (R - 6), R + Math.sin(na) * (R - 6));
  // The machine.
  g.fillStyle = "rgba(150,158,172,0.45)";
  for (const c of stop.colliders) {
    const [x, y] = toMap(c.pos[0], c.pos[2]);
    if (Math.hypot(x - R, y - R) > rim) continue;
    g.beginPath(); g.arc(x, y, Math.max(3, c.r * k), 0, Math.PI * 2); g.fill();
  }
  // Spots.
  const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 300);
  for (const { spot, pos } of placed) {
    const done = found.includes(spot.id);
    let [x, y] = toMap(pos.x, pos.z);
    const d = Math.hypot(x - R, y - R), out = d > rim;
    const col = spot.broken ? "240,68,56" : "77,148,255"; // --alarm, --signal
    if (out) {
      if (done) continue;
      const a = Math.atan2(y - R, x - R);
      x = R + Math.cos(a) * rim; y = R + Math.sin(a) * rim;
      g.save(); g.translate(x, y); g.rotate(a);
      g.fillStyle = `rgba(${col},${0.6 + 0.4 * pulse})`;
      g.beginPath(); g.moveTo(6, 0); g.lineTo(-4, -5); g.lineTo(-4, 5); g.closePath(); g.fill();
      g.restore();
      continue;
    }
    if (done) {
      g.fillStyle = `rgba(${col},0.45)`; g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill();
      continue;
    }
    g.fillStyle = `rgba(${col},${0.25 * pulse})`; g.beginPath(); g.arc(x, y, 8, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#fff"; g.strokeStyle = `rgb(${col})`; g.lineWidth = 2;
    g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill(); g.stroke();
  }
  // You: a triangle pointing straight ahead, with a faint view cone.
  g.fillStyle = "rgba(243,245,248,0.1)";
  g.beginPath(); g.moveTo(R, R); g.arc(R, R, rim * 0.6, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5); g.closePath(); g.fill();
  g.fillStyle = "#f3f5f8"; g.strokeStyle = "rgba(0,0,0,0.6)"; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(R, R - 8); g.lineTo(R - 6, R + 6); g.lineTo(R, R + 3); g.lineTo(R + 6, R + 6); g.closePath(); g.stroke(); g.fill();
}

type Placed = { spot: Hotspot; pos: THREE.Vector3; face: THREE.Vector3 | null; reach: number };

// Projects each hotspot onto the screen every frame and moves its DOM marker (rendered by the overlay) there.
// Markers fade with distance and hide when you walk around to the far side of the machine.
export function HotspotTracker({ stop, anchors, ground }: { stop: Stop; anchors: Anchors; ground?: (x: number, z: number) => number }) {
  const { camera, size } = useThree();
  const placed = useMemo(
    () =>
      stop.hotspots
        .map((spot): Placed | null => {
          const p = anchors[spot.id];
          if (!p) return null;
          const pos = p.clone();
          if ("pos" in spot.anchor && spot.anchor.ground && ground) pos.y += ground(pos.x, pos.z);
          let face: THREE.Vector3 | null = null;
          if (spot.face) face = new THREE.Vector3(...spot.face).normalize();
          else if (spot.face === undefined && pos.x * pos.x + pos.z * pos.z > 1e-4) face = new THREE.Vector3(pos.x, 0, pos.z).normalize();
          // Spots far from the machine (like Falcon, 130 m away) stay visible from farther off.
          return { spot, pos, face, reach: Math.max(26, Math.hypot(pos.x, pos.z) + 26) };
        })
        .filter((x): x is Placed => !!x),
    [stop, anchors, ground],
  );

  useFrame(() => {
    const s = tour.get();
    // The broken-part glow brightens while its card is open, then settles back down.
    let target = 0.6;
    // Arrows already placed this frame: spots in the same direction share one arrow instead of stacking.
    const shownArrows: [number, number][] = [];
    // The open story card (bottom left) has no panel of its own: a dot behind it would show through its text.
    const card = document.querySelector(".story > *")?.getBoundingClientRect();
    for (const { spot, pos, face, reach } of placed) {
      const el = spotEls.get(spotKey(stop.id, spot.id));
      if (!el) continue;
      const d = camera.position.distanceTo(pos);
      projected.copy(pos).project(camera);
      let shown = s.phase === "explore" && d < reach && projected.z < 1;
      if (shown && face) shown = toCam.copy(camera.position).sub(pos).dot(face) > -0.15;
      const x = ((projected.x + 1) / 2) * size.width;
      const y = ((1 - projected.y) / 2) * size.height;
      const behindCard = !!card && x + size.left > card.left - 20 && x + size.left < card.right + 20 && y + size.top > card.top - 20 && y + size.top < card.bottom + 20;
      const a = shown && !behindCard ? smooth((reach - d) / 6) : 0;
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      el.style.opacity = a.toFixed(3);
      el.style.visibility = a > 0.01 ? "visible" : "hidden";
      // Any dot you can see can be clicked (a faint, far one used to let the click through to the scene instead).
      el.style.pointerEvents = a > 0.01 ? "auto" : "none";
      // Keep the hover label on the side of the marker with more room.
      el.dataset.side = x > size.width * 0.6 ? "left" : "right";
      el.dataset.low = y > size.height * 0.62 ? "1" : "0";
      // Unfound and off-screen: an arrow on the screen edge points the way.
      const arrow = arrowEls.get(spotKey(stop.id, spot.id));
      if (arrow) {
        const off = projected.z >= 1 || Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1;
        if (s.phase === "explore" && off) {
          // Direction in camera space works for points behind you too (projection flips those).
          inCam.copy(pos).applyMatrix4(camera.matrixWorldInverse);
          const len = Math.hypot(inCam.x, inCam.y) || 1;
          const ux = inCam.x / len, uy = -inCam.y / len;
          const hw = size.width / 2 - EDGE, hh = size.height / 2 - EDGE;
          const t = Math.min(hw / Math.max(Math.abs(ux), 1e-6), hh / Math.max(Math.abs(uy), 1e-6));
          const ax = size.width / 2 + ux * t, ay = size.height / 2 + uy * t;
          const dup = shownArrows.some(([bx, by]) => Math.hypot(ax - bx, ay - by) < 40);
          if (!dup) shownArrows.push([ax, ay]);
          arrow.style.transform = `translate3d(${ax.toFixed(1)}px, ${ay.toFixed(1)}px, 0) rotate(${Math.atan2(uy, ux).toFixed(3)}rad)`;
          arrow.style.visibility = dup ? "hidden" : "visible";
        } else arrow.style.visibility = "hidden";
      }
      const open = s.openSpot === spot.id;
      // An open story stays open until its spot is behind you (the reader may be far from it, e.g. Falcon, 130 m).
      if (open && projected.z >= 1) openHotspot(stop.id, null);
      if (open && spot.broken) target = 1.6;
    }
    live.brokenGlow += (target - live.brokenGlow) * 0.08;
    if (hud.minimap && s.phase === "explore") drawMinimap(hud.minimap, camera, stop, placed, s.found[stop.id] ?? []);
  });

  return null;
}
