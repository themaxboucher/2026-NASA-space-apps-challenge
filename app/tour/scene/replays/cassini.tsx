"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { reducedMotion } from "../../lib/device";
import { useStore } from "../../lib/store";
import { endReplay, hud, live, REPLAYS, setCaption, tour } from "../../state";
import { STOP_INDEX, type Stop } from "../../stops";
import { ghostMaterial, shell, smooth, type Cue } from "../Ghost";
import { prepareModel, type GltfSpec } from "../Machine";
import { useModel } from "../useModel";

REPLAYS.add("cassini");

// A soft round glow (for sparks and far-off points of light), drawn on top of everything.
export function glowSprite(color: string) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.25, "rgba(255,255,255,0.45)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const material = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), color, transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
  const sprite = new THREE.Sprite(material);
  sprite.renderOrder = 1001;
  return sprite;
}
export function disposeSprite(s: THREE.Sprite) {
  s.material.map?.dispose();
  s.material.dispose();
}

// Writes the caption for time t. The progress bar restarts only when a new cue starts; a counter ({n}) ticking
// inside a cue changes the text alone, so the bar keeps running.
export function caption(cues: Cue[], t: number, end: number, shown: { text: string; at: number }, fill = (s: string) => s) {
  let i = -1;
  for (let k = 0; k < cues.length; k++) if (t >= cues[k].at) i = k;
  if (i < 0) return;
  const line = fill(cues[i].text);
  if (cues[i].at !== shown.at) {
    shown.at = cues[i].at;
    shown.text = line;
    setCaption(line, (cues[i + 1]?.at ?? end) - Math.max(cues[i].at, t));
  } else if (line !== shown.text) {
    shown.text = line;
    if (hud.replayLine) hud.replayLine.textContent = line;
  }
}

// shell() from Ghost.tsx, but with its depth copies drawn in the transparent pass: the opaque ones are drawn before
// Saturn's rings, the stars and the Sun's glow (all transparent), and would cut a dark hole in them behind the ghost.
const depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false, transparent: true });
export function spaceShell(root: THREE.Object3D) {
  shell(root);
  root.traverse((o) => {
    if (o.userData.depthCopy) (o as THREE.Mesh).material = depthOnly;
  });
}

// Saturn as scene/SpaceStop.tsx draws it (SATURN_AT, SATURN_R there).
const SATURN = new THREE.Vector3(-0.66, -0.3, -0.69).normalize().multiplyScalar(1500);
const SATURN_R = 560;
// Where Cassini hits the cloud tops: the middle of Saturn's disc as seen from here.
const ENTRY = SATURN.clone().multiplyScalar(1 - (SATURN_R + 10) / 1500);
// Huygens leaves from Cassini's +x side, toward Titan.
const TITAN_DIR = new THREE.Vector3(1, 0.12, 0.25).normalize();

const SEP = 3.5; // Huygens separates
const ORB_A = 12; // the orbit time-lapse
const ORB_B = 22;
const PLUNGE = 28; // steered into Saturn
const HIT = 31; // burns up in the clouds
const REVEAL = 34.5; // the memorial model appears
const END = 41;
const CUES: Cue[] = [
  { at: 0, text: "2004: after a seven-year trip, Cassini arrives at Saturn. Riding on its side is Huygens, a probe built in Europe." },
  { at: SEP, text: "25 December 2004: Huygens springs free and drifts away toward Titan, Saturn’s biggest moon." },
  { at: 8, text: "Three weeks later it parachutes down onto Titan: the farthest landing anyone has ever made." },
  { at: ORB_A + 0.3, text: "Year after year, Cassini loops around Saturn, exploring its rings and moons. Orbit {n}" },
  { at: 17.5, text: "It spots icy jets spraying out of the little moon Enceladus, flies through them and tastes salty water from an ocean hidden under the ice." },
  { at: 22.5, text: "April 2017: almost out of fuel, Cassini begins its Grand Finale, 22 daring dives between Saturn and its rings." },
  { at: 27, text: "15 September 2017: NASA steers it into Saturn on purpose, so it can never crash into a moon that might hold life." },
  { at: HIT, text: "Cassini sends back science to the very end, then burns up like a shooting star in Saturn’s clouds." },
  { at: REVEAL, text: "Nothing of Cassini is left. The spacecraft you see here is a model of how it looked: a memorial to what was once here." },
];
type View = { pos: [number, number, number]; look: [number, number, number] };
const V_SEP: View = { pos: [4, 3, 22], look: [5, 0, 0] };
const V_ORBIT: View = { pos: [8, 10, 36], look: [0, 0, 0] };
const V_FINALE: View = { pos: [12, 3, 10], look: [0, 0, 0] };
const V_NOW: View = { pos: [9, 1.5, 9], look: [0, 0, 0] };

export function CassiniReplay({ stop }: { stop: Stop; ground?: (x: number, z: number) => number }) {
  const on = useStore(tour, (s) => s.replay);
  const spec = stop.model as GltfSpec;
  const gltf = useModel(spec.url);
  const scene = useMemo(() => {
    const mat = ghostMaterial();
    const huyMat = ghostMaterial("#ffd59a"); // Huygens wore gold foil
    const { object } = prepareModel(gltf.scene, spec, []);
    const craft = new THREE.Group();
    craft.add(object);
    const huy = new THREE.Group();
    const root = new THREE.Group();
    root.add(craft, huy);
    root.updateMatrixWorld(true);
    // Huygens is the pair of parts named "..._h"; they move to their own group so the probe can drift away.
    const probe: THREE.Mesh[] = [];
    object.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      // The placeholder cube on the root node: empty it, so the ghost's depth copy doesn't draw it either.
      if (m.name === "_root") m.geometry = new THREE.BufferGeometry();
      m.castShadow = m.receiveShadow = false;
      if (/_h$/.test(m.name)) probe.push(m);
      m.material = /_h$/.test(m.name) ? huyMat : mat;
    });
    const box = new THREE.Box3();
    for (const m of probe) box.expandByObject(m);
    box.getCenter(huy.position);
    huy.updateMatrixWorld(true);
    for (const m of probe) huy.attach(m);
    const home = huy.position.clone();
    spaceShell(root);
    const spark = glowSprite("#ffb070");
    const flash = glowSprite("#ffb070");
    flash.position.copy(ENTRY);
    root.add(spark, flash);
    return { root, mat, huyMat, craft, huy, home, spark, flash };
  }, [gltf, spec]);
  useEffect(
    () => () => {
      scene.mat.dispose();
      scene.huyMat.dispose();
      disposeSprite(scene.spark);
      disposeSprite(scene.flash);
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

    // Huygens: a gentle push, then a steady drift toward Titan, turning slowly as it goes.
    const d = Math.max(0, t - SEP);
    scene.huy.position.copy(scene.home).addScaledVector(TITAN_DIR, d < 2 ? 0.4 * d * d : 1.6 + 1.6 * (d - 2));
    scene.huy.rotation.x = d * 0.8;

    // The orbit time-lapse: loop after loop, spiralling out and back in.
    const r = 16 * smooth(ORB_A, ORB_A + 1.5, t) * (1 - smooth(ORB_B - 1.5, ORB_B, t));
    const th = Math.max(0, Math.min(1, (t - ORB_A) / (ORB_B - ORB_A))) * 4 * 2 * Math.PI;
    scene.craft.position.set(r * Math.sin(th), 0.3 * r * Math.cos(th), r * Math.cos(th) - r);
    scene.craft.rotation.y = th;
    // The plunge: faster and faster, straight into Saturn.
    const p = Math.max(0, Math.min(1, (t - PLUNGE) / (HIT - PLUNGE)));
    if (p > 0) scene.craft.position.copy(ENTRY).multiplyScalar(p * p * p);

    const alpha = smooth(0, 1.5, t) * (1 - smooth(HIT - 0.4, HIT, t));
    scene.mat.uniforms.uAlpha.value = alpha;
    scene.huyMat.uniforms.uAlpha.value = alpha * (1 - smooth(SEP + 7, SEP + 9.5, t));

    // A spark rides with Cassini so you can follow it all the way down, then the burn-up glows in the clouds.
    const cam = state.camera.position;
    scene.spark.position.copy(scene.craft.position);
    scene.spark.scale.setScalar(0.04 * cam.distanceTo(scene.craft.position) + 1);
    scene.spark.material.opacity = 0.9 * smooth(PLUNGE + 0.3, PLUNGE + 1.2, t) * (1 - smooth(HIT - 0.1, HIT + 0.2, t));
    // Reduced motion: a slower, dimmer glow instead of a flash.
    const [peak, rise] = gentle.current ? [0.5, 1.4] : [1, 0.3];
    scene.flash.material.opacity = peak * smooth(HIT - 0.1, HIT + rise, t) * (1 - smooth(HIT + 1, HIT + 3.5, t));
    scene.flash.scale.setScalar(40 + 140 * smooth(HIT - 0.1, HIT + 2.5, t));

    // Camera: Huygens leaving, the loops, the finale, the plunge into Saturn, then the memorial.
    live.replayView = t < ORB_A ? V_SEP : t < ORB_B ? V_ORBIT : t < REVEAL ? V_FINALE : V_NOW;
    const c = scene.craft.position;
    live.replayLook =
      t < ORB_A && d > 0
        ? [scene.huy.position.x / 2, scene.huy.position.y / 2, scene.huy.position.z / 2] // between Cassini and Huygens
        : t >= PLUNGE && t < HIT + 3
          ? p < 1
            ? [c.x, c.y, c.z]
            : [ENTRY.x, ENTRY.y, ENTRY.z]
          : null;

    // Captions; {n} counts the orbits.
    const u = Math.max(0, Math.min(1, (t - ORB_A - 0.3) / 5));
    const n = 1 + Math.round(293 * (1 - (1 - u) * (1 - u)));
    caption(CUES, t, END, shown.current, (s) => s.replace("{n}", n === 294 ? "294!" : `${n}…`));
    // Only end our own replay: if you jump away mid-replay, endReplay would mark the stop you are going to.
    if (t >= END && s.stop === STOP_INDEX[stop.id]) endReplay();
  });

  return <primitive object={scene.root} />;
}
