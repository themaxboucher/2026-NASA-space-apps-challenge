"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";
import { smooth } from "../lib/geo";
import { live, openHotspot, spotEls, spotKey, tour } from "../state";
import type { Hotspot, Stop } from "../stops";
import type { Anchors } from "./Machine";

const toCam = new THREE.Vector3();
const projected = new THREE.Vector3();

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
    for (const { spot, pos, face, reach } of placed) {
      const el = spotEls.get(spotKey(stop.id, spot.id));
      if (!el) continue;
      const d = camera.position.distanceTo(pos);
      projected.copy(pos).project(camera);
      let shown = s.phase === "explore" && d < reach && projected.z < 1;
      if (shown && face) shown = toCam.copy(camera.position).sub(pos).dot(face) > -0.15;
      const a = shown ? smooth((reach - d) / 6) : 0;
      const x = ((projected.x + 1) / 2) * size.width;
      const y = ((1 - projected.y) / 2) * size.height;
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      el.style.opacity = a.toFixed(3);
      el.style.visibility = a > 0.01 ? "visible" : "hidden";
      el.style.pointerEvents = a > 0.3 ? "auto" : "none";
      // Keep the card on the side of the marker with more room.
      el.dataset.side = x > size.width * 0.6 ? "left" : "right";
      el.dataset.low = y > size.height * 0.62 ? "1" : "0";
      const open = s.openSpot === spot.id;
      if (open && (d > 9 + Math.min(20, reach / 10) || !shown)) openHotspot(stop.id, null);
      if (open && spot.broken) target = 1.6;
    }
    live.brokenGlow += (target - live.brokenGlow) * 0.08;
  });

  return null;
}
