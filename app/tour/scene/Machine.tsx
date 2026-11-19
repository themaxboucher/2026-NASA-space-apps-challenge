"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo } from "react";
import * as THREE from "three";
import { live, solids } from "../state";
import type { Hotspot, ModelSpec, Stop } from "../stops";
import { addSurfaceDetail } from "./surfaceDetail";
import { useModel } from "./useModel";

export type Anchors = Record<string, THREE.Vector3>;

export type GltfSpec = Extract<ModelSpec, { kind: "gltf" }>;

function isShown(o: THREE.Object3D) {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}

function meshes(root: THREE.Object3D) {
  const out: THREE.Mesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh);
  });
  return out;
}

function boxOf(list: THREE.Object3D[]) {
  const box = new THREE.Box3();
  const tmp = new THREE.Box3();
  for (const m of list) {
    const g = (m as THREE.Mesh).geometry;
    if (!g) continue;
    if (!g.boundingBox) g.computeBoundingBox();
    tmp.copy(g.boundingBox!).applyMatrix4(m.matrixWorld);
    box.union(tmp);
  }
  return box;
}

function matches(m: THREE.Mesh, part: string) {
  const p = part.toLowerCase();
  const mats = Array.isArray(m.material) ? m.material : [m.material];
  return (
    m.name.toLowerCase() === p ||
    (m.parent?.name ?? "").toLowerCase() === p ||
    mats.some((x) => (x?.name ?? "").toLowerCase() === p)
  );
}

function lowestY(list: THREE.Mesh[]) {
  const v = new THREE.Vector3();
  let low = Infinity;
  for (const m of list) {
    const p = m.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) low = Math.min(low, v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld).y);
  }
  return low;
}

// Clone, size and place a NASA model at real scale, then work out where its hotspots sit.
// Small parts of the lunar module's top half that sit low enough to slip under hideAbove (a 7 cm sphere floated
// over Eagle's deck).
const TOP_HALF_STRAYS = new Set(["pSphere28"]);

export function prepareModel(source: THREE.Object3D, spec: GltfSpec, hotspots: Hotspot[]) {
  const model = source.clone(true);
  const all = meshes(model);
  for (const [part, k] of spec.partScale ?? []) for (const m of all) if (matches(m, part)) m.scale.multiply(new THREE.Vector3(...k));
  model.updateMatrixWorld(true);

  for (const m of all) {
    // Some Blender exports carry a placeholder cube on the root node; keep its children, hide the cube.
    if (m.name === "_root") {
      m.material = new THREE.MeshBasicMaterial({ visible: false });
      continue;
    }
    if (spec.hideAbove !== undefined && (boxOf([m]).max.y > spec.hideAbove || TOP_HALF_STRAYS.has(m.name))) m.visible = false;
    if (spec.hideBelow !== undefined && boxOf([m]).max.y <= spec.hideBelow && !TOP_HALF_STRAYS.has(m.name)) m.visible = false;
    m.castShadow = !spec.ghost;
    m.receiveShadow = !spec.ghost;
  }

  const shown = all.filter((m) => m.name !== "_root" && isShown(m));
  const box = boxOf(shown);
  let scale = spec.height ? spec.height / Math.max(1e-6, box.max.y - box.min.y) : spec.scale ?? 1;
  if (spec.span) {
    const size = box.getSize(new THREE.Vector3());
    const longest = Math.max(size.x, size.y, size.z, 1e-6);
    scale = longest > spec.span / 2.5 && longest < spec.span * 2.5 ? 1 : spec.span / longest;
  }
  model.scale.setScalar(scale);
  model.rotation.set(...(spec.tilt ?? [0, spec.rotationY ?? 0, 0]));
  model.updateMatrixWorld(true);
  // Foil, metal, cells and paint get surface texture. Cassini keeps its own foil (see SpaceStop's CaptureReflections).
  if (!spec.url.includes("cassini")) addSurfaceDetail(model);

  const placed = boxOf(shown);
  // A tilted model's boxes overstate how low it reaches: stand it on its real lowest point.
  if (spec.tilt) placed.min.y = lowestY(shown);
  const ref = spec.centerOn ? boxOf(shown.filter((m) => spec.centerOn!.some((p) => matches(m, p)))) : placed;
  const c = ref.getCenter(new THREE.Vector3());
  if (spec.origin === "ground") model.position.set(-c.x, -placed.min.y, -c.z);
  else model.position.set(-c.x, -c.y, -c.z);

  const wrapper = new THREE.Group();
  wrapper.add(model);
  if (spec.at) wrapper.position.set(...spec.at);
  wrapper.updateMatrixWorld(true);
  if (spec.cut) {
    const boxes = spec.cut.map((c) => new THREE.Box3(new THREE.Vector3(...c.min), new THREE.Vector3(...c.max)));
    for (const m of shown) cutAway(m, boxes);
  }

  const anchors: Anchors = {};
  for (const h of hotspots) {
    const a = h.anchor;
    if ("pos" in a) {
      anchors[h.id] = new THREE.Vector3(...a.pos);
      continue;
    }
    const hit = shown.filter((m) => matches(m, a.part));
    // A part name the model doesn't have: place the spot on the whole machine's box instead of losing it.
    const b = hit.length ? boxOf(hit) : placed.clone().applyMatrix4(new THREE.Matrix4().makeTranslation(model.position.clone().add(wrapper.position)));
    const p = new THREE.Vector3(
      b.min.x + (b.max.x - b.min.x) * a.at[0],
      b.min.y + (b.max.y - b.min.y) * a.at[1],
      b.min.z + (b.max.z - b.min.z) * a.at[2],
    );
    if (a.offset) p.add(new THREE.Vector3(...a.offset));
    anchors[h.id] = p;
  }
  return { object: wrapper, model, anchors };
}

// Removes the triangles whose middle lies inside any of the boxes (world metres), on a copy of the mesh's geometry
// (the loaded model is shared). Keeps its material groups.
function cutAway(m: THREE.Mesh, boxes: THREE.Box3[]) {
  const g = m.geometry;
  const pos = g.attributes.position;
  const index = g.index ? Array.from(g.index.array) : Array.from({ length: pos.count }, (_, i) => i);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const keep = (t: number) => {
    a.fromBufferAttribute(pos, index[t]);
    b.fromBufferAttribute(pos, index[t + 1]);
    c.fromBufferAttribute(pos, index[t + 2]);
    a.add(b).add(c).divideScalar(3).applyMatrix4(m.matrixWorld);
    return !boxes.some((x) => x.containsPoint(a));
  };
  const groups = g.groups.length ? g.groups : [{ start: 0, count: index.length, materialIndex: 0 }];
  const out: number[] = [];
  const kept: { start: number; count: number; materialIndex?: number }[] = [];
  for (const gr of groups) {
    const start = out.length;
    for (let t = gr.start; t + 2 < Math.min(gr.start + gr.count, index.length); t += 3) if (keep(t)) out.push(index[t], index[t + 1], index[t + 2]);
    kept.push({ start, count: out.length - start, materialIndex: gr.materialIndex });
  }
  if (out.length === index.length) return;
  const copy = g.clone();
  copy.setIndex(out);
  copy.clearGroups();
  if (g.groups.length) for (const k of kept) copy.addGroup(k.start, k.count, k.materialIndex);
  copy.computeBoundingBox();
  copy.computeBoundingSphere();
  m.geometry = copy;
}

// Ingenuity's last flight: all four blades snapped about a third of the way from the tip, and one tore off at the root.
// The blades are cut in the shader, and the broken edges glow red.
const breakUniforms = { uTime: { value: 0 }, uGlow: { value: 0.6 } };
function breakBlades(model: THREE.Object3D) {
  const radius = 0.6; // rotor radius in meters (1.2 m across)
  const cut = radius * (2 / 3);
  const rotors = ["rotors_01", "rotors_02"];
  for (const name of rotors) {
    const rotor = model.getObjectByName(name);
    if (!rotor) continue;
    const torn = name === "rotors_01";
    rotor.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mat = m.material as THREE.MeshStandardMaterial;
      if (!mat || !/blade|carbon/i.test(mat.name)) return;
      const copy = mat.clone();
      copy.side = THREE.DoubleSide;
      copy.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = breakUniforms.uTime;
        shader.uniforms.uGlow = breakUniforms.uGlow;
        shader.uniforms.uCut = { value: cut };
        shader.uniforms.uTorn = { value: torn ? 1 : 0 };
        shader.uniforms.uTornDir = { value: new THREE.Vector2(0, 1) };
        shader.vertexShader = shader.vertexShader
          .replace("#include <common>", "#include <common>\nvarying vec3 vBreakPos;")
          .replace("#include <begin_vertex>", "#include <begin_vertex>\nvBreakPos = (modelMatrix * vec4(transformed, 1.0)).xyz;");
        shader.fragmentShader = shader.fragmentShader
          .replace(
            "#include <common>",
            "#include <common>\nvarying vec3 vBreakPos;\nuniform float uTime;\nuniform float uGlow;\nuniform float uCut;\nuniform float uTorn;\nuniform vec2 uTornDir;",
          )
          .replace(
            "#include <clipping_planes_fragment>",
            `#include <clipping_planes_fragment>
            float br = length(vBreakPos.xz);
            float bdir = dot(normalize(vBreakPos.xz + 1e-5), uTornDir);
            if (br > uCut || (uTorn > 0.5 && bdir > 0.75 && br > 0.075)) discard;`,
          )
          .replace(
            "#include <emissivemap_fragment>",
            `#include <emissivemap_fragment>
            float bedge = smoothstep(uCut - 0.07, uCut, br);
            if (uTorn > 0.5 && bdir > 0.6) bedge = max(bedge, smoothstep(0.03, 0.075, br));
            totalEmissiveRadiance += vec3(1.0, 0.16, 0.06) * bedge * uGlow * (0.55 + 0.45 * sin(uTime * 4.0));`,
          );
      };
      copy.customProgramCacheKey = () => `blade-break-${torn ? 1 : 0}`;
      m.material = copy;
    });
  }
}

// Every "broken" hotspot lights the part it points at: the part's material is copied and given a red glow,
// which pulses with the same rhythm as Ingenuity's snapped blades. When that part is a big piece of the model (many
// NASA models are a few merged meshes), only a ball around the spot glows, fading out at its edge.
const GLOW_ZONES = 4;
function glowBrokenParts(model: THREE.Object3D, hotspots: Hotspot[], anchors: Anchors) {
  const all = meshes(model).filter(isShown);
  const machine = boxOf(all).getSize(new THREE.Vector3()).length();
  // Per mesh, the balls that glow (x, y, z, radius); radius 0 lights the whole mesh.
  const zones = new Map<THREE.Mesh, THREE.Vector4[]>();
  const add = (m: THREE.Mesh, z: THREE.Vector4) => zones.set(m, [...(zones.get(m) ?? []), z].slice(0, GLOW_ZONES));
  for (const h of hotspots) {
    if (!h.broken) continue;
    const at = anchors[h.id];
    // Extra named parts: all of each, or a ball around the spot if the spot gives a radius.
    for (const p of h.glow ?? [])
      for (const m of all) if (matches(m, p)) add(m, h.glowRadius && at ? new THREE.Vector4(...at.toArray(), h.glowRadius) : new THREE.Vector4(0, 0, 0, 0));
    if (!("part" in h.anchor) || !at) continue;
    const part = h.anchor.part;
    const hit = all.filter((m) => matches(m, part));
    const size = boxOf(hit).getSize(new THREE.Vector3()).length();
    const r = h.glowRadius ?? (size > machine / 3 ? Math.max(0.15, size * 0.2) : 0);
    for (const m of hit) add(m, new THREE.Vector4(...at.toArray(), r));
  }
  const lit: THREE.MeshStandardMaterial[] = [];
  for (const [m, z] of zones) {
    const at = [...z, ...Array.from({ length: GLOW_ZONES - z.length }, () => new THREE.Vector4(0, 0, 0, -1))];
    const copy = (mat: THREE.Material) => {
      const c = mat.clone() as THREE.MeshStandardMaterial;
      if (!c.emissive) return c;
      c.emissive = new THREE.Color("#ff2a10");
      c.emissiveIntensity = 0;
      c.onBeforeCompile = (shader) => {
        shader.uniforms.uGlowAt = { value: at };
        shader.vertexShader = shader.vertexShader
          .replace("#include <common>", "#include <common>\nvarying vec3 vGlowPos;")
          .replace("#include <begin_vertex>", "#include <begin_vertex>\nvGlowPos = (modelMatrix * vec4(transformed, 1.0)).xyz;");
        shader.fragmentShader = shader.fragmentShader
          .replace("#include <common>", `#include <common>\nvarying vec3 vGlowPos;\nuniform vec4 uGlowAt[${GLOW_ZONES}];`)
          .replace(
            "#include <emissivemap_fragment>",
            `#include <emissivemap_fragment>
            float glowK = 0.0;
            for (int i = 0; i < ${GLOW_ZONES}; i++) {
              vec4 z = uGlowAt[i];
              if (z.w == 0.0) glowK = 1.0;
              else if (z.w > 0.0) glowK = max(glowK, 1.0 - smoothstep(z.w * 0.45, z.w, distance(vGlowPos, z.xyz)));
            }
            totalEmissiveRadiance *= glowK;`,
          );
      };
      c.customProgramCacheKey = () => "broken-glow";
      lit.push(c);
      return c;
    };
    m.material = Array.isArray(m.material) ? m.material.map(copy) : copy(m.material);
  }
  return lit;
}

// Registers a machine for walking collisions while it is on screen (not a ghost: there is nothing there to bump into).
function useSolid(object: THREE.Object3D | null) {
  useEffect(() => {
    if (!object) return;
    solids.add(object);
    return () => {
      solids.delete(object);
    };
  }, [object]);
}

// A machine that is gone (crashed, burned up, lost): its model drawn as a hologram, see-through and edged with light,
// each part keeping a hint of its own colour so the pieces can still be told apart. Faint lines drift up through it.
const ghostUniforms = { uTime: { value: 0 }, uAlpha: { value: 0 } };
const GHOST_TINT = new THREE.Color("#8fd0ff");
function ghostify(model: THREE.Object3D) {
  const made = new Map<THREE.Material, THREE.ShaderMaterial>();
  const make = (src: THREE.Material) => {
    let g = made.get(src);
    if (g) return g;
    const base = (src as THREE.MeshStandardMaterial).color?.clone() ?? new THREE.Color("#9aa0a8");
    // Very dark parts (black blankets, engine bells) would vanish: lift them before tinting.
    const hsl = { h: 0, s: 0, l: 0 };
    base.getHSL(hsl);
    base.setHSL(hsl.h, hsl.s * 0.8, Math.max(0.3, hsl.l)).lerp(GHOST_TINT, 0.5);
    g = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: base }, uTime: ghostUniforms.uTime, uAlpha: ghostUniforms.uAlpha },
      vertexShader: `varying vec3 vN; varying vec3 vV; varying float vY;
        void main() { vec4 w = modelMatrix * vec4(position, 1.0); vec4 mv = viewMatrix * w; vY = w.y;
          vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 uColor; uniform float uTime; uniform float uAlpha; varying vec3 vN; varying vec3 vV; varying float vY;
        void main() {
          float facing = abs(dot(normalize(vN), normalize(vV)));
          float rim = pow(1.0 - facing, 2.2);
          float lines = 0.86 + 0.14 * sin(vY * 34.0 - uTime * 1.6);
          vec3 col = uColor * (0.55 + 0.45 * facing) + vec3(0.55, 0.8, 1.0) * rim * 0.9;
          gl_FragColor = vec4(col * lines, (0.3 + 0.62 * rim) * uAlpha);
        }`,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    made.set(src, g);
    return g;
  };
  for (const m of meshes(model)) {
    m.material = Array.isArray(m.material) ? m.material.map(make) : make(m.material);
    m.renderOrder = 1000; // after the ground and its dust, so the ghost never cuts a hole in them
  }
}

export function GltfMachine({ stop, onAnchors, ground }: { stop: Stop; onAnchors: (a: Anchors) => void; ground?: (x: number, z: number) => number }) {
  const spec = stop.model as GltfSpec;
  const gltf = useModel(spec.url);
  const prepared = useMemo(() => {
    // A model placed away from the middle (a ghost over its crater) keeps its height above the ground there.
    const at = spec.at && ground ? ([spec.at[0], spec.at[1] + Math.max(0, ground(spec.at[0], spec.at[2])), spec.at[2]] as [number, number, number]) : spec.at;
    const p = prepareModel(gltf.scene, at === spec.at ? spec : { ...spec, at }, stop.hotspots);
    if (stop.id === "ingenuity") breakBlades(p.model);
    if (spec.ghost) ghostify(p.model);
    return { ...p, lit: stop.id === "ingenuity" || spec.ghost ? [] : glowBrokenParts(p.model, stop.hotspots, p.anchors) };
  }, [gltf, spec, stop, ground]);

  useLayoutEffect(() => onAnchors(prepared.anchors), [prepared, onAnchors]);
  // For checking a site from the console while developing: what loaded, and where its spots landed.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const size = new THREE.Box3().setFromObject(prepared.object).getSize(new THREE.Vector3());
    Object.assign(window, { __machine: { id: stop.id, url: spec.url, ghost: !!spec.ghost, meshes: meshes(prepared.model).filter(isShown).length, size: size.toArray().map((v) => +v.toFixed(2)), hotspots: stop.hotspots.length, anchors: Object.keys(prepared.anchors).length } });
  }, [prepared, stop, spec]);
  useSolid(spec.ghost ? null : prepared.object);
  // A ghost fades in when you arrive.
  useLayoutEffect(() => {
    if (spec.ghost) ghostUniforms.uAlpha.value = 0;
  }, [spec, prepared]);

  useFrame((_, dt) => {
    prepared.object.visible = !live.hideMachine;
    if (spec.ghost) {
      ghostUniforms.uTime.value += dt;
      // Hidden while the replay plays; it fades in when the replay hands over to it.
      ghostUniforms.uAlpha.value = live.hideMachine ? 0 : Math.min(1, ghostUniforms.uAlpha.value + dt * 0.9);
    }
    breakUniforms.uTime.value += dt;
    breakUniforms.uGlow.value = live.brokenGlow;
    const k = 0.5 * live.brokenGlow * (0.6 + 0.4 * Math.sin(breakUniforms.uTime.value * 4));
    for (const m of prepared.lit) m.emissiveIntensity = k;
  });

  return <primitive object={prepared.object} />;
}

// Falcon beside the rover: the same Apollo Lunar Module model, with its departed top half removed.
export function LanderDescent({ position, rotationY }: { position: [number, number, number]; rotationY: number }) {
  const gltf = useModel("/models/apollo-lm.gltf.json");
  const object = useMemo(
    () => prepareModel(gltf.scene, { kind: "gltf", url: "", scale: 1.43, hideAbove: 2.95, origin: "ground" }, []).object,
    [gltf],
  );
  useSolid(object);
  return <primitive object={object} position={position} rotation={[0, rotationY, 0]} />;
}

// The piece of blade Perseverance photographed on the sand, about 15 m west of Ingenuity.
export function BladePiece({ position, rotationY }: { position: [number, number, number]; rotationY: number }) {
  const geometry = useMemo(() => {
    const g = new THREE.BoxGeometry(0.2, 0.008, 0.075, 8, 1, 2);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      // Taper toward the tip and give it a slight curve, like a blade airfoil.
      const k = 1 - (x + 0.1) * 1.6;
      p.setZ(i, p.getZ(i) * Math.max(0.55, k));
      p.setY(i, p.getY(i) + Math.sin((x + 0.1) * 12) * 0.004);
    }
    g.computeVertexNormals();
    return g;
  }, []);
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#3a3936", roughness: 0.55, metalness: 0.1, emissive: "#ff2a10", emissiveIntensity: 0 }),
    [],
  );
  useFrame(() => {
    material.emissiveIntensity = 0.25 * live.brokenGlow * (0.55 + 0.45 * Math.sin(breakUniforms.uTime.value * 4));
  });
  return <mesh geometry={geometry} material={material} position={position} rotation={[0.04, rotationY, 0.08]} castShadow />;
}
