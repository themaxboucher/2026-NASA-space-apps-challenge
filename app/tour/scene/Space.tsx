"use client";

import { useTexture } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { rng } from "../lib/geo";
import { live, type BodyKey } from "../state";
import { dotTexture, glowTexture, RING_INNER, RING_OUTER, ringTexture, saturnTexture } from "./textures";

export const BODY_RADIUS: Record<BodyKey, number> = { earth: 1, moon: 0.6, mars: 0.75, saturn: 2.6 };
export const TEXTURE: Partial<Record<BodyKey, string>> = { earth: "/tex/earth.jpg", moon: "/tex/moon.jpg", mars: "/tex/mars.jpg" };

// Stars on a big sphere that travels with the camera, so they look infinitely far away.
export function Stars({ radius = 900, count = 2600 }: { radius?: number; count?: number }) {
  const group = useRef<THREE.Group>(null);
  const { camera } = useThree();
  const [faint, bright] = useMemo(() => {
    const make = (n: number, seed: number, band: boolean) => {
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
        const b = 0.25 + Math.pow(rand(), 2.5) * 0.75;
        const t = rand();
        col.set([b * (t < 0.15 ? 0.8 : 1), b * (t < 0.15 ? 0.88 : t > 0.85 ? 0.92 : 1), b * (t > 0.85 ? 0.78 : 1)], i * 3);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      return g;
    };
    return [make(count, 11, true), make(Math.round(count / 9), 29, false)];
  }, [radius, count]);
  const [faintMat, brightMat] = useMemo(() => {
    const base = { map: dotTexture(), vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: false, blending: THREE.AdditiveBlending };
    return [new THREE.PointsMaterial({ ...base, size: 2.4 }), new THREE.PointsMaterial({ ...base, size: 4.2 })];
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

function TexturedGlobe({ url, radius, ocean = false }: { url: string; radius: number; ocean?: boolean }) {
  const tex = useTexture(url);
  const { gl } = useThree();
  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0 });
    if (ocean) {
      // Blue Marble's oceans are nearly black: lift the dark tones a little, and let the dark (ocean) pixels
      // read as smooth in the roughness map, so the sea catches a glint of sunlight.
      m.roughnessMap = tex;
      m.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader
          .replace("#include <map_fragment>", "#include <map_fragment>\n diffuseColor.rgb = pow(diffuseColor.rgb, vec3(0.82)) * 1.08;")
          .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\n roughnessFactor = mix(0.55, 1.0, smoothstep(0.08, 0.3, roughnessFactor));");
      };
      m.customProgramCacheKey = () => "earth-ocean";
    }
    return m;
  }, [tex, ocean]);
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

export function Planet({ kind, sun, spin = false }: { kind: BodyKey; sun: THREE.Vector3; spin?: boolean }) {
  const radius = BODY_RADIUS[kind];
  const spinner = useRef<THREE.Group>(null);
  useFrame(() => {
    if (spin && spinner.current) spinner.current.rotation.y = live.time * ((Math.PI * 2) / 140);
  });
  if (kind === "saturn") return <SaturnGlobe radius={radius} sun={sun} />;
  return (
    <group>
      <group ref={spinner}>
        <TexturedGlobe url={TEXTURE[kind]!} radius={radius} ocean={kind === "earth"} />
      </group>
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
