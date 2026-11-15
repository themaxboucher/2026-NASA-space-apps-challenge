"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useStore } from "../../lib/store";
import { endReplay, live, REPLAYS, setCaption, tour } from "../../state";
import { STOP_INDEX, type Stop } from "../../stops";
import { ghostMaterial, shell, smooth, type Cue } from "../Ghost";
import { prepareModel, type GltfSpec } from "../Machine";
import { useModel } from "../useModel";
import { caption, disposeSprite, glowSprite } from "./cassini";

REPLAYS.add("ingenuity");

// Ingenuity's story at Jezero: the first flight, a time-lapse of the hops that followed, and the hard landing on
// flight 72. Times are seconds from the start of the replay.
const HOP_A = 16.5; // the time-lapse of flights 2–71
const HOP_B = 27;
const HIT = 31; // flight 72 touches down hard
const REVEAL = 34; // the real, broken helicopter appears
const END = 40;
const CUES: Cue[] = [
  { at: 0, text: "19 April 2021, Jezero crater on Mars. Ingenuity is about to try something nobody had ever done: fly on another planet." },
  { at: 3.5, text: "Its two rotors spin up to about 2,400 turns a minute. Mars air is so thin that they have to whirl super fast." },
  { at: 7.5, text: "Lift-off! It climbs about 3 meters, hovers, and lands again. The whole flight takes 39 seconds." },
  { at: 13, text: "The first powered flight on another world! NASA named this spot Wright Brothers Field." },
  { at: HOP_A, text: "It was only meant to fly 5 times. But it kept going, hop after hop, farther and farther: flight {n}." },
  { at: HOP_B, text: "18 January 2024, flight 72. Over smooth, plain sand, its navigation camera can’t find enough landmarks to judge its speed." },
  { at: HIT, text: "Bump! It lands too hard. All four blades snap, and a piece flies off across the sand." },
  { at: REVEAL + 1, text: "Ingenuity will never fly again. It still stands right here, where it landed for the last time." },
];
// Where each hop of the time-lapse goes (x, z in meters) before coming back.
const HOPS: [number, number][] = [
  [-4.5, -1.5],
  [-6, 2.5],
  [2.5, -5],
  [-7.5, -0.5],
  [-3, 4],
];
const Q = new THREE.Quaternion();
const VIEW = { pos: [3.4, 0, 4.4] as [number, number, number], look: [0, 0.6, 0] as [number, number, number] };

export function IngenuityReplay({ stop, ground = () => 0 }: { stop: Stop; ground?: (x: number, z: number) => number }) {
  const on = useStore(tour, (s) => s.replay);
  const spec = stop.model as GltfSpec;
  const gltf = useModel(spec.url);
  const scene = useMemo(() => {
    const mat = ghostMaterial();
    // The helicopter as it was before flight 72: whole blades (the real model draws them snapped short).
    const { object } = prepareModel(gltf.scene, { ...spec, partScale: undefined }, []);
    object.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.material = mat;
      m.castShadow = m.receiveShadow = false;
    });
    const heli = new THREE.Group();
    heli.add(object);
    heli.updateMatrixWorld(true);
    // The two rotors turn in opposite directions about the mast, which is "up" seen from inside each rotor's frame.
    const q = new THREE.Quaternion();
    const rotors = ["rotors_01", "rotors_02"].flatMap((name, i) => {
      const r = object.getObjectByName(name);
      if (!r) return [];
      const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(r.getWorldQuaternion(q).invert());
      return [{ r, base: r.quaternion.clone(), axis, dir: i ? -1 : 1 }];
    });
    // The piece of blade that flew off, the same size as the real one lying on the sand.
    const pieceMat = ghostMaterial("#ffb3a0");
    const piece = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.012, 0.075), pieceMat);
    const root = new THREE.Group();
    root.add(heli, piece);
    shell(root);
    // A small glow rides with the piece, so you can follow it 15 m across the sand.
    const trail = glowSprite("#ff9a80");
    trail.scale.setScalar(0.6);
    root.add(trail);
    return { root, mat, heli, rotors, piece, pieceMat, trail };
  }, [gltf, spec]);
  useEffect(
    () => () => {
      scene.mat.dispose();
      scene.pieceMat.dispose();
      scene.piece.geometry.dispose();
      disposeSprite(scene.trail);
      live.hideMachine = false;
      live.replayLook = null;
      live.replayView = null;
    },
    [scene],
  );

  const t0 = useRef(-1);
  const spin = useRef(0);
  const shown = useRef({ text: "", at: -1 });
  useEffect(() => {
    if (!on) return;
    t0.current = -1;
    spin.current = 0;
    return () => {
      shown.current = { text: "", at: -1 };
      live.replayLook = null;
      live.replayView = null;
      setCaption("", 0);
    };
  }, [on]);

  const end = (stop.extras ?? []).find((x) => x.kind === "blade-piece");
  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const s = tour.get();
    const t = on && t0.current >= 0 ? state.clock.elapsedTime - t0.current : -1;
    // Until the replay has played, the helicopter hasn't arrived yet: the real (broken) one is hidden.
    live.hideMachine = !s.revealed.includes(stop.id) && t < REVEAL;
    scene.root.visible = on;
    if (!on) return;
    if (t0.current < 0) {
      t0.current = state.clock.elapsedTime;
      live.replayView = VIEW;
      return;
    }

    // Where the helicopter is: flight 1, then the hops, then flight 72.
    let x = 0,
      z = 0,
      y = 3 * smooth(6.8, 8.6, t) * (1 - smooth(10.6, 12.4, t));
    if (t > HOP_A && t < HOP_B) {
      const k = ((t - HOP_A) / (HOP_B - HOP_A)) * HOPS.length;
      const i = Math.floor(k),
        u = k - i;
      const out = smooth(0.15, 0.5, u) * (1 - smooth(0.5, 0.85, u));
      x = HOPS[i][0] * out;
      z = HOPS[i][1] * out;
      y = 1.6 * smooth(0, 0.2, u) * (1 - smooth(0.8, 1, u));
    }
    // Flight 72: up about 4 m, then down too fast (still falling when it touches).
    if (t > HOP_B && t < HIT) y = 4 * smooth(27.3, 29, t) * (1 - Math.pow(Math.min(1, Math.max(0, (t - 29.8) / 1.2)), 2));
    // The real helicopter stands at y = 0, so heights are measured from the ground under it.
    scene.heli.position.set(x, ground(x, z) - ground(0, 0) + y, z);
    // The hard landing: it rocks over and settles back on its legs.
    const e = t - HIT;
    scene.heli.rotation.z = e > 0 ? 0.5 * Math.exp(-2 * e) * Math.sin(6 * e) : 0;

    // Rotors: spin up for flight 1, stop, then keep spinning through the hops until the crash.
    const w = 40 * (smooth(1.5, 5.5, t) * (1 - smooth(12, 14, t)) + smooth(15, 16.5, t) * (1 - smooth(HIT, HIT + 0.6, t)));
    spin.current += w * dt;
    for (const r of scene.rotors) r.r.quaternion.copy(r.base).multiply(Q.setFromAxisAngle(r.axis, spin.current * r.dir));

    // The blade piece arcs off to where the real one lies.
    const [px, , pz] = end?.pos ?? [-15, 0, 0.6];
    const rotY = end?.rotationY ?? 0.7;
    const u = Math.min(1, Math.max(0, e / 2.4));
    scene.piece.visible = e > 0;
    scene.piece.position.set(-0.3 + (px + 0.3) * u, 0.42 + (ground(px, pz) + 0.012 - 0.42) * u + 3 * u * (1 - u), 0.1 + (pz - 0.1) * u);
    scene.piece.rotation.set((1 - u) * 9, rotY + (1 - u) * 12, 0);

    const alpha = smooth(0, 1.2, t) * (1 - smooth(REVEAL - 0.5, REVEAL + 1.5, t));
    scene.mat.uniforms.uAlpha.value = alpha;
    scene.pieceMat.uniforms.uAlpha.value = 1.4 * smooth(HIT, HIT + 0.1, t) * (1 - smooth(HIT + 2.6, HIT + 4, t));
    scene.trail.position.copy(scene.piece.position);
    scene.trail.material.opacity = 0.7 * smooth(HIT, HIT + 0.1, t) * (1 - smooth(HIT + 2.4, HIT + 3.4, t));

    // Watch the helicopter, then the flying blade piece, then the real helicopter.
    const h = scene.heli.position;
    live.replayLook = e > 0 && e < 3.2 ? [scene.piece.position.x, scene.piece.position.y, scene.piece.position.z] : t >= REVEAL ? [0, 0.3, 0] : [h.x, h.y + 0.25, h.z];

    // Captions; {n} counts the flights during the time-lapse.
    const n = Math.min(71, Math.max(2, 2 + Math.floor((69 * (t - HOP_A)) / (HOP_B - HOP_A - 0.5))));
    caption(CUES, t, END, shown.current, (s) => s.replace("{n}", String(n)));
    // Only end our own replay: if you jump away mid-replay, endReplay would mark the stop you are going to.
    if (t >= END && s.stop === STOP_INDEX[stop.id]) endReplay();
  });

  return <primitive object={scene.root} />;
}
