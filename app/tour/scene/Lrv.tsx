"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { skyDir } from "../lib/geo";
import { wireTexture } from "./textures";

// The Apollo 15 Lunar Roving Vehicle, built from simple shapes at its real size (NASA NSSDCA figures):
// a 3.1 m frame, 2.3 m wheelbase, 81.8 cm wire-mesh wheels 23 cm wide, and a 1.14 m maximum height.
// It faces west (-x), its TV camera aimed at Falcon, and its dish points at Earth (south, 64 degrees up).

const WHEEL_R = 0.409;
const WHEEL_W = 0.23;
const BASE = 2.3 / 2;
const TRACK = 1.83 / 2;

function Box({ size, pos, mat, rot }: { size: [number, number, number]; pos: [number, number, number]; mat: THREE.Material; rot?: [number, number, number] }) {
  return (
    <mesh position={pos} rotation={rot} material={mat} castShadow receiveShadow>
      <boxGeometry args={size} />
    </mesh>
  );
}

function Rod({ from, to, r, mat }: { from: [number, number, number]; to: [number, number, number]; r: number; mat: THREE.Material }) {
  const { pos, quat, len } = useMemo(() => {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const d = b.clone().sub(a);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
    return { pos: a.add(b).multiplyScalar(0.5), quat: q, len: d.length() };
  }, [from, to]);
  return (
    <mesh position={pos} quaternion={quat} material={mat} castShadow>
      <cylinderGeometry args={[r, r, len, 8]} />
    </mesh>
  );
}

export function Lrv() {
  const m = useMemo(() => {
    const wire = wireTexture();
    const tire = wire.clone();
    tire.repeat.set(3, 1);
    tire.needsUpdate = true;
    const mesh = wire.clone();
    mesh.repeat.set(4, 4);
    mesh.wrapT = THREE.RepeatWrapping;
    mesh.needsUpdate = true;
    return {
      frame: new THREE.MeshStandardMaterial({ color: "#b9b9b3", metalness: 0.65, roughness: 0.42 }),
      dark: new THREE.MeshStandardMaterial({ color: "#2b2b2d", metalness: 0.3, roughness: 0.6 }),
      white: new THREE.MeshStandardMaterial({ color: "#e7e4dc", roughness: 0.62 }),
      fender: new THREE.MeshStandardMaterial({ color: "#9fa6ad", roughness: 0.55, side: THREE.DoubleSide }),
      webbing: new THREE.MeshStandardMaterial({ color: "#cfcac0", roughness: 0.9 }),
      mirror: new THREE.MeshStandardMaterial({ color: "#dfe6ea", metalness: 1, roughness: 0.08 }),
      tire: new THREE.MeshStandardMaterial({ color: "#d8d6d0", metalness: 0.7, roughness: 0.35, map: tire, alphaMap: tire, alphaTest: 0.35, side: THREE.DoubleSide }),
      dish: new THREE.MeshStandardMaterial({ color: "#d9d6cc", metalness: 0.6, roughness: 0.4, alphaMap: mesh, alphaTest: 0.3, side: THREE.DoubleSide }),
      lens: new THREE.MeshStandardMaterial({ color: "#0c0c10", metalness: 0.2, roughness: 0.15 }),
    };
  }, []);

  const dish = useMemo(() => {
    // A shallow parabolic umbrella, 0.9 m across.
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= 12; i++) {
      const r = (i / 12) * 0.45;
      pts.push(new THREE.Vector2(r, (r * r) / (4 * 0.34)));
    }
    const g = new THREE.LatheGeometry(pts, 32);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), skyDir(187, 63.6));
    return { g, q };
  }, []);

  const wheels: [number, number][] = [
    [-BASE, -TRACK],
    [-BASE, TRACK],
    [BASE, -TRACK],
    [BASE, TRACK],
  ];

  return (
    <group>
      {/* Chassis: forward, center and aft sections. */}
      <Box size={[0.95, 0.08, 1.05]} pos={[-1.05, 0.58, 0]} mat={m.frame} />
      <Box size={[1.4, 0.06, 1.15]} pos={[0.05, 0.6, 0]} mat={m.frame} />
      <Box size={[0.8, 0.08, 1.05]} pos={[1.15, 0.58, 0]} mat={m.frame} />
      <Rod from={[-1.55, 0.6, 0.55]} to={[1.55, 0.6, 0.55]} r={0.025} mat={m.frame} />
      <Rod from={[-1.55, 0.6, -0.55]} to={[1.55, 0.6, -0.55]} r={0.025} mat={m.frame} />

      {/* Wheels, suspension arms and fenders. */}
      {wheels.map(([x, z], i) => (
        <group key={i} position={[x, WHEEL_R, z]}>
          <mesh rotation={[Math.PI / 2, 0, 0]} material={m.tire} castShadow>
            <cylinderGeometry args={[WHEEL_R, WHEEL_R, WHEEL_W, 48, 1, true]} />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]} material={m.dark}>
            <cylinderGeometry args={[WHEEL_R * 0.72, WHEEL_R * 0.72, WHEEL_W * 0.7, 24, 1, true]} />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, z > 0 ? -0.08 : 0.08]} material={m.frame} castShadow>
            <cylinderGeometry args={[0.16, 0.16, 0.06, 20]} />
          </mesh>
          {/* After the quarter turn, theta = PI is the top of the wheel; the fender arcs over it. */}
          <mesh rotation={[Math.PI / 2, 0, 0]} material={m.fender} castShadow>
            <cylinderGeometry args={[WHEEL_R + 0.06, WHEEL_R + 0.06, WHEEL_W + 0.05, 24, 1, true, Math.PI * 0.58, Math.PI * 0.84]} />
          </mesh>
          <Rod from={[0, 0.02, z > 0 ? -0.1 : 0.1]} to={[x > 0 ? -0.35 : 0.35, 0.2, z > 0 ? -0.36 : 0.36]} r={0.03} mat={m.frame} />
        </group>
      ))}

      {/* Batteries on the forward chassis, with mirrored radiator tops. */}
      {[-0.22, 0.22].map((z) => (
        <group key={z}>
          <Box size={[0.36, 0.12, 0.22]} pos={[-0.95, 0.68, z]} mat={m.white} />
          <Box size={[0.3, 0.012, 0.18]} pos={[-0.95, 0.746, z]} mat={m.mirror} />
        </group>
      ))}

      {/* Seats with webbing, and the T-handle hand controller between them. */}
      {[-0.3, 0.3].map((z) => (
        <group key={z} position={[0.15, 0, z]}>
          <Box size={[0.46, 0.03, 0.42]} pos={[0, 0.76, 0]} mat={m.webbing} />
          <Box size={[0.03, 0.42, 0.42]} pos={[0.24, 0.98, 0]} rot={[0, 0, -0.18]} mat={m.webbing} />
          <Rod from={[-0.22, 0.62, 0.2]} to={[-0.22, 0.76, 0.2]} r={0.015} mat={m.frame} />
          <Rod from={[-0.22, 0.62, -0.2]} to={[-0.22, 0.76, -0.2]} r={0.015} mat={m.frame} />
          <Rod from={[-0.75, 0.62, 0]} to={[-0.85, 0.66, 0]} r={0.02} mat={m.frame} />
        </group>
      ))}
      <Rod from={[-0.25, 0.62, 0]} to={[-0.25, 0.86, 0]} r={0.018} mat={m.dark} />
      <Rod from={[-0.25, 0.86, -0.07]} to={[-0.25, 0.86, 0.07]} r={0.02} mat={m.dark} />

      {/* Control console. */}
      <Rod from={[-0.55, 0.62, 0]} to={[-0.6, 0.92, 0]} r={0.025} mat={m.frame} />
      <Box size={[0.07, 0.26, 0.34]} pos={[-0.6, 1.02, 0]} rot={[0, 0, -0.35]} mat={m.dark} />

      {/* Lunar Communications Relay Unit, its umbrella dish, and the low-gain antenna. */}
      <Box size={[0.26, 0.3, 0.42]} pos={[-1.38, 0.8, 0.05]} mat={m.white} />
      <Rod from={[-1.45, 0.95, 0.12]} to={[-1.43, 1.78, 0.12]} r={0.02} mat={m.frame} />
      <mesh geometry={dish.g} material={m.dish} position={[-1.43, 1.8, 0.12]} quaternion={dish.q} castShadow />
      <Rod from={[-1.32, 0.95, -0.12]} to={[-1.32, 1.58, -0.12]} r={0.022} mat={m.dark} />

      {/* The TV camera Houston steered by remote control, looking west toward Falcon. */}
      <Rod from={[-1.5, 0.62, -0.3]} to={[-1.56, 1.16, -0.3]} r={0.022} mat={m.frame} />
      <Box size={[0.32, 0.15, 0.17]} pos={[-1.6, 1.24, -0.3]} mat={m.white} />
      <mesh position={[-1.79, 1.24, -0.3]} rotation={[0, 0, Math.PI / 2]} material={m.lens} castShadow>
        <cylinderGeometry args={[0.05, 0.065, 0.08, 16]} />
      </mesh>

      {/* Aft tool carrier with a few geology tools. */}
      <Box size={[0.3, 0.42, 0.72]} pos={[1.42, 0.86, 0]} mat={m.frame} />
      <Rod from={[1.6, 0.7, -0.25]} to={[1.66, 1.35, -0.27]} r={0.012} mat={m.dark} />
      <Rod from={[1.6, 0.7, 0.2]} to={[1.68, 1.28, 0.22]} r={0.012} mat={m.frame} />
    </group>
  );
}
