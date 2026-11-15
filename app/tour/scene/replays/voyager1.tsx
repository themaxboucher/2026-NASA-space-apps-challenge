"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { reducedMotion } from "../../lib/device";
import { useStore } from "../../lib/store";
import { endReplay, live, REPLAYS, setCaption, tour } from "../../state";
import { STOP_INDEX, type Stop } from "../../stops";
import { ghostMaterial, smooth, type Cue } from "../Ghost";
import { prepareModel, type GltfSpec } from "../Machine";
import { useModel } from "../useModel";
import { caption, disposeSprite, glowSprite, spaceShell } from "./cassini";

REPLAYS.add("voyager1");

// NASA's Voyager model is one big mesh ("tex_01") plus the dish. Its pieces are found by where they sit
// (in the placed model, metres): the magnetometer boom runs up and back from its canister at about
// (0, -1.15, 1.2) to (0, 7.4, 12.6); the science boom runs out along -z with the scan platform (cameras) at its end.
const BOOM_ROOT = new THREE.Vector3(0, -1.15, 1.2);
const BOOM_DIR = new THREE.Vector3(0, 8.57, 11.4).normalize();
const BOOM_BASE = 0.85; // the canister ends here; the boom slid out of it
enum Part {
  Body,
  Boom,
  Scan, // the scan platform: cameras and other instruments, switched off in 1990
  Mid, // instruments along the science boom, switched off as the power faded
  Near,
}
function partOf(c: THREE.Vector3) {
  const r = c.clone().sub(BOOM_ROOT);
  const along = r.dot(BOOM_DIR);
  if (along > BOOM_BASE && r.addScaledVector(BOOM_DIR, -along).length() < 0.3) return Part.Boom;
  if (c.z < -3) return Part.Scan;
  if (c.z < -2.2) return Part.Mid;
  if (c.z < -1.3) return Part.Near;
  return Part.Body;
}

// Split a mesh into one mesh per part, by where each triangle's middle is. The new geometries share the
// original's vertex data, so on cleanup only their own index is released (see dispose below).
function split(mesh: THREE.Mesh) {
  const g = mesh.geometry;
  const pos = g.attributes.position;
  const count = g.index ? g.index.count : pos.count;
  const at = (i: number) => (g.index ? g.index.getX(i) : i);
  const lists: number[][] = [[], [], [], [], []];
  const boxes = lists.map(() => new THREE.Box3());
  const a = new THREE.Vector3(),
    c = new THREE.Vector3();
  for (let i = 0; i < count; i += 3) {
    c.set(0, 0, 0);
    for (let k = 0; k < 3; k++) c.add(a.fromBufferAttribute(pos, at(i + k)));
    c.divideScalar(3).applyMatrix4(mesh.matrixWorld);
    const p = partOf(c);
    lists[p].push(at(i), at(i + 1), at(i + 2));
    boxes[p].expandByPoint(c);
  }
  const parts = lists.map((list) => {
    const geo = new THREE.BufferGeometry();
    for (const k in g.attributes) geo.setAttribute(k, g.attributes[k]);
    geo.setIndex(list);
    const m = mesh.clone();
    m.geometry = geo;
    mesh.parent!.add(m);
    return m;
  });
  mesh.removeFromParent();
  return { parts, boxes };
}

const SCAN_TURN = 17; // 14 February 1990: the scan platform turns back toward home
const DOT = 20; // the Pale Blue Dot appears
const REVEAL = 38.5;
const END = 44;
const CUES: Cue[] = [
  { at: 0, text: "5 September 1977: Voyager 1 blasts off from Florida, headed for the giant planets." },
  { at: 3, text: "Out in space it unfolds its magnetometer boom, 13 meters long, to keep that sensor far from the spacecraft’s own electronics." },
  { at: 8.5, text: "March 1979: it flies past Jupiter and discovers volcanoes erupting on the moon Io." },
  { at: 12.5, text: "November 1980: it swings past Saturn and its giant moon Titan, which flings it up and out of the planets’ path, toward the stars." },
  { at: 16.5, text: "14 February 1990. Six billion km from home, Voyager 1 turns its cameras back for one last look." },
  { at: DOT + 0.5, text: "It takes a Family Portrait of the planets. In one picture, Earth is just a pale blue dot, smaller than a single pixel." },
  { at: 25.5, text: "Soon after, its cameras are switched off for good, to save power for the long trip ahead." },
  { at: 29.5, text: "Its nuclear power slowly fades, so over the years engineers switch off one instrument after another." },
  { at: 33.5, text: "The cosmic ray detector went quiet in 2025, and a particle detector in April 2026. Just two instruments are still on." },
  { at: REVEAL - 0.5, text: "Today Voyager 1 is about 25 billion km away and still talking to us. Its messages take almost a whole day to reach Earth." },
];

type View = { pos: [number, number, number]; look: [number, number, number] };
const V_BOOM: View = { pos: [20, 3, 4.5], look: [0, 2.5, 4.5] };
const V_FLYBY: View = { pos: [9, 2, 10], look: [0, 0.5, 0] };
// Looking past the scan platform toward a point of light far away: home.
const EYE = new THREE.Vector3(5, 0.3, 1.5);
const toScan = new THREE.Vector3(0, -1.1, -3.6).sub(EYE).normalize();
const toDot = toScan.clone().add(new THREE.Vector3(-0.15, 0.45, 0)).normalize();
const DOT_AT = EYE.clone().addScaledVector(toDot, 900);
const between = EYE.clone().addScaledVector(toScan.clone().add(toDot).normalize(), 10);
const V_DOT: View = { pos: EYE.toArray(), look: between.toArray() };
const V_DIM: View = { pos: [8, 1, 8], look: [0, -0.5, -1.5] };
const V_NOW: View = { pos: [7, 1, 8], look: [0, 0, 0] };
const BLUE = new THREE.Color("#9fd8ff");
const GREY = new THREE.Color("#4a5560");

export function Voyager1Replay({ stop }: { stop: Stop; ground?: (x: number, z: number) => number }) {
  const on = useStore(tour, (s) => s.replay);
  const spec = stop.model as GltfSpec;
  const gltf = useModel(spec.url);
  const scene = useMemo(() => {
    const mats = [ghostMaterial(), ghostMaterial(), ghostMaterial(), ghostMaterial()]; // body + boom, scan, mid, near
    const { object } = prepareModel(gltf.scene, spec, []);
    const root = new THREE.Group();
    root.add(object);
    root.updateMatrixWorld(true);
    object.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      // The placeholder cube on the root node: empty it, so the ghost's depth copy doesn't draw it either.
      if (m.name === "_root") m.geometry = new THREE.BufferGeometry();
      m.material = mats[0];
      m.castShadow = m.receiveShadow = false;
    });
    const main = object.getObjectByName("tex_01") as THREE.Mesh | undefined;
    const made: THREE.BufferGeometry[] = [];
    let boom: THREE.Object3D | null = null,
      scan: THREE.Object3D | null = null;
    if (main?.isMesh) {
      const { parts, boxes } = split(main);
      made.push(...parts.map((p) => p.geometry));
      parts[Part.Scan].material = mats[1];
      parts[Part.Mid].material = mats[2];
      parts[Part.Near].material = mats[3];
      root.updateMatrixWorld(true);
      // The boom extends from the end of its canister: a pivot there, its z axis along the boom, scales it.
      boom = new THREE.Group();
      boom.position.copy(BOOM_ROOT).addScaledVector(BOOM_DIR, BOOM_BASE);
      boom.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), BOOM_DIR);
      // The scan platform turns about its own middle.
      scan = new THREE.Group();
      boxes[Part.Scan].getCenter(scan.position);
      root.add(boom, scan);
      root.updateMatrixWorld(true);
      boom.attach(parts[Part.Boom]);
      scan.attach(parts[Part.Scan]);
    }
    spaceShell(root);
    // Home, seen from six billion km: a tiny pale blue point of light.
    const dot = glowSprite("#6fa8ff");
    dot.position.copy(DOT_AT);
    dot.scale.setScalar(14);
    root.add(dot);
    return { root, mats, boom, scan, dot, made };
  }, [gltf, spec]);
  useEffect(
    () => () => {
      for (const m of scene.mats) m.dispose();
      disposeSprite(scene.dot);
      // Release only the split meshes' own index: the vertex data is shared with the real model.
      for (const g of scene.made) {
        for (const k of Object.keys(g.attributes)) g.deleteAttribute(k);
        g.dispose();
      }
      live.hideMachine = false;
      live.replayLook = null;
      live.replayView = null;
    },
    [scene],
  );

  const t0 = useRef(-1);
  const shown = useRef({ text: "", at: -1 });
  const gentle = useRef(false);
  useEffect(() => {
    if (!on) return;
    t0.current = -1;
    gentle.current = reducedMotion();
    return () => {
      shown.current = { text: "", at: -1 };
      live.replayLook = null;
      live.replayView = null;
      setCaption("", 0);
    };
  }, [on]);

  useFrame((state) => {
    const s = tour.get();
    const t = on && t0.current >= 0 ? state.clock.elapsedTime - t0.current : -1;
    live.hideMachine = !s.revealed.includes(stop.id) && t < REVEAL;
    scene.root.visible = on;
    if (!on) return;
    if (t0.current < 0) {
      t0.current = state.clock.elapsedTime;
      return;
    }

    // The boom slides out of its canister (never quite zero: a zero scale breaks the lighting maths).
    const out = smooth(3.5, 8.5, t);
    if (scene.boom) {
      scene.boom.scale.set(1, 1, Math.max(0.001, out));
      scene.boom.visible = out > 0.01;
    }
    // 1990: the scan platform swings round toward home.
    const turn = smooth(SCAN_TURN, SCAN_TURN + 3, t);
    scene.scan?.rotation.set(-0.35 * turn, 1.1 * turn, 0);

    // Ghost parts dim one by one as instruments are switched off: the cameras, then the others along the boom.
    const alpha = smooth(0, 1.5, t) * (1 - smooth(REVEAL, REVEAL + 2.5, t));
    const off = [0, smooth(26, 27.5, t), smooth(30, 31.5, t), smooth(34, 35.5, t)];
    scene.mats.forEach((m, i) => {
      m.uniforms.uAlpha.value = alpha * (1 - 0.75 * off[i]);
      m.uniforms.uColor.value.lerpColors(BLUE, GREY, off[i]);
    });

    // The Pale Blue Dot, twinkling softly (steady with reduced motion).
    const twinkle = gentle.current ? 1 : 0.85 + 0.15 * Math.sin(t * 3);
    scene.dot.material.opacity = smooth(DOT - 0.5, DOT + 1, t) * (1 - smooth(25, 27, t)) * twinkle;

    live.replayView = t < 8.5 ? V_BOOM : t < 16.5 ? V_FLYBY : t < 28.5 ? V_DOT : t < REVEAL ? V_DIM : V_NOW;

    caption(CUES, t, END, shown.current);
    // Only end our own replay: if you jump away mid-replay, endReplay would mark the stop you are going to.
    if (t >= END && s.stop === STOP_INDEX[stop.id]) endReplay();
  });

  return <primitive object={scene.root} />;
}
