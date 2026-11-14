"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { Suspense, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { rng, skyDir } from "../lib/geo";
import { STOPS, type Stop } from "../stops";
import { makeEnvironment } from "./environment";
import { HotspotTracker } from "./Hotspots";
import { Lrv } from "./Lrv";
import { BladePiece, GltfMachine, LanderDescent, type Anchors } from "./Machine";
import { Planet, Stars, SunGlow } from "./Space";
import { groundGeometry, rockGeometry, terrainFor, type Terrain } from "./terrain";
import { grainTexture } from "./textures";
import { Walker } from "./Walker";

const MOON_R = 1_737_400;
const MARS_R = 3_389_500;

function Rocks({ terrain, stop, count, color }: { terrain: Terrain; stop: Stop; count: number; color: string }) {
  const mesh = useMemo(() => {
    const geo = rockGeometry(3);
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.95 });
    const inst = new THREE.InstancedMesh(geo, mat, count);
    const rand = rng(17 + count);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const c = new THREE.Color();
    const flat = (stop.setting.flatRadius ?? 4) + 0.6;
    const keepOut = (stop.extras ?? []).filter((x) => x.kind === "lm-descent").map((x) => x.pos);
    let i = 0;
    while (i < count) {
      const a = rand() * Math.PI * 2;
      const d = flat + Math.pow(rand(), 1.8) * 140;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      if (keepOut.some((p) => Math.hypot(x - p[0], z - p[2]) < 7)) continue;
      const s = 0.03 + Math.pow(rand(), 4) * (stop.setting.terrain === "sand" ? 0.18 : 0.55);
      e.set(rand() * 3, rand() * 6, rand() * 3);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(x, terrain.height(x, z) - s * 0.25, z), q, new THREE.Vector3(s * (0.8 + rand() * 0.5), s, s * (0.8 + rand() * 0.5)));
      inst.setMatrixAt(i, m);
      const v = 0.82 + rand() * 0.3;
      inst.setColorAt(i, c.set(color).multiplyScalar(v));
      i++;
    }
    inst.castShadow = true;
    inst.receiveShadow = true;
    return inst;
  }, [terrain, stop, count, color]);
  return <primitive object={mesh} />;
}

// Mars's daytime sky: butterscotch at the horizon, a little darker overhead, with a pale glow around the Sun.
function MarsSky({ sun }: { sun: THREE.Vector3 }) {
  const group = useRef<THREE.Group>(null);
  const { camera } = useThree();
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: { uSun: { value: sun.clone().normalize() } },
        vertexShader: "varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
        fragmentShader: /* glsl */ `
          uniform vec3 uSun; varying vec3 vD;
          void main() {
            vec3 d = normalize(vD);
            float h = max(d.y, 0.0);
            vec3 horizon = vec3(0.84, 0.66, 0.5);
            vec3 zenith = vec3(0.55, 0.38, 0.27);
            vec3 col = mix(horizon, zenith, pow(h, 0.55));
            float s = max(dot(d, uSun), 0.0);
            col += vec3(0.95, 0.9, 0.85) * pow(s, 900.0) * 3.0 + vec3(0.75, 0.72, 0.68) * pow(s, 18.0) * 0.35;
            if (d.y < 0.0) col = horizon * 0.92;
            gl_FragColor = vec4(col, 1.0);
          }`,
      }),
    [sun],
  );
  useFrame(() => group.current?.position.copy(camera.position));
  return (
    <group ref={group}>
      <mesh material={mat} renderOrder={-20}>
        <sphereGeometry args={[4000, 48, 24]} />
      </mesh>
    </group>
  );
}

// Earth hanging in the lunar sky, about 2 degrees across, lit by the same Sun (so it shows the right phase).
function EarthInSky({ dir, sun }: { dir: THREE.Vector3; sun: THREE.Vector3 }) {
  const group = useRef<THREE.Group>(null);
  const { camera } = useThree();
  const dist = 3000;
  const radius = dist * Math.tan((0.95 * Math.PI) / 180);
  useFrame(() => group.current?.position.copy(camera.position).addScaledVector(dir, dist));
  return (
    <group ref={group} scale={radius}>
      <Planet kind="earth" sun={sun} spin />
    </group>
  );
}

function Machine({ stop, onAnchors }: { stop: Stop; onAnchors: (a: Anchors) => void }) {
  useLayoutEffect(() => {
    if (stop.model.kind !== "lrv") return;
    // The rover's hotspot spots are fixed positions on the shapes it is built from.
    onAnchors(prepareAnchorsOnly(stop));
  }, [stop, onAnchors]);
  if (stop.model.kind === "lrv") return <Lrv />;
  return <GltfMachine stop={stop} onAnchors={onAnchors} />;
}

function prepareAnchorsOnly(stop: Stop): Anchors {
  const out: Anchors = {};
  for (const h of stop.hotspots) if ("pos" in h.anchor) out[h.id] = new THREE.Vector3(...h.anchor.pos);
  return out;
}

export function SurfaceScene({ index }: { index: number }) {
  const stop = STOPS[index];
  const moon = stop.setting.kind === "moon";
  const { gl, scene, camera } = useThree();
  const terrain = useMemo(() => terrainFor(index), [index]);
  const ground = useMemo(() => groundGeometry(terrain, 3000, moon ? MOON_R : MARS_R), [terrain, moon]);
  const groundMat = useMemo(() => {
    const t = grainTexture(moon ? "moon" : "mars");
    return new THREE.MeshStandardMaterial({ vertexColors: true, map: t, roughness: 1, metalness: 0 });
  }, [moon]);
  const sun = useMemo(() => skyDir(stop.setting.sun.az, stop.setting.sun.el), [stop]);
  const earth = useMemo(() => (stop.setting.earth ? skyDir(stop.setting.earth.az, stop.setting.earth.el) : null), [stop]);
  const [anchors, setAnchors] = useState<Anchors>({});
  const onAnchors = useCallback((a: Anchors) => setAnchors(a), []);

  useLayoutEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    cam.near = 0.03;
    cam.far = 9000;
    cam.updateProjectionMatrix();
    gl.toneMappingExposure = moon ? 1.0 : 1.08;
    const env = makeEnvironment(gl, moon ? "#05060a" : "#c8a283", moon ? "#77736d" : "#8a5636", sun, moon ? 60 : 30);
    scene.environment = env.texture;
    scene.environmentIntensity = moon ? 0.55 : 0.7;
    scene.background = moon ? new THREE.Color("#000000") : null;
    scene.fog = moon ? null : new THREE.Fog("#c9a47f", 60, 1400);
    return () => {
      scene.environment = null;
      scene.fog = null;
      scene.background = null;
      env.dispose();
    };
  }, [gl, scene, camera, moon, sun]);

  const lightPos = useMemo(() => sun.clone().multiplyScalar(45), [sun]);
  const light = useRef<THREE.DirectionalLight>(null);
  useLayoutEffect(() => {
    light.current?.shadow.camera.updateProjectionMatrix();
  }, []);

  return (
    <>
      {moon ? <Stars radius={5000} count={2200} /> : <MarsSky sun={sun} />}
      {moon && <SunGlow dir={sun} distance={4500} size={520} intensity={1.4} />}
      {earth && (
        <Suspense fallback={null}>
          <EarthInSky dir={earth} sun={sun} />
        </Suspense>
      )}
      <directionalLight
        ref={light}
        position={lightPos}
        intensity={moon ? 3.1 : 2.5}
        color={moon ? "#fff8ee" : "#ffe7cf"}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-camera-left={-16}
        shadow-camera-right={16}
        shadow-camera-top={16}
        shadow-camera-bottom={-16}
        shadow-camera-near={1}
        shadow-camera-far={120}
      />
      <hemisphereLight args={[moon ? "#1b1e26" : "#d9b18d", moon ? "#6f6b65" : "#7a4a30", moon ? 0.45 : 0.85]} />
      <mesh geometry={ground} material={groundMat} receiveShadow />
      <Rocks terrain={terrain} stop={stop} count={stop.setting.terrain === "sand" ? 90 : 420} color={moon ? "#85827c" : "#6c4430"} />
      <Suspense fallback={null}>
        <Machine stop={stop} onAnchors={onAnchors} />
        {(stop.extras ?? []).map((x, i) =>
          x.kind === "lm-descent" ? (
            <LanderDescent key={i} position={x.pos} rotationY={x.rotationY} />
          ) : (
            <BladePiece key={i} position={[x.pos[0], terrain.height(x.pos[0], x.pos[2]) + 0.012, x.pos[2]]} rotationY={x.rotationY} />
          ),
        )}
      </Suspense>
      <HotspotTracker stop={stop} anchors={anchors} ground={terrain.height} />
      <Walker stop={stop} mode="walk" ground={terrain.height} center={[0, stop.id === "ingenuity" ? 0.25 : 1, 0]} />
    </>
  );
}
