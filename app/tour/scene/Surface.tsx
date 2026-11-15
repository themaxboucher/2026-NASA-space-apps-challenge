"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { rng, skyDir } from "../lib/geo";
import { STOPS, type Stop } from "../stops";
import { makeEnvironment } from "./environment";
import { groundMaterial } from "./ground";
import { HotspotTracker } from "./Hotspots";
import { Lrv } from "./Lrv";
import { BladePiece, GltfMachine, LanderDescent, type Anchors } from "./Machine";
import { FallenFlag, GroundMarks } from "./Marks";
import { useStore } from "../lib/store";
import { REPLAYS, tour } from "../state";
import { SiteReplay } from "./replays";
import { LitGlobe } from "./LitGlobe";
import { BODY_RADIUS, NORMAL, TEXTURE } from "./Space";
import { siteFrame } from "../lib/siteframe";

// The whole globe under the landing site, placed exactly as the trip's Moon was (lib/siteframe.ts). Seen from
// orbit it is the Moon; as you come down it fades out (from about 6 km to 1.8 km) and the detailed ground takes over.
function OrbitalGlobe({ stop }: { stop: Stop }) {
  const { camera } = useThree();
  const f = useMemo(() => siteFrame(stop), [stop]);
  const sun = useMemo(() => f.sunSite(), [f]);
  const key = stop.body === "mars" ? "mars" : "moon";
  return (
    <group position={f.globeInSite.position} quaternion={f.globeInSite.quaternion} scale={f.K}>
      <LitGlobe
        url={TEXTURE[key]!}
        normalUrl={NORMAL[key]!}
        radius={BODY_RADIUS[key]}
        sun={sun}
        overlay
        alpha={() => {
          const u = Math.min(1, Math.max(0, (camera.position.y - 1800) / 4200));
          return u * u * (3 - 2 * u);
        }}
      />
    </group>
  );
}
import { Planet, SunGlow } from "./Space";
import { groundGeometry, onTerrainChange, rockGeometry, terrainFor, type Terrain } from "./terrain";
import { Walker } from "./Walker";

const MOON_R = 1_737_400;
const MARS_R = 3_389_500;
// Rock color, then the dust color it can be partly coated in. Mars rocks are dark grey basalt under red dust.
const MOON_ROCK: [string, string] = ["#8a8780", "#6e6b66"];
const MARS_ROCK: [string, string] = ["#463b35", "#7d5238"];

// Rock sizes follow a power law, as counted on Apollo and rover photos: for every boulder there are hundreds of
// fist-sized stones. Small stones stay near you (far away they would be under a pixel) and use a coarser mesh.
function Rocks({ terrain, stop, count, maxSize, colors }: { terrain: Terrain; stop: Stop; count: number; maxSize: number; colors: [string, string] }) {
  const group = useMemo(() => {
    const rand = rng(17 + count);
    const flat = (stop.setting.flatRadius ?? 4) + 0.6;
    const keepOut = (stop.extras ?? []).filter((x) => x.kind === "lm-descent").map((x) => x.pos);
    const lrv = stop.model.kind === "lrv";
    const sets = [
      { geo: rockGeometry(3, 1), items: [] as THREE.Matrix4[], tints: [] as THREE.Color[] },
      { geo: rockGeometry(5, 2), items: [] as THREE.Matrix4[], tints: [] as THREE.Color[] },
    ];
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const [rock, dust] = colors.map((c) => new THREE.Color(c));
    for (let tries = 0, n = 0; n < count && tries < count * 4; tries++) {
      // Cumulative number bigger than s falls off about as s^-2.3 (half-size s in meters, 3 cm and up).
      const s = Math.min(maxSize, 0.03 * Math.pow(1 - rand(), -1 / 2.3));
      const a = rand() * Math.PI * 2;
      const d = flat + Math.pow(rand(), 1.5) * Math.min(140, 25 + s * 400);
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      if (keepOut.some((p) => Math.hypot(x - p[0], z - p[2]) < 7)) continue;
      // Keep the rover's wheel tracks clear (ground.ts draws them behind its rear wheels).
      if (lrv && x > 0.6 && Math.abs(z - 0.006 * Math.max(x - 1.15, 0) ** 2) < 1.4) continue;
      e.set(rand() * 3, rand() * 6, rand() * 3);
      q.setFromEuler(e);
      const set = sets[s < 0.09 ? 0 : 1];
      set.items.push(
        new THREE.Matrix4().compose(
          new THREE.Vector3(x, terrain.height(x, z) - s * 0.25, z),
          q,
          new THREE.Vector3(s * (0.8 + rand() * 0.5), s, s * (0.8 + rand() * 0.5)),
        ),
      );
      set.tints.push(rock.clone().lerp(dust, rand() * 0.6).multiplyScalar(0.85 + rand() * 0.3));
      n++;
    }
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.95 });
    for (const set of sets) {
      if (!set.items.length) continue;
      const inst = new THREE.InstancedMesh(set.geo, mat, set.items.length);
      set.items.forEach((m, i) => inst.setMatrixAt(i, m));
      set.tints.forEach((c, i) => inst.setColorAt(i, c));
      inst.castShadow = true;
      inst.receiveShadow = true;
      g.add(inst);
    }
    return g;
  }, [terrain, stop, count, maxSize, colors]);
  return <primitive object={group} />;
}

// Mars's daytime sky, from rover photos: butterscotch at the horizon and darker, browner overhead, because the
// fine red dust absorbs blue light. The same dust scatters forward, so the sky brightens toward the Sun, and right
// around the Sun a pale bluish glow appears (the effect that makes Martian sunsets blue).
// Colors are display (sRGB) values, written straight out, so the far ground's haze can use the exact horizon color.
const MARS_HORIZON = "#c9a07c";
const raw = (hex: string) => new THREE.Color().setStyle(hex, THREE.LinearSRGBColorSpace);
function MarsSky({ sun }: { sun: THREE.Vector3 }) {
  const group = useRef<THREE.Group>(null);
  const { camera } = useThree();
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          uSun: { value: sun.clone().normalize() },
          uHorizon: { value: raw(MARS_HORIZON) },
          uZenith: { value: raw("#86604a") },
          uHalo: { value: raw("#c4c8cc") },
          uFade: { value: 1 },
        },
        vertexShader: "varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
        fragmentShader: /* glsl */ `
          uniform vec3 uSun; uniform vec3 uHorizon; uniform vec3 uZenith; uniform vec3 uHalo; uniform float uFade; varying vec3 vD;
          void main() {
            vec3 d = normalize(vD);
            float h = max(d.y, 0.0);
            float s = dot(d, uSun);
            float toward = max(s, 0.0);
            vec3 col = mix(uHorizon, uZenith, pow(h, 0.5));
            // Brighter toward the Sun, dimmer opposite; right at the horizon the haze evens it out.
            col *= 1.0 + (0.32 * toward * toward * toward - 0.1 * max(-s, 0.0)) * smoothstep(0.0, 0.3, h);
            col = mix(col, uHalo, 0.7 * pow(toward, 90.0));
            // The Sun's disc: about 0.35 degrees across from Mars, two thirds of its size seen from Earth.
            col += vec3(1.0, 0.98, 0.95) * (smoothstep(0.999988, 0.999993, s) * 1.5 + pow(toward, 2500.0) * 0.5);
            if (d.y < 0.0) col = uHorizon;
            gl_FragColor = vec4(col * uFade, 1.0);
          }`,
      }),
    [sun],
  );
  useFrame(() => {
    group.current?.position.copy(camera.position);
    // High above Mars the thin air is below you: the sky fades to black space (8 km to 60 km up).
    const u = Math.min(1, Math.max(0, (camera.position.y - 8000) / 52000));
    mat.uniforms.uFade.value = 1 - u * u * (3 - 2 * u);
  });
  return (
    <group ref={group}>
      <mesh material={mat} renderOrder={-20}>
        <sphereGeometry args={[4000, 64, 32]} />
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
  // Footprints and the fallen flag are what the replay leaves behind, so they appear once it has played.
  const revealed = useStore(tour, (t) => !REPLAYS.has(stop.id) || t.revealed.includes(stop.id));
  // The measured ground normally loads before you arrive; if it lands late, rebuild the scene on it.
  const [groundVersion, setGroundVersion] = useState(0);
  useEffect(() => onTerrainChange(() => setGroundVersion((v) => v + 1)), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const terrain = useMemo(() => terrainFor(index), [index, groundVersion]);
  // Globe sites' ground reaches farther (8 km), so the detailed ground can take over from the globe while still high up.
  const ground = useMemo(() => groundGeometry(terrain, stop.site ? 8000 : 3000, moon ? MOON_R : MARS_R), [terrain, moon, stop.site]);
  const groundMat = useMemo(() => groundMaterial(stop), [stop]);
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
    // Moon: no air, so no sky light and no haze. The only fill is sunlight bounced off the grey ground, which is
    // why shadows there are nearly black. The environment's Sun is kept dim: it adds glints to foil, but an
    // environment is never shadowed, so a bright one would light up the shadows too.
    // Mars: the dusty sky lights the shadows warmly, and the same dust hazes the distance (about a third of the
    // light gets through from 1.5 km; the horizon fades into the sky color).
    const env = makeEnvironment(gl, moon ? "#000000" : "#c8a283", moon ? "#77736d" : "#8a5636", sun, moon ? 10 : 30);
    scene.environment = env.texture;
    scene.environmentIntensity = moon ? 0.45 : 0.7;
    scene.background = moon ? new THREE.Color("#000000") : null;
    scene.fog = moon ? null : new THREE.FogExp2(MARS_HORIZON, 0.0007);
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
      {/* No stars on the sunlit Moon: as in every Apollo surface photo, an exposure set for bright ground
          cannot record them. The sky is plain black. */}
      {!moon && <MarsSky sun={sun} />}
      {moon && <SunGlow dir={sun} distance={4500} size={520} intensity={1.4} />}
      {earth && (
        <Suspense fallback={null}>
          <EarthInSky dir={earth} sun={sun} />
        </Suspense>
      )}
      <directionalLight
        ref={light}
        position={lightPos}
        intensity={moon ? 4.2 : 2.5}
        color={moon ? "#fffaf3" : "#ffe9d4"}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-radius={moon ? 1 : 3}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-camera-left={-16}
        shadow-camera-right={16}
        shadow-camera-top={16}
        shadow-camera-bottom={-16}
        shadow-camera-near={1}
        shadow-camera-far={120}
      />
      <hemisphereLight args={[moon ? "#000000" : "#d9b18d", moon ? "#5e5a54" : "#7a4a30", moon ? 0.4 : 0.85]} />
      <mesh geometry={ground} material={groundMat} receiveShadow />
      <Rocks
        terrain={terrain}
        stop={stop}
        count={moon ? 1400 : stop.setting.terrain === "sand" ? 160 : 900}
        maxSize={moon ? 1.2 : stop.setting.terrain === "sand" ? 0.3 : 0.8}
        colors={moon ? MOON_ROCK : MARS_ROCK}
      />
      <Suspense fallback={null}>
        <Machine stop={stop} onAnchors={onAnchors} />
        {(stop.extras ?? []).map((x, i) =>
          x.kind === "lm-descent" ? (
            <LanderDescent key={i} position={[x.pos[0], terrain.height(x.pos[0], x.pos[2]), x.pos[2]]} rotationY={x.rotationY} />
          ) : x.kind === "flag" ? (
            !revealed ? null : (
              <FallenFlag key={i} position={[x.pos[0], terrain.height(x.pos[0], x.pos[2]), x.pos[2]]} rotationY={x.rotationY} />
            )
          ) : !revealed ? null : (
            <BladePiece key={i} position={[x.pos[0], terrain.height(x.pos[0], x.pos[2]) + 0.012, x.pos[2]]} rotationY={x.rotationY} />
          ),
        )}
      </Suspense>
      {stop.marks && revealed && <GroundMarks marks={stop.marks} ground={terrain.height} />}
      <SiteReplay stop={stop} ground={terrain.height} />
      {stop.site && (
        <Suspense fallback={null}>
          <OrbitalGlobe stop={stop} />
        </Suspense>
      )}
      <HotspotTracker stop={stop} anchors={anchors} ground={terrain.height} />
      <Walker stop={stop} mode="walk" ground={terrain.height} center={[0, stop.id === "ingenuity" ? 0.25 : 1, 0]} />
    </>
  );
}
