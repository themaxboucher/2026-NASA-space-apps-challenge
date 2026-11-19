"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { noise2, rng, skyDir } from "../lib/geo";
import { STOPS, type Stop } from "../stops";
import { makeEnvironment } from "./environment";
import { groundMaterial } from "./ground";
import { HotspotTracker } from "./Hotspots";
import { Lrv } from "./Lrv";
import { BladePiece, GltfMachine, LanderDescent, type Anchors } from "./Machine";
import { FallenFlag, GroundMarks } from "./Marks";
import { useStore } from "../lib/store";
import { live, REPLAYS, tour } from "../state";
import { SiteReplay } from "./replays";
import { LitGlobe } from "./LitGlobe";
import { BODY_RADIUS, NORMAL, TEXTURE } from "./Space";
import { siteFrame } from "../lib/siteframe";

// The whole globe under the landing site, placed exactly as the trip's Moon was (lib/siteframe.ts). Seen from
// orbit it is the Moon; as you come down it fades out (from about 3 km to 600 m) and the detailed ground takes over.
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
          // From 600 m up the globe (with its fine crater detail) takes over from the site's own ground, which looks
          // streaky from a distance; fully the globe by 3 km.
          const u = Math.min(1, Math.max(0, (camera.position.y - 600) / 2400));
          return u * u * (3 - 2 * u);
        }}
      />
    </group>
  );
}
import { Planet, SunGlow } from "./Space";
import { craterSpec, groundGeometry, onTerrainChange, rockGeometry, terrainFor, type Terrain } from "./terrain";
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

function Machine({ stop, onAnchors, ground }: { stop: Stop; onAnchors: (a: Anchors) => void; ground: (x: number, z: number) => number }) {
  useLayoutEffect(() => {
    if (stop.model.kind === "gltf") return;
    // The rover's hotspot spots are fixed positions on the shapes it is built from.
    onAnchors(prepareAnchorsOnly(stop));
  }, [stop, onAnchors]);
  if (stop.model.kind === "lrv") return <Lrv />;
  if (stop.model.kind === "none") return stop.setting.crater ? <Debris stop={stop} ground={ground} /> : null;
  return <GltfMachine stop={stop} onAnchors={onAnchors} />;
}

// A torn, crumpled scrap of sheet metal or foil, 1 m across before scaling, lying on y = 0 (nothing below it).
function scrapGeometry(seed: number) {
  const g = new THREE.PlaneGeometry(1, 0.55 + (seed % 3) * 0.2, 7, 5);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position as THREE.BufferAttribute;
  const fold = 0.6 + (seed % 5) * 0.3;
  let min = Infinity;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    // A fold across the sheet, a curl at one end, and crumples all over.
    const y = Math.abs(x * Math.cos(fold) + z * Math.sin(fold)) * 0.22 + Math.max(0, x - 0.2) ** 2 * 0.5 + (noise2(x * 4 + seed, z * 4, seed) - 0.5) * 0.14;
    // Ragged edges: pull the outer vertices in by different amounts.
    const edge = Math.abs(x) > 0.49 || Math.abs(z) > 0.25 ? 0.75 + noise2(x * 7, z * 7 + seed, seed + 1) * 0.3 : 1;
    p.setXYZ(i, x * edge, y, z * edge);
    min = Math.min(min, y);
  }
  g.translate(0, -min, 0);
  g.computeVertexNormals();
  return g;
}

// An impact site's leftovers. At 1.6 to 2.6 km a second nothing survives whole: the machine shatters into small
// twisted scraps of aluminium and foil (mostly hand-sized, a few bigger) thrown out with the soil, thickest on the
// rim and blanket and thinning outward, partly along the rays. Each scrap lies flat on the ground's real slope.
function Debris({ stop, ground }: { stop: Stop; ground: (x: number, z: number) => number }) {
  const group = useMemo(() => {
    const spec = craterSpec(stop)!;
    const R = spec.diameterM / 2;
    const rand = rng(Math.round(R * 13) + 5);
    const n = Math.round(Math.min(220, Math.max(80, spec.diameterM * 5)));
    const reach = Math.max(R * 5, 16);
    const kinds = [0, 1, 2].map((k) => ({ geo: scrapGeometry(k * 7 + 3), items: [] as THREE.Matrix4[], tints: [] as THREE.Color[] }));
    const up = new THREE.Vector3(0, 1, 0), nrm = new THREE.Vector3(), p = new THREE.Vector3(), k = new THREE.Vector3();
    const tilt = new THREE.Quaternion(), spin = new THREE.Quaternion();
    const metal = new THREE.Color("#a5a29c"), foil = new THREE.Color("#c99a3c"), black = new THREE.Color("#2e2c2a");
    // A few directions that more of the pieces were thrown along.
    const streaks = [rand(), rand(), rand(), rand()].map((v) => v * Math.PI * 2);
    for (let i = 0; i < n; i++) {
      const a = rand() < 0.45 ? streaks[i % 4] + (rand() - 0.5) * 0.25 : rand() * Math.PI * 2;
      const d = R * 0.4 + Math.pow(rand(), 1.8) * reach;
      p.set(Math.cos(a) * d, 0, Math.sin(a) * d);
      const s = 0.05 + Math.pow(rand(), 5) * 0.6;
      // Lie along the ground: its normal from the heights around the piece.
      const e = Math.max(0.15, s * 0.5);
      const [w, east, nth, sth, mid] = [ground(p.x - e, p.z), ground(p.x + e, p.z), ground(p.x, p.z - e), ground(p.x, p.z + e), ground(p.x, p.z)];
      nrm.set(w - east, 2 * e, nth - sth).normalize();
      // In a hollow (inside the bowl) the ground curves up past a flat piece's ends: lift it by that much.
      p.y = mid + Math.max(0, (w + east + nth + sth) / 4 - mid) + 0.004;
      tilt.setFromUnitVectors(up, nrm).multiply(spin.setFromAxisAngle(up, rand() * Math.PI * 2));
      const set = kinds[i % 3];
      set.items.push(new THREE.Matrix4().compose(p, tilt, k.set(s, s, s * (0.6 + rand() * 0.6))));
      set.tints.push((rand() < 0.3 ? foil : rand() < 0.25 ? black : metal).clone().multiplyScalar(0.8 + rand() * 0.4));
    }
    const g = new THREE.Group();
    // Only half metallic: against the black lunar sky a true mirror finish would look black.
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.45, side: THREE.DoubleSide });
    for (const set of kinds) {
      const inst = new THREE.InstancedMesh(set.geo, mat, set.items.length);
      set.items.forEach((m, i) => inst.setMatrixAt(i, m));
      set.tints.forEach((c, i) => inst.setColorAt(i, c));
      inst.castShadow = true;
      inst.receiveShadow = true;
      g.add(inst);
    }
    return g;
  }, [stop, ground]);
  return <primitive object={group} />;
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

  // Compile the stop's shaders in the background as it appears (about 3 seconds of work on a laptop GPU), instead
  // of freezing the page on its first frame; the trip holds on black meanwhile (live.compiling).
  const root = useRef<THREE.Group>(null);
  useEffect(() => {
    const g = root.current;
    if (!g) return;
    let alive = true;
    live.compiling = true;
    g.visible = true;
    const done = () => {
      if (!alive) return;
      g.visible = true;
      live.compiling = false;
    };
    gl.compileAsync(g, camera, scene).then(done, done);
    g.visible = false; // not drawn (which would compile it all at once) until it's ready
    return () => {
      alive = false;
      g.visible = true;
      live.compiling = false;
    };
  }, [gl, camera, scene, groundVersion]);

  const lightPos = useMemo(() => sun.clone().multiplyScalar(45), [sun]);
  const light = useRef<THREE.DirectionalLight>(null);
  useLayoutEffect(() => {
    light.current?.shadow.camera.updateProjectionMatrix();
  }, []);

  return (
    <group ref={root}>
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
      {/* A floor the Sun never reaches is lit only by light bounced off far, sunlit crater walls: dim and from all round. */}
      {stop.setting.fill && <hemisphereLight args={["#8d8a85", "#5e5a54", stop.setting.fill]} />}
      <mesh geometry={ground} material={groundMat} receiveShadow />
      <Rocks
        terrain={terrain}
        stop={stop}
        count={moon ? 1400 : stop.setting.terrain === "sand" ? 160 : 900}
        maxSize={moon ? 1.2 : stop.setting.terrain === "sand" ? 0.3 : 0.8}
        colors={moon ? MOON_ROCK : MARS_ROCK}
      />
      <Suspense fallback={null}>
        <Machine stop={stop} onAnchors={onAnchors} ground={terrain.height} />
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
    </group>
  );
}
