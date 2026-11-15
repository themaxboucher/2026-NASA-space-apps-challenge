"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useLayoutEffect, useMemo } from "react";
import * as THREE from "three";
import { rng } from "../lib/geo";
import { TRAVEL_SUN } from "../plans";
import { live, tour, type SceneDesc } from "../state";
import { TILT } from "./Earth";
import { BODY_RADIUS, NORMAL, Planet, Stars, Streaks, SunGlow, TEXTURE } from "./Space";
import { LitGlobe } from "./LitGlobe";

// Mounts once Earth's texture has loaded, which is when the start screen is ready to go.
function Ready() {
  useEffect(() => {
    if (!tour.get().sceneReady) tour.set({ sceneReady: true });
  }, []);
  return null;
}

// Space between the worlds: stars, the Sun, and the planets we are leaving and heading for.
export function TravelScene({ desc }: { desc: Extract<SceneDesc, { kind: "travel" }> }) {
  const { gl, scene, camera } = useThree();
  useLayoutEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    cam.near = 0.005;
    cam.far = 3000;
    cam.updateProjectionMatrix();
    gl.toneMappingExposure = 1.0;
    scene.background = new THREE.Color("#000000");
    return () => {
      scene.background = null;
    };
  }, [gl, scene, camera]);

  return (
    <>
      <Stars radius={900} count={3200} />
      <Streaks />
      <SunGlow dir={TRAVEL_SUN} distance={800} size={240} intensity={1.15} />
      <directionalLight position={TRAVEL_SUN.clone().multiplyScalar(30)} intensity={3} color="#fff6ec" />
      <ambientLight intensity={0.03} />
      {desc.bodies.map((b) => (
        // Keyed by body, so Earth stays mounted when the start screen turns into the trip to the Moon.
        <group key={b.key} position={b.pos} rotation={[0, b.rotY, 0]}>
          <Suspense fallback={null}>
            {b.lit ? (
              <LitGlobe url={TEXTURE[b.key]!} normalUrl={NORMAL[b.key]!} radius={BODY_RADIUS[b.key]} sun={new THREE.Vector3(...b.lit)} />
            ) : (
              <Planet kind={b.key} sun={TRAVEL_SUN} spin={b.spin} />
            )}
            {b.key === "earth" && <Ready />}
          </Suspense>
          {b.key === "earth" && <OrbitDebris />}
        </group>
      ))}
      {desc.heliopause && <Heliopause {...desc.heliopause} />}
    </>
  );
}

// Earth's orbital junk (ESA's counts are in public/data/earth-orbit.json: most tracked objects are not working
// satellites but dead ones, rocket stages and fragments). Drawn as a few thousand faint dots in the real shells: a dense cloud in
// low Earth orbit (200–2,000 km up), a thin band at GPS height (about 20,200 km), and the geostationary ring
// (35,786 km, 6.6 Earth radii) over the equator. Each dot follows its own circular orbit, the low ones fastest
// (Kepler: period grows as radius^1.5). Earth's radius is 1 here.
const RE_KM = 6371;
function OrbitDebris() {
  const { geometry, material } = useMemo(() => {
    const rand = rng(42);
    const orbits: number[] = [];
    const add = (r: number, inc: number, bright: number) => orbits.push(r, inc, rand() * Math.PI * 2, rand() * Math.PI * 2, bright * (0.5 + rand() * 0.5));
    const deg = Math.PI / 180;
    for (let i = 0; i < 5200; i++) {
      // Most low-orbit objects sit between 400 and 1,200 km; inclinations cluster at sun-synchronous (~98°),
      // the big constellations (53°), the space station (51.6°), and polar orbits.
      const alt = rand() < 0.8 ? 400 + rand() * 800 : 200 + rand() * 1800;
      const t = rand();
      const inc = t < 0.35 ? 97 + rand() * 2.5 : t < 0.6 ? 53 : t < 0.68 ? 51.6 : t < 0.85 ? 65 + rand() * 25 : rand() * 100;
      add(1 + alt / RE_KM, inc * deg, 0.55);
    }
    for (let i = 0; i < 420; i++) add(1 + (19_100 + rand() * 4_200) / RE_KM, (55 + rand() * 10) * deg, 0.7);
    for (let i = 0; i < 900; i++) {
      // The geostationary ring, plus old satellites boosted a little higher (the "graveyard") and drifting dead
      // ones whose orbits have tilted by up to 15°.
      const r = 6.62 + (rand() < 0.25 ? 0.02 + rand() * 0.06 : (rand() - 0.5) * 0.01);
      add(r, (rand() < 0.75 ? rand() * 1.5 : rand() * 15) * deg, 0.85);
    }
    const n = orbits.length / 5;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3)); // placed in the shader
    const orbit = new Float32Array(n * 4), bright = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      orbit.set(orbits.slice(i * 5, i * 5 + 4), i * 4);
      bright[i] = orbits[i * 5 + 4];
    }
    g.setAttribute("aOrbit", new THREE.BufferAttribute(orbit, 4));
    g.setAttribute("aBright", new THREE.BufferAttribute(bright, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uAlpha: { value: 0.9 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute vec4 aOrbit; attribute float aBright; uniform float uTime; varying float vB;
        void main() {
          float r = aOrbit.x, inc = aOrbit.y, node = aOrbit.z;
          // One low orbit a minute; the geostationary ring takes about a quarter of an hour.
          float a = aOrbit.w + uTime * 0.105 * pow(r / 1.07, -1.5);
          vec3 p = vec3(cos(a) * r, 0.0, sin(a) * r);
          p = vec3(p.x, -p.z * sin(inc), p.z * cos(inc));
          p = vec3(p.x * cos(node) + p.z * sin(node), p.y, -p.x * sin(node) + p.z * cos(node));
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = 2.2;
          vB = aBright;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uAlpha; varying float vB;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          gl_FragColor = vec4(vec3(0.85, 0.9, 1.0) * vB * uAlpha * (1.0 - d * 1.2), 1.0);
        }`,
    });
    return { geometry: g, material: m };
  }, []);
  useFrame(() => {
    material.uniforms.uTime.value = live.time;
  });
  return (
    <group rotation={[0, 0, TILT]}>
      <points geometry={geometry} material={material} frustumCulled={false} />
    </group>
  );
}

// The heliopause, where the solar wind gives way to interstellar space (Voyager 1 crossed it in 2012, about
// 121 AU from the Sun). It is invisible in reality; here it is a faint violet shell, brightest where you see it
// edge-on, so you can tell when you fly through.
function Heliopause({ center, radius }: { center: [number, number, number]; radius: number }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        vertexShader: /* glsl */ `
          varying vec3 vN; varying vec3 vW;
          void main() {
            vec4 w = modelMatrix * vec4(position, 1.0);
            vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
            gl_Position = projectionMatrix * viewMatrix * w;
          }`,
        fragmentShader: /* glsl */ `
          varying vec3 vN; varying vec3 vW;
          void main() {
            vec3 v = normalize(cameraPosition - vW);
            float edge = pow(1.0 - abs(dot(vN, v)), 3.0);
            float near = smoothstep(90.0, 0.0, distance(cameraPosition, vW)); // a glow on the sheet as you pass through
            float a = 0.03 + edge * 0.35 + near * 0.12;
            gl_FragColor = vec4(vec3(0.62, 0.55, 1.0) * a, 1.0);
          }`,
      }),
    [],
  );
  return (
    <mesh position={center} material={material} frustumCulled={false}>
      <sphereGeometry args={[radius, 96, 64]} />
    </mesh>
  );
}
