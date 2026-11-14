"use client";

import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo } from "react";
import * as THREE from "three";
import { live } from "../state";
import type { Hotspot, ModelSpec, Stop } from "../stops";
import { useModel } from "./useModel";

export type Anchors = Record<string, THREE.Vector3>;

type GltfSpec = Extract<ModelSpec, { kind: "gltf" }>;

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

// Clone, size and place a NASA model at real scale, then work out where its hotspots sit.
export function prepareModel(source: THREE.Object3D, spec: GltfSpec, hotspots: Hotspot[]) {
  const model = source.clone(true);
  model.updateMatrixWorld(true);
  const all = meshes(model);

  for (const m of all) {
    // Some Blender exports carry a placeholder cube on the root node; keep its children, hide the cube.
    if (m.name === "_root") {
      m.material = new THREE.MeshBasicMaterial({ visible: false });
      continue;
    }
    if (spec.hideAbove !== undefined && boxOf([m]).max.y > spec.hideAbove) m.visible = false;
    m.castShadow = true;
    m.receiveShadow = true;
  }

  const shown = all.filter((m) => m.name !== "_root" && isShown(m));
  const box = boxOf(shown);
  const scale = spec.height ? spec.height / Math.max(1e-6, box.max.y - box.min.y) : spec.scale ?? 1;
  model.scale.setScalar(scale);
  if (spec.rotationY) model.rotation.y = spec.rotationY;
  model.updateMatrixWorld(true);

  const placed = boxOf(shown);
  const ref = spec.centerOn ? boxOf(shown.filter((m) => spec.centerOn!.some((p) => matches(m, p)))) : placed;
  const c = ref.getCenter(new THREE.Vector3());
  if (spec.origin === "ground") model.position.set(-c.x, -placed.min.y, -c.z);
  else model.position.set(-c.x, -c.y, -c.z);

  const wrapper = new THREE.Group();
  wrapper.add(model);
  wrapper.updateMatrixWorld(true);

  const anchors: Anchors = {};
  for (const h of hotspots) {
    const a = h.anchor;
    if ("pos" in a) {
      anchors[h.id] = new THREE.Vector3(...a.pos);
      continue;
    }
    const hit = shown.filter((m) => matches(m, a.part));
    if (!hit.length) continue;
    const b = boxOf(hit);
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

export function GltfMachine({ stop, onAnchors }: { stop: Stop; onAnchors: (a: Anchors) => void }) {
  const spec = stop.model as GltfSpec;
  const gltf = useModel(spec.url);
  const prepared = useMemo(() => {
    const p = prepareModel(gltf.scene, spec, stop.hotspots);
    if (stop.id === "ingenuity") breakBlades(p.model);
    return p;
  }, [gltf, spec, stop]);

  useLayoutEffect(() => onAnchors(prepared.anchors), [prepared, onAnchors]);

  useFrame((_, dt) => {
    breakUniforms.uTime.value += dt;
    breakUniforms.uGlow.value = live.brokenGlow;
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
