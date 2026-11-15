"use client";

import { useTexture } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { rng } from "../lib/geo";
import { live, type BodyKey } from "../state";
import { Earth } from "./Earth";
import { ceresTexture, dotTexture, glowTexture, jupiterTexture, mercuryTexture, neptuneTexture, plutoTexture, RING_INNER, RING_OUTER, ringTexture, rockTexture, saturnTexture, uranusTexture, venusTexture } from "./textures";

// Travel-scene sizes: roughly to scale between the giants and between the small worlds (Pluto is drawn a bit larger).
export const BODY_RADIUS: Record<BodyKey, number> = { earth: 1, moon: 0.6, mars: 0.75, saturn: 2.6, jupiter: 3, venus: 0.95, mercury: 0.4, uranus: 1.1, neptune: 1.05, pluto: 0.3, ceres: 0.25, rock: 0.2 };
export const TEXTURE: Partial<Record<BodyKey, string>> = { earth: "/tex/earth.jpg", moon: "/tex/moon.jpg", mars: "/tex/mars.jpg" };

// Stars on a big sphere that travels with the camera, so they look infinitely far away.
export function Stars({ radius = 900, count = 2600 }: { radius?: number; count?: number }) {
  const group = useRef<THREE.Group>(null);
  const { camera } = useThree();
  const [faint, bright] = useMemo(() => {
    // Real skies: each brighter magnitude has about 3x fewer stars (N(<m) ~ 10^(0.48 m)), so most stars sit near
    // the limit and look faint, and only a handful are bright. maxMag caps the brightest star a set may hold.
    const make = (n: number, seed: number, band: boolean, maxMag: number) => {
      const rand = rng(seed);
      const pos = new Float32Array(n * 3);
      const col = new Float32Array(n * 3);
      const v = new THREE.Vector3();
      for (let i = 0; i < n; i++) {
        if (band && i % 2 === 0) {
          // A Milky Way-ish band: extra stars crowded near one great circle.
          const a = rand() * Math.PI * 2;
          const lat = (rand() + rand() + rand() - 1.5) * 0.22;
          v.set(Math.cos(a) * Math.cos(lat), Math.sin(lat), Math.sin(a) * Math.cos(lat));
          v.applyAxisAngle(new THREE.Vector3(1, 0, 0.3).normalize(), 1.05);
        } else {
          v.set(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1);
          if (v.lengthSq() > 1 || v.lengthSq() < 1e-4) {
            i--;
            continue;
          }
          v.normalize();
        }
        v.multiplyScalar(radius);
        pos.set([v.x, v.y, v.z], i * 3);
        const lim = 6.5;
        const m = Math.max(maxMag, lim + Math.log10(Math.max(rand(), 1e-6)) / 0.48);
        const b = Math.min(1, 0.07 + 0.93 * Math.min(1, Math.pow(10, -0.4 * (m - lim)) / 60));
        const t = rand();
        col.set([b * (t < 0.15 ? 0.8 : 1), b * (t < 0.15 ? 0.88 : t > 0.85 ? 0.92 : 1), b * (t > 0.85 ? 0.78 : 1)], i * 3);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      return g;
    };
    // Faint set: the many dim stars. Bright set: only the few first- and second-magnitude stars, drawn larger.
    return [make(count, 11, true, 2.5), make(Math.max(8, Math.round(count / 60)), 29, false, -1.4)];
  }, [radius, count]);
  const [faintMat, brightMat] = useMemo(() => {
    const base = { map: dotTexture(), vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: false, blending: THREE.AdditiveBlending };
    return [new THREE.PointsMaterial({ ...base, size: 1.9 }), new THREE.PointsMaterial({ ...base, size: 3.4 })];
  }, []);
  useFrame(() => group.current?.position.copy(camera.position));
  return (
    <group ref={group}>
      <points geometry={faint} material={faintMat} renderOrder={-10} frustumCulled={false} />
      <points geometry={bright} material={brightMat} renderOrder={-10} frustumCulled={false} />
    </group>
  );
}

// Light streaks around the camera that stretch with speed: the "cruise" feeling between worlds.
export function Streaks({ scale = 1 }: { scale?: number }) {
  const { camera } = useThree();
  const group = useRef<THREE.Group>(null);
  const n = 420;
  const state = useMemo(() => {
    const rand = rng(5);
    const seeds = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2;
      const r = (0.6 + rand() * 7) * scale;
      seeds.set([Math.cos(a) * r, Math.sin(a) * r, (-rand() * 60 + 4) * scale], i * 3);
    }
    const pos = new Float32Array(n * 6);
    const col = new Float32Array(n * 6);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    return { seeds, g, mat };
  }, [scale]);
  useFrame((_, dt) => {
    const k = live.streak;
    const g = group.current;
    if (!g) return;
    g.visible = k > 0.01;
    if (!g.visible) return;
    g.position.copy(camera.position);
    g.quaternion.copy(camera.quaternion);
    const { seeds } = state;
    const pos = state.g.attributes.position as THREE.BufferAttribute;
    const col = state.g.attributes.color as THREE.BufferAttribute;
    const speed = k * 160 * scale;
    const len = (0.2 + k * k * 14) * scale;
    for (let i = 0; i < n; i++) {
      let z = seeds[i * 3 + 2] + speed * dt;
      if (z > 4 * scale) z -= 64 * scale;
      seeds[i * 3 + 2] = z;
      const x = seeds[i * 3];
      const y = seeds[i * 3 + 1];
      pos.setXYZ(i * 2, x, y, z);
      pos.setXYZ(i * 2 + 1, x, y, z - len);
      const b = Math.min(1, k * 1.4) * (0.55 + ((i * 37) % 10) / 22);
      col.setXYZ(i * 2, b, b, b * 1.05);
      col.setXYZ(i * 2 + 1, 0, 0, 0);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
  });
  return (
    <group ref={group}>
      <lineSegments geometry={state.g} material={state.mat} frustumCulled={false} />
    </group>
  );
}

// A soft sprite glow for the Sun, placed far away in its direction.
export function SunGlow({ dir, distance, size, intensity = 1 }: { dir: THREE.Vector3; distance: number; size: number; intensity?: number }) {
  const mat = useMemo(
    () => new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(1, 0.97, 0.9).multiplyScalar(intensity), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
    [intensity],
  );
  const group = useRef<THREE.Group>(null);
  const { camera } = useThree();
  useFrame(() => group.current?.position.copy(camera.position));
  return (
    <group ref={group}>
      <sprite material={mat} position={dir.clone().multiplyScalar(distance)} scale={[size, size, 1]} renderOrder={-5} />
    </group>
  );
}

// A thin glowing shell: bright right at the limb and fading out, computed from the true ray distance to the planet.
export function Atmosphere({ radius, color, thickness = 0.09, strength = 1.2, sun }: { radius: number; color: string; thickness?: number; strength?: number; sun: THREE.Vector3 }) {
  const ref = useRef<THREE.Mesh>(null);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color(color) },
          uSun: { value: sun.clone().normalize() },
          uCenter: { value: new THREE.Vector3() },
          uR: { value: radius },
          uH: { value: radius * thickness },
          uStrength: { value: strength },
        },
        vertexShader: /* glsl */ `
          varying vec3 vWorld;
          void main() {
            vec4 w = modelMatrix * vec4(position, 1.0);
            vWorld = w.xyz;
            gl_Position = projectionMatrix * viewMatrix * w;
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor; uniform vec3 uSun; uniform vec3 uCenter; uniform float uR; uniform float uH; uniform float uStrength;
          varying vec3 vWorld;
          void main() {
            vec3 rd = normalize(vWorld - cameraPosition);
            vec3 oc = uCenter - cameraPosition;
            float along = dot(oc, rd);
            vec3 closest = cameraPosition + rd * along;
            float b = length(closest - uCenter);
            float k = 1.0 - clamp((b - uR) / uH, 0.0, 1.0);
            if (b < uR) k = 1.0;
            float day = smoothstep(-0.35, 0.45, dot(normalize(closest - uCenter), uSun));
            float a = pow(k, 3.0) * (0.12 + 0.88 * day) * uStrength;
            gl_FragColor = vec4(uColor * a, a);
          }`,
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [color, sun, radius, thickness, strength],
  );
  useFrame(() => {
    if (ref.current) ref.current.getWorldPosition(mat.uniforms.uCenter.value);
  });
  return (
    <mesh ref={ref} material={mat} scale={1 + thickness}>
      <sphereGeometry args={[radius, 64, 32]} />
    </mesh>
  );
}

// A soft rim haze on the planet's face, brightest at the edge of the disc.
function Haze({ radius, color, sun }: { radius: number; color: string; sun: THREE.Vector3 }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(color) }, uSun: { value: sun.clone().normalize() } },
        vertexShader: /* glsl */ `
          varying vec3 vN; varying vec3 vW;
          void main() {
            vec4 w = modelMatrix * vec4(position, 1.0);
            vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
            gl_Position = projectionMatrix * viewMatrix * w;
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor; uniform vec3 uSun; varying vec3 vN; varying vec3 vW;
          void main() {
            vec3 v = normalize(cameraPosition - vW);
            float rim = pow(1.0 - max(dot(vN, v), 0.0), 2.6);
            float day = smoothstep(-0.25, 0.5, dot(vN, uSun));
            float a = rim * day * 0.85;
            gl_FragColor = vec4(uColor * a, a);
          }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [color, sun],
  );
  return (
    <mesh material={mat}>
      <sphereGeometry args={[radius * 1.004, 64, 32]} />
    </mesh>
  );
}

// Moon: NASA SVS CGI Moon Kit (LRO LROC WAC colour + LOLA elevation), public domain, https://svs.gsfc.nasa.gov/4720
// Mars: USGS Astrogeology Viking MDIM 2.1 colour mosaic + MGS MOLA MEGDR 16 px/deg elevation, public domain.
// The normal maps are derived from the elevation (relief exaggerated about 4x on the Moon, 2.5x on Mars).
export const NORMAL: Partial<Record<BodyKey, string>> = { moon: "/tex/moon-normal.jpg", mars: "/tex/mars-normal.jpg" };

function TexturedGlobe({ url, normalUrl, radius }: { url: string; normalUrl: string; radius: number }) {
  const [tex, normal] = useTexture([url, normalUrl]);
  const { gl } = useThree();
  const material = useMemo(() => new THREE.MeshStandardMaterial({ map: tex, normalMap: normal, roughness: 1, metalness: 0 }), [tex, normal]);
  useLayoutEffect(() => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
    tex.needsUpdate = true;
  }, [tex, gl]);
  return (
    <mesh material={material}>
      <sphereGeometry args={[radius, 96, 48]} />
    </mesh>
  );
}

function SaturnGlobe({ radius, sun }: { radius: number; sun: THREE.Vector3 }) {
  const ring = useMemo(() => {
    const g = new THREE.RingGeometry(radius * RING_INNER, radius * RING_OUTER, 180, 1);
    const p = g.attributes.position as THREE.BufferAttribute;
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const r = Math.hypot(p.getX(i), p.getY(i)) / radius;
      uv.setXY(i, (r - RING_INNER) / (RING_OUTER - RING_INNER), 0.5);
    }
    return g;
  }, [radius]);
  const ringMat = useMemo(() => new THREE.MeshStandardMaterial({ map: ringTexture(), transparent: true, side: THREE.DoubleSide, roughness: 0.9, depthWrite: false }), []);
  const bodyMat = useMemo(() => new THREE.MeshStandardMaterial({ map: saturnTexture(), roughness: 1 }), []);
  return (
    // Saturn's axis is tilted about 26.7 degrees; its rings lie in its equator.
    <group rotation={[0.47, 0, 0.12]}>
      <mesh material={bodyMat} scale={[1, 0.902, 1]}>
        <sphereGeometry args={[radius, 96, 48]} />
      </mesh>
      <mesh geometry={ring} material={ringMat} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2} />
      <Haze radius={radius} color="#f3dcae" sun={sun} />
    </group>
  );
}

// The worlds drawn in code (textures.ts): their map, the haze at their edge, and their axial tilt in radians.
const DRAWN: Partial<Record<BodyKey, { map: () => THREE.Texture; haze?: string; tilt?: number; squash?: number }>> = {
  jupiter: { map: jupiterTexture, haze: "#f0dcb8", tilt: 0.05, squash: 0.935 },
  venus: { map: venusTexture, haze: "#f6e7bf" },
  uranus: { map: uranusTexture, haze: "#cdf4f6", tilt: 1.71 }, // knocked onto its side: 98 degrees
  neptune: { map: neptuneTexture, haze: "#8fb0ff", tilt: 0.49 },
  mercury: { map: mercuryTexture },
  pluto: { map: plutoTexture, tilt: 0.3 },
  ceres: { map: ceresTexture },
  rock: { map: rockTexture, squash: 0.7 },
};

function DrawnGlobe({ kind, radius, sun }: { kind: BodyKey; radius: number; sun: THREE.Vector3 }) {
  const d = DRAWN[kind]!;
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ map: d.map(), roughness: 1, metalness: 0 }), [d]);
  // Uranus's faint, dark rings: thin and hard to see, as in Voyager 2's pictures.
  const ring = useMemo(() => (kind === "uranus" ? new THREE.RingGeometry(radius * 1.6, radius * 2, 96, 1) : null), [kind, radius]);
  return (
    <group rotation={[0, 0, d.tilt ?? 0]}>
      <group scale={[1, d.squash ?? 1, 1]}>
        <mesh material={mat}>
          <sphereGeometry args={[radius, 96, 48]} />
        </mesh>
        {d.haze && <Haze radius={radius} color={d.haze} sun={sun} />}
      </group>
      {ring && (
        <mesh geometry={ring} rotation={[-Math.PI / 2, 0, 0]}>
          <meshBasicMaterial color="#8a9aa0" transparent opacity={0.12} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

export function Planet({ kind, sun, spin = false }: { kind: BodyKey; sun: THREE.Vector3; spin?: boolean }) {
  const radius = BODY_RADIUS[kind];
  const spinner = useRef<THREE.Group>(null);
  useFrame(() => {
    if (spin && spinner.current) spinner.current.rotation.y = live.time * ((Math.PI * 2) / 140);
  });
  if (kind === "saturn") return <SaturnGlobe radius={radius} sun={sun} />;
  if (DRAWN[kind]) return <DrawnGlobe kind={kind} radius={radius} sun={sun} />;
  return (
    <group>
      {kind === "earth" ? (
        <Earth radius={radius} sun={sun} spin={spin} />
      ) : (
        <group ref={spinner}>
          <TexturedGlobe url={TEXTURE[kind]!} normalUrl={NORMAL[kind]!} radius={radius} />
        </group>
      )}
      {kind === "earth" && (
        <>
          <Haze radius={radius} color="#6fa8ff" sun={sun} />
          <Atmosphere radius={radius} color="#5b9bff" thickness={0.1} strength={1.25} sun={sun} />
        </>
      )}
      {kind === "mars" && <Atmosphere radius={radius} color="#e0a46e" thickness={0.05} strength={0.55} sun={sun} />}
    </group>
  );
}
