"use client";

import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

// Saturn's seven big moons, in their real orbits in the ring plane (distances in Saturn radii), at true size
// relative to Saturn: tiny dots from Cassini. Hover over one (or aim the crosshair at it while looking around)
// to see its name.
const SATURN_KM = 60268;
const MOONS: { name: string; dist: number; km: number; angle: number; color: string; note: string }[] = [
  { name: "Mimas", dist: 3.08, km: 198, angle: 0.5, color: "#bdbab4", note: "has a giant crater" },
  { name: "Enceladus", dist: 3.95, km: 252, angle: 2.1, color: "#f4f8ff", note: "sprays ice from an ocean under its crust" },
  { name: "Tethys", dist: 4.89, km: 531, angle: 3.6, color: "#d9d7d2", note: "" },
  { name: "Dione", dist: 6.26, km: 561, angle: 5.2, color: "#cfcbc4", note: "" },
  { name: "Rhea", dist: 8.74, km: 764, angle: 1.2, color: "#c8c4bd", note: "" },
  { name: "Titan", dist: 20.27, km: 2575, angle: 4.3, color: "#d9a35b", note: "has thick orange haze, lakes and Huygens" },
  { name: "Iapetus", dist: 59.1, km: 735, angle: 2.8, color: "#a89a86", note: "is half dark, half bright" },
];

// `radius`: Saturn's radius in this group's units. The group is Saturn's own frame (its equator is local XZ).
// `squeeze` < 1 pulls the orbits in (distance^squeeze), for the compressed solar-system map.
export function SaturnMoons({ radius, squeeze = 1 }: { radius: number; squeeze?: number }) {
  const { camera, gl } = useThree();
  const [hover, setHover] = useState(-1);
  const meshes = useRef<(THREE.Mesh | null)[]>([]);
  const mouse = useRef<{ x: number; y: number } | null>(null);
  const items = useMemo(
    () =>
      MOONS.map((m) => {
        const r = Math.max(m.km / SATURN_KM, 0.0025) * radius; // true size (a floor keeps the smallest a dot)
        const p = new THREE.Vector3(Math.cos(m.angle), 0, Math.sin(m.angle)).multiplyScalar(Math.pow(m.dist, squeeze) * radius);
        // Iapetus: one hemisphere dark as coal, the other bright as snow.
        const geo = new THREE.SphereGeometry(r, 32, 16);
        if (m.name === "Iapetus") {
          const c = new Float32Array(geo.attributes.position.count * 3);
          for (let i = 0; i < geo.attributes.position.count; i++) {
            const v = geo.attributes.position.getX(i) > 0 ? 0.18 : 0.9;
            c.set([v, v * 0.95, v * 0.88], i * 3);
          }
          geo.setAttribute("color", new THREE.BufferAttribute(c, 3));
        }
        const mat = new THREE.MeshStandardMaterial({ color: m.name === "Iapetus" ? "#ffffff" : m.color, vertexColors: m.name === "Iapetus", roughness: 1 });
        return { ...m, r, p, geo, mat };
      }),
    [radius, squeeze],
  );
  useEffect(() => () => items.forEach((i) => (i.geo.dispose(), i.mat.dispose())), [items]);
  useEffect(() => {
    const el = gl.domElement;
    const move = (e: PointerEvent) => {
      const b = el.getBoundingClientRect();
      mouse.current = { x: e.clientX - b.left, y: e.clientY - b.top };
    };
    el.addEventListener("pointermove", move);
    return () => el.removeEventListener("pointermove", move);
  }, [gl]);

  // Nearest moon within 26 px of the pointer (or of the screen centre while the mouse is locked for looking).
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const w = gl.domElement.clientWidth, h = gl.domElement.clientHeight;
    const at = document.pointerLockElement ? { x: w / 2, y: h / 2 } : mouse.current;
    let best = -1, bestD = 26;
    if (at)
      meshes.current.forEach((m, i) => {
        if (!m) return;
        m.getWorldPosition(v).project(camera);
        if (v.z > 1) return;
        const d = Math.hypot((v.x + 1) * 0.5 * w - at.x, (1 - v.y) * 0.5 * h - at.y);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
    if (best !== hover) setHover(best);
  });

  return (
    <group>
      {items.map((m, i) => (
        <mesh key={m.name} ref={(el) => void (meshes.current[i] = el)} position={m.p} geometry={m.geo} material={m.mat}>
          {hover === i && (
            <Html center style={{ pointerEvents: "none" }} zIndexRange={[60, 50]}>
              <span className="moon-label">
                <b>{m.name}</b>
                {m.note && <span> · {m.note}</span>}
              </span>
            </Html>
          )}
        </mesh>
      ))}
    </group>
  );
}
