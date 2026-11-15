"use client";
/* eslint-disable react-hooks/immutability -- three.js objects (camera, materials, geometry) are updated in place every frame, as in app/tour/scene. */

import { useTexture } from "@react-three/drei";
import { SaturnMoons } from "../tour/scene/SaturnMoons";
import { BODY_RADIUS } from "../tour/scene/Space";
import { useFrame, useThree } from "@react-three/fiber";
import { Suspense, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { fbm, noise2, rng } from "../tour/lib/geo";
import { Atmosphere, Planet, Stars } from "../tour/scene/Space";
import { dotTexture, glowTexture } from "../tour/scene/textures";
import { Flight, markerColors } from "./Flight";
import { auR, eclToScene, HELIOPAUSE_AU, j2000Days, type Body, type Tracks, type World } from "./model";

// Textures drawn in code for the worlds with no NASA map here (Venus's cloud tops, Uranus, Neptune, Pluto, Ceres, the Sun).
const texCache = new Map<string, THREE.Texture>();
function canvasTex(key: string, w: number, h: number, draw: (img: ImageData, w: number, h: number) => void) {
  const hit = texCache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(w, h);
  draw(img, w, h);
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  texCache.set(key, t);
  return t;
}
const hex = (c: string) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
// Cloud bands by latitude, stirred a little by noise.
function bandTex(key: string, colors: string[], stir: number, seed: number) {
  return canvasTex(key, 512, 256, (img, w, h) => {
    const cs = colors.map(hex);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const t = Math.min(0.999, Math.max(0, y / h + fbm(x / 70, y / 9, 3, seed) * stir)) * (cs.length - 1);
        const i0 = Math.floor(t), f = t - i0, a = cs[i0], b = cs[Math.min(cs.length - 1, i0 + 1)];
        const k = 0.95 + noise2(x / 18, y / 4, seed + 7) * 0.08;
        const o = (y * w + x) * 4;
        for (let c = 0; c < 3; c++) img.data[o + c] = (a[c] + (b[c] - a[c]) * f) * k;
        img.data[o + 3] = 255;
      }
  });
}
// Rocky, mottled ground: two colours mixed by noise, with optional bright and dark patches (Pluto's heart).
function rockTex(key: string, dark: string, light: string, seed: number, patches: [lon: number, lat: number, rx: number, ry: number, col: string][] = []) {
  return canvasTex(key, 512, 256, (img, w, h) => {
    const d = hex(dark), l = hex(light);
    const ps = patches.map(([lon, lat, rx, ry, col]) => ({ x: ((lon + 180) / 360) * w, y: ((90 - lat) / 180) * h, rx: (rx / 360) * w, ry: (ry / 180) * h, c: hex(col) }));
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const n = Math.min(1, Math.max(0, 0.5 + fbm(x / 40, y / 40, 5, seed) * 0.9));
        const rgb = [0, 1, 2].map((c) => d[c] + (l[c] - d[c]) * n);
        for (const p of ps) {
          const q = Math.hypot((x - p.x) / p.rx, (y - p.y) / p.ry) + fbm(x / 20, y / 20, 3, seed + 3) * 0.5;
          const k = Math.max(0, Math.min(1, (1.1 - q) * 3)) * 0.85;
          for (let c = 0; c < 3; c++) rgb[c] += (p.c[c] - rgb[c]) * k;
        }
        const o = (y * w + x) * 4;
        img.data.set([rgb[0], rgb[1], rgb[2], 255], o);
      }
  });
}

const PROCEDURAL: Partial<Record<Body["key"], () => THREE.Texture>> = {
  venus: () => bandTex("venus", ["#d9c193", "#e8d6a9", "#efe0b8", "#e4cf9d", "#efe0b8", "#e6d3a6", "#d6bd8e"], 0.05, 3),
  uranus: () => bandTex("uranus", ["#9fcfd6", "#a9d8dd", "#b3dee2", "#acdade", "#a3d2d9"], 0.01, 5),
  neptune: () => bandTex("neptune", ["#2f4fa6", "#3b62c0", "#4a74cf", "#3c66c4", "#5279d0", "#3a60bd", "#2c4b9e"], 0.03, 9),
  pluto: () => rockTex("pluto", "#5d4433", "#c9b394", 11, [[175, 20, 70, 50, "#efe6d6"], [100, -5, 90, 22, "#3a2419"]]),
  ceres: () => rockTex("ceres", "#4f4b47", "#7d7872", 13),
};
const MAPS: Partial<Record<Body["key"], string>> = { jupiter: "/tex/jupiter.jpg", mercury: "/tex/mercury.jpg" };
// Planets' axial tilts that show: Jupiter ~3 deg, Uranus 98 (it rolls on its side), Neptune 28, Pluto ~120.
const TILT: Partial<Record<Body["key"], number>> = { jupiter: 0.05, uranus: 1.71, neptune: 0.49, pluto: 2.1 };
const AIR: Partial<Record<Body["key"], [color: string, thickness: number, strength: number]>> = {
  venus: ["#f3dcaa", 0.07, 0.9],
  uranus: ["#a6e3ea", 0.05, 0.6],
  neptune: ["#6f98ff", 0.05, 0.7],
  jupiter: ["#e8d2b0", 0.03, 0.45],
};

function MapGlobe({ url, r }: { url: string; r: number }) {
  const tex = useTexture(url);
  const { gl } = useThree();
  useLayoutEffect(() => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
    tex.needsUpdate = true;
  }, [tex, gl]);
  return (
    <mesh>
      <sphereGeometry args={[r, 96, 48]} />
      <meshStandardMaterial map={tex} roughness={1} metalness={0} />
    </mesh>
  );
}

function DrawnGlobe({ make, r }: { make: () => THREE.Texture; r: number }) {
  const tex = useMemo(() => make(), [make]);
  return (
    <mesh>
      <sphereGeometry args={[r, 64, 32]} />
      <meshStandardMaterial map={tex} roughness={1} metalness={0} />
    </mesh>
  );
}

// Eros, comet Tempel 1 and Dimorphos: lumpy grey rocks.
function Rock({ r, seed, stretch }: { r: number; seed: number; stretch: number }) {
  const geo = useMemo(() => {
    const g = new THREE.IcosahedronGeometry(1, 3);
    const p = g.attributes.position as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const k = 1 + fbm(v.x * 1.7 + v.z, v.y * 1.7 - v.z * 0.6, 4, seed) * 0.45;
      p.setXYZ(i, v.x * k * stretch, v.y * k, v.z * k);
    }
    g.computeVertexNormals();
    return g;
  }, [seed, stretch]);
  return (
    <mesh geometry={geo} scale={r}>
      <meshStandardMaterial color="#77716a" roughness={1} />
    </mesh>
  );
}

function World3D({ b }: { b: Body }) {
  const sun = useMemo(() => b.pos.clone().negate().normalize(), [b.pos]);
  const air = AIR[b.key];
  let inner: ReactNode;
  if (b.key === "earth" || b.key === "moon" || b.key === "mars" || b.key === "saturn") inner = <Planet kind={b.key} sun={sun} />;
  else if (MAPS[b.key]) inner = <MapGlobe url={MAPS[b.key]!} r={b.r} />;
  else if (PROCEDURAL[b.key]) inner = <DrawnGlobe make={PROCEDURAL[b.key]!} r={b.r} />;
  else inner = <Rock r={b.r} seed={b.key.length * 7} stretch={b.key === "eros" ? 2.4 : 1.3} />;
  return (
    <group position={b.pos} rotation={[0, b.rotY, 0]}>
      <group rotation={[0, 0, TILT[b.key] ?? 0]}>
        <Suspense fallback={null}>{inner}</Suspense>
      </group>
      {/* Saturn's big moons, tiny, on squeezed orbits in its ring plane; hover one to see its name. */}
      {b.key === "saturn" && (
        <group rotation={[0.47, 0, 0.12]}>
          <SaturnMoons radius={BODY_RADIUS.saturn} squeeze={0.62} />
        </group>
      )}
      {air && <Atmosphere radius={b.r} color={air[0]} thickness={air[1]} strength={air[2]} sun={sun} />}
    </group>
  );
}

// The Sun: limb-darkened, faintly mottled, with a glow that never shrinks below a bright star's.
function Sun({ r }: { r: number }) {
  const mat = useMemo(() => {
    const tex = canvasTex("granules", 256, 128, (img, w, h) => {
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const v = 128 + fbm(x / 6, y / 6, 4, 21) * 200;
          img.data.set([v, v, v, 255], (y * w + x) * 4);
        }
    });
    tex.colorSpace = THREE.NoColorSpace;
    return new THREE.ShaderMaterial({
      uniforms: { uTex: { value: tex } },
      vertexShader: /* glsl */ `
        varying vec3 vN; varying vec3 vW; varying vec2 vUv;
        void main() {
          vUv = uv;
          vec4 w = modelMatrix * vec4(position, 1.0);
          vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uTex; varying vec3 vN; varying vec3 vW; varying vec2 vUv;
        void main() {
          float mu = max(dot(vN, normalize(cameraPosition - vW)), 0.0);
          float g = texture2D(uTex, vUv * vec2(2.0, 1.0)).r;
          vec3 c = mix(vec3(1.0, 0.42, 0.1), vec3(1.0, 0.95, 0.82), pow(mu, 0.4)) * (0.88 + 0.2 * g);
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
  }, []);
  const glow = useMemo(() => new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(1, 0.88, 0.7), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), []);
  const sprite = useRef<THREE.Sprite>(null);
  useFrame(({ camera }) => {
    const s = Math.max(r * 9, camera.position.length() * 0.22);
    sprite.current?.scale.set(s, s, 1);
  });
  return (
    <group>
      <mesh material={mat}>
        <sphereGeometry args={[r, 64, 32]} />
      </mesh>
      <sprite ref={sprite} material={glow} renderOrder={5} />
    </group>
  );
}

// The main asteroid belt, 2.1 to 3.3 AU: a few thousand dim points, a little puffed up out of the plane.
function Belt() {
  const geo = useMemo(() => {
    const rand = rng(77);
    const n = 3600;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const au = 2.1 + (rand() + rand()) * 0.6;
      const lon = rand() * Math.PI * 2;
      const r = auR(au);
      const inc = (rand() + rand() + rand() - 1.5) * 0.18;
      pos.set([r * Math.cos(lon), r * Math.sin(inc) * Math.sin(lon - rand() * 6.28), -r * Math.sin(lon)], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);
  const mat = useMemo(() => new THREE.PointsMaterial({ map: dotTexture(), color: "#9a8c7a", size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0.55, depthWrite: false }), []);
  return <points geometry={geo} material={mat} />;
}

// Faint circles along each orbit, to show where the worlds go around the Sun.
function Orbits({ bodies }: { bodies: Body[] }) {
  const geo = useMemo(() => {
    // Each circle runs through its own world's centre, so it is left open around every world (and around the
    // ring of machines circling it, and Earth's satellite shells out to the geostationary ring): no line cuts a sphere.
    const gaps = bodies.map((b) => ({ c: b.pos, r: Math.max(b.r * 3, (b.frame ?? b.r) * 1.2, b.key === "earth" ? 8 : 0) }));
    const seg: number[] = [];
    const a = new THREE.Vector3(), c = new THREE.Vector3(), mid = new THREE.Vector3();
    const n = 720;
    for (const b of bodies) {
      if (b.key === "sun" || b.key === "moon" || b.small) continue;
      const r = Math.hypot(b.pos.x, b.pos.z);
      for (let i = 0; i < n; i++) {
        const t0 = (i / n) * Math.PI * 2, t1 = ((i + 1) / n) * Math.PI * 2;
        a.set(Math.cos(t0) * r, b.pos.y, Math.sin(t0) * r);
        c.set(Math.cos(t1) * r, b.pos.y, Math.sin(t1) * r);
        mid.addVectors(a, c).multiplyScalar(0.5);
        if (gaps.some((g) => mid.distanceTo(g.c) < g.r)) continue;
        seg.push(a.x, a.y, a.z, c.x, c.y, c.z);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(seg, 3));
    return g;
  }, [bodies]);
  const mat = useMemo(() => new THREE.LineBasicMaterial({ color: "#c1a995", transparent: true, opacity: 0.1, depthWrite: false }), []);
  return <lineSegments geometry={geo} material={mat} />;
}

// The heliopause, where the solar wind gives way to interstellar space: a thin shell that only shows edge-on.
function Heliopause() {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
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
            float f = 1.0 - abs(dot(vN, normalize(cameraPosition - vW)));
            float a = 0.015 + pow(f, 5.0) * 0.32;
            gl_FragColor = vec4(vec3(0.45, 0.68, 1.0) * a, a);
          }`,
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );
  return (
    <mesh material={mat} renderOrder={-2}>
      <sphereGeometry args={[auR(HELIOPAUSE_AU), 96, 48]} />
    </mesh>
  );
}

// Satellites and junk around Earth, in Earth-radius units (Earth is 1 here, so the shells keep their real
// proportions to the planet): a dense low orbit cloud, the navigation satellites, and the geostationary ring.
// Each point follows its own tilted circular orbit; inner ones go round faster (Kepler: speed ~ r^-1.5).
// Working satellites are the warmer dots, in the share ESA counts (`working`, from public/data/earth-orbit.json):
// a little under that share in crowded low orbit, more of it among the navigation and geostationary satellites.
export const DEBRIS_DOTS = { leo: 6600, meo: 300, geo: 500 };
function Debris({ earth, still, working }: { earth: Body; still: boolean; working: number }) {
  const { geo, mat } = useMemo(() => {
    const rand = rng(404);
    const orbits: [r: number, inc: number, node: number, phase: number][] = [];
    const deg = Math.PI / 180;
    // Low Earth orbit: 300-2,000 km up, crowded at 500-900 km; Starlink-like 53 deg, polar sun-synchronous ~98 deg, and the rest.
    for (let i = 0; i < DEBRIS_DOTS.leo; i++) {
      const alt = rand() < 0.75 ? 450 + (rand() + rand()) * 250 : 300 + rand() * 1700;
      const k = rand();
      const inc = (k < 0.4 ? 53 + (rand() - 0.5) * 4 : k < 0.75 ? 97.5 + (rand() - 0.5) * 3 : rand() * 100) * deg;
      orbits.push([1 + alt / 6371, inc, rand() * Math.PI * 2, rand() * Math.PI * 2]);
    }
    // GPS, Galileo, GLONASS and BeiDou: about 19,000-23,000 km up, in a few planes tilted ~55-65 deg.
    for (let i = 0; i < DEBRIS_DOTS.meo; i++) orbits.push([1 + (19100 + rand() * 4200) / 6371, (55 + rand() * 10) * deg, Math.floor(rand() * 6) * (Math.PI / 3) + rand() * 0.1, rand() * Math.PI * 2]);
    // Geostationary ring, 35,786 km up over the equator (6.6 Earth radii), plus the graveyard orbit just above it.
    for (let i = 0; i < DEBRIS_DOTS.geo; i++) orbits.push([6.62 + (rand() < 0.3 ? 0.04 + rand() * 0.05 : (rand() - 0.5) * 0.01), rand() * 1.5 * deg, rand() * Math.PI * 2, rand() * Math.PI * 2]);
    const pos = new Float32Array(orbits.length * 3);
    const ph = new Float32Array(orbits.length);
    const work = new Float32Array(orbits.length);
    const { leo, meo, geo: ring } = DEBRIS_DOTS;
    // Keep the overall share right: leo*0.9s + meo*1.8s + geo*1.4s = total*s, give or take.
    const k = (leo + meo + ring) / (leo * 0.9 + meo * 1.8 + ring * 1.4);
    orbits.forEach(([r, inc, node, phase], i) => {
      pos.set([r, inc, node], i * 3);
      ph[i] = phase;
      const share = working * k * (i < leo ? 0.9 : i < leo + meo ? 1.8 : 1.4);
      work[i] = rand() < share ? 1 : 0;
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("phase", new THREE.BufferAttribute(ph, 1));
    g.setAttribute("work", new THREE.BufferAttribute(work, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uFade: { value: 1 }, uSize: { value: 1.5 } },
      vertexShader: /* glsl */ `
        attribute float phase; attribute float work; uniform float uTime; uniform float uSize; varying float vR; varying float vWork;
        void main() {
          float r = position.x;
          float th = phase + uTime * 0.12 * pow(r, -1.5);
          vec3 p = vec3(cos(th), 0.0, sin(th)) * r;
          float ci = cos(position.y), si = sin(position.y);
          p = vec3(p.x, -p.z * si, p.z * ci);
          float cn = cos(position.z), sn = sin(position.z);
          p = vec3(p.x * cn + p.z * sn, p.y, -p.x * sn + p.z * cn);
          vR = r;
          vWork = work;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = uSize;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uFade; varying float vR; varying float vWork;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          float a = (vR < 2.0 ? 0.42 : 0.7) * uFade * (1.0 - d * 1.4) * (vWork > 0.5 ? 1.25 : 1.0);
          // Working: warm (the atlas's "still sending data" colour, softened). Dead: cold grey.
          vec3 c = vWork > 0.5 ? vec3(1.0, 0.68, 0.45) : vec3(0.72, 0.76, 0.84);
          gl_FragColor = vec4(c * a, a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    return { geo: g, mat: m };
  }, [working]);
  const { gl } = useThree();
  useFrame(({ camera }, dt) => {
    if (!still) mat.uniforms.uTime.value += Math.min(dt, 0.1);
    const d = camera.position.distanceTo(earth.pos);
    // Only near Earth: from farther out it would be a smudge, and a blizzard up close.
    mat.uniforms.uFade.value = Math.max(0, Math.min(1, (45 - d) / 25));
    mat.uniforms.uSize.value = 1.6 * gl.getPixelRatio();
  });
  return (
    // Earth's equator is tilted 23.4 deg, like the Earth globe (app/tour/scene/Earth.tsx).
    <group position={earth.pos} rotation={[0, 0, THREE.MathUtils.degToRad(23.4)]}>
      <points geometry={geo} material={mat} frustumCulled={false} />
    </group>
  );
}

// Every machine (or crowded landing site) as a small glow in its status colour. Flight.tsx dims the ones
// hidden behind a world and brightens the one you point at.
function Markers({ world }: { world: World }) {
  const geo = useMemo(() => {
    const pos = new Float32Array(world.sites.length * 3);
    world.sites.forEach((s, i) => pos.set([s.pos.x, s.pos.y, s.pos.z], i * 3));
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const col = new THREE.BufferAttribute(new Float32Array(world.sites.length * 3), 3);
    col.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute("color", col);
    return g;
  }, [world]);
  useLayoutEffect(() => {
    markerColors.attr = geo.getAttribute("color") as THREE.BufferAttribute;
  }, [geo]);
  const mat = useMemo(() => new THREE.PointsMaterial({ map: dotTexture(), vertexColors: true, size: 13, sizeAttenuation: false, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }), []);
  return <points geometry={geo} material={mat} renderOrder={20} frustumCulled={false} />;
}

// The real paths of the far travellers (JPL Horizons, public/data/trajectories.json): the whole path faint once
// launched, the part already flown by the timeline's date brighter. Their markers sit on it (model.ts trackAt).
function Paths({ tracks, date }: { tracks: Tracks; date: number }) {
  const lines = useMemo(
    () =>
      Object.entries(tracks).map(([id, t]) => {
        const pos = new Float32Array(t.points.length * 3);
        const v = new THREE.Vector3();
        t.points.forEach(([, x, y, z], i) => pos.set(eclToScene(x, y, z, v).toArray(), i * 3));
        const attr = new THREE.BufferAttribute(pos, 3);
        const all = new THREE.BufferGeometry().setAttribute("position", attr);
        const flown = new THREE.BufferGeometry().setAttribute("position", attr);
        const mk = (g: THREE.BufferGeometry, opacity: number) => new THREE.Line(g, new THREE.LineBasicMaterial({ color: "#e8eef7", transparent: true, opacity, depthWrite: false }));
        return { id, days: t.points.map((p) => p[0]), all: mk(all, 0.1), flown: mk(flown, 0.42) };
      }),
    [tracks],
  );
  const now = j2000Days(date);
  return lines.map((l) => {
    const n = l.days.findIndex((d) => d > now);
    l.flown.geometry.setDrawRange(0, n < 0 ? l.days.length : n);
    return now < l.days[0] ? null : (
      <group key={l.id}>
        <primitive object={l.all} />
        <primitive object={l.flown} />
      </group>
    );
  });
}

export function SolarScene({ world, tracks, date, start, still, working }: { world: World; tracks: Tracks; date: number; start: string; still: boolean; working: number }) {
  const earth = world.bodies.find((b) => b.key === "earth")!;
  return (
    <>
      <Stars radius={6000} count={4200} />
      <ambientLight intensity={0.05} />
      <pointLight position={[0, 0, 0]} intensity={2.7} decay={0} />
      <Sun r={world.bodies[0].r} />
      {world.bodies.slice(1).map((b) => (
        <World3D key={b.key} b={b} />
      ))}
      <Orbits bodies={world.bodies} />
      <Belt />
      <Heliopause />
      <Paths tracks={tracks} date={date} />
      <Debris earth={earth} still={still} working={working} />
      <Markers world={world} />
      <Flight world={world} start={start} still={still} />
    </>
  );
}
