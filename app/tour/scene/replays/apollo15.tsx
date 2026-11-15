"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Chassis } from "../suspension";
import { reducedMotion } from "../../lib/device";
import { useStore } from "../../lib/store";
import { endReplay, live, REPLAYS, setCaption, tour } from "../../state";
import type { Stop } from "../../stops";
import { loadMedia, mediaSound } from "../../Story";
import { fitFov } from "../Director";
import { ghostMaterial, lerp2, shell, smooth, suited, type Cue } from "../Ghost";
import { prepareModel, type GltfSpec } from "../Machine";
import { useModel } from "../useModel";

REPLAYS.add("apollo15-lrv");

// Apollo 15 at Hadley: a ghost rover drives in along its real tracks with Scott and Irwin aboard and parks where the
// real one stands; they hop off and lope around it, then head back to Falcon, whose top half blasts off on camera.
// It opens zoomed in on Falcon, 130 m away (where the rover was unfolded), and pulls back to the rover driving in.
const LINES: Cue[] = [
  { at: 0, text: "31 July 1971, at Hadley, below the Moon’s Apennine Mountains. Dave Scott climbs down from the lander, Falcon." },
  { at: 3.5, who: "Scott", text: "Man must explore. And this is exploration at its greatest." },
  { at: 7.5, text: "Beside Falcon, he and Jim Irwin unfolded a car. Here it comes: the Lunar Roving Vehicle." },
  { at: 11.5, text: "It’s the first car ever driven on another world. You’re hearing their real radio from one of the drives." },
  { at: 18.5, text: "Over three moonwalks they drive 27.8 km, to the mountains and the edge of a deep canyon called Hadley Rille." },
  { at: 23.5, text: "Hop off, grab the tools, scoop up rocks! In the Moon’s low gravity, every step is a bounce." },
  { at: 27.5, text: "2 August 1971. Scott parks the rover one last time, with its TV camera aimed at Falcon." },
  { at: 31.5, text: "Steered from Houston, the camera films Falcon’s top half blasting off: the first liftoff from the Moon ever shown on TV." },
  { at: 36.5, text: "The rover stayed behind, parked right here. It hasn’t moved since." },
];
const END = 40;
const DRIVE: [number, number] = [4, 18]; // the drive in, ending parked where the real rover stands
const PARK = DRIVE[1];
const DRIVE_M = 55; // metres of track driven on screen (the last stretch before the parking spot)
const LIFT = 33;
const FALCON: [number, number] = [-129, -20];
const FALCON_SPEC: GltfSpec = { kind: "gltf", url: "", scale: 1.43, hideAbove: 2.95, origin: "ground" }; // as LanderDescent
// Where you watch from: the drive and the moonwalk (the stop's replayView), then just behind the parked rover, a little
// to its right so the antenna does not hide Falcon, looking past its TV camera. The move eases over CAM_TURN, clear of the rover.
const VIEW_DRIVE = { pos: [9, 0, -4.5] as [number, number, number], look: [0, 0.8, 0] as [number, number, number] };
const VIEW_TV: [number, number, number] = [3.6, 0, -0.8];
const CAM_TURN: [number, number] = [28.5, 32.5];
// Zoom (view angle divided by this): close on Falcon at the start, easing out to the rover as it sets off; and in
// again for the liftoff, as the rover's TV camera zoomed in on it.
const ZOOM_START = 4, ZOOM_OUT: [number, number] = [6, 9.5];
const ZOOM_LIFT = 4, ZOOM_IN: [number, number] = [LIFT - 2, LIFT];
// Seats, in the rover's own frame (front is -x): hips just above the seat pan, Scott on the left (+z), Irwin right.
const SEAT_X = 0.45, SEAT_Y = -0.24, SEAT_Z = 0.32;

// Distance along a drive of length T with gentle starts and stops (trapezoid speed profile), as a fraction 0..1.
function driveFrac(t: number, a: number, b: number, ramp = 2) {
  const T = b - a, x = Math.min(T, Math.max(0, t - a)), v = 1 / (T - ramp);
  if (x < ramp) return (v * x * x) / (2 * ramp);
  if (x < T - ramp) return v * (x - ramp / 2);
  return 1 - (v * (T - x) * (T - x)) / (2 * ramp);
}

export function Apollo15Replay({ stop, ground }: { stop: Stop; ground?: (x: number, z: number) => number }) {
  const on = useStore(tour, (s) => s.replay);
  const spec = stop.model as GltfSpec;
  const gltf = useModel(spec.url);
  const lm = useModel("/models/apollo-lm.gltf.json");
  const suit = useModel("/models/astronaut.gltf.json");
  const scene = useMemo(() => {
    const mat = ghostMaterial(), carMat = ghostMaterial(), falconMat = ghostMaterial(), flameMat = ghostMaterial("#ffc27a");
    const ghostly = (o: THREE.Object3D, m: THREE.Material, flip = false) =>
      o.traverse((x) => {
        const mesh = x as THREE.Mesh;
        if (!mesh.isMesh || mesh.name === "_root") return;
        if (flip) mesh.visible = !mesh.visible;
        mesh.material = m;
        mesh.castShadow = mesh.receiveShadow = false;
      });
    // The rover, placed exactly like the real one (so it lines up when it parks), inside a group that drives.
    const rover = prepareModel(gltf.scene, spec, []).object;
    ghostly(rover, carMat);
    const car = new THREE.Group();
    car.add(rover);
    // Falcon's top half (the part that flew away): the descent-stage placement, with what it hides shown instead.
    const ascent = new THREE.Group();
    const top = prepareModel(lm.scene, FALCON_SPEC, []).object;
    ghostly(top, falconMat, true);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.55, 2.2, 16, 1, true).rotateX(Math.PI), flameMat);
    flame.position.set(0, 2.2, 0);
    ascent.add(top, flame);
    const scott = suited(suit.scene, mat), irwin = suited(suit.scene, mat);
    // Track the drive used: the end of the real wheel tracks (stop.marks, laid from Falcon to here), run backwards.
    const path = (stop.marks?.find((m) => m.kind === "tracks")?.path ?? [[-40, 16], [1.7, 0]]).filter(([x]) => x > -45);
    const curve = new THREE.CatmullRomCurve3([...path, [0, 0] as [number, number]].map(([x, z]) => new THREE.Vector3(x, 0, z)));
    const len = curve.getLength();
    const root = new THREE.Group();
    root.add(car, ascent, scott.g, irwin.g);
    shell(root);
    return { root, mat, carMat, falconMat, flameMat, flame, car, ascent, scott, irwin, curve, start: Math.max(0, 1 - DRIVE_M / len) };
  }, [gltf, lm, suit, spec, stop]);
  useEffect(
    () => () => {
      for (const m of [scene.mat, scene.carMat, scene.falconMat, scene.flameMat]) m.dispose();
      scene.flame.geometry.dispose();
      live.hideMachine = false;
      live.replayLook = null;
      live.replayView = null;
    },
    [scene],
  );

  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const getThree = useThree((s) => s.get);
  const t0 = useRef(-1);
  const audio = useRef<HTMLAudioElement | null>(null);
  const shown = useRef("");
  const calm = useRef(false);
  useEffect(() => {
    if (!on) return;
    t0.current = -1;
    calm.current = reducedMotion();
    let cancelled = false;
    // Real air-to-ground radio from one of the drives (no transcript cues: it plays under the narrator's captions).
    loadMedia().then((m) => {
      const r = (m as Record<string, { file?: string }>)["apollo15-lrv"];
      if (cancelled || !r?.file || !/^media\/[\w.-]+$/.test(r.file)) return;
      audio.current = mediaSound(new Audio("/" + r.file));
    });
    return () => {
      cancelled = true;
      audio.current?.pause();
      audio.current = null;
      live.replayLook = null;
      live.replayView = null;
      shown.current = "";
      setCaption("", 0);
      // Hand back the normal view angle (the replay zooms).
      camera.fov = fitFov(getThree().size);
      camera.updateProjectionMatrix();
    };
  }, [on, camera, getThree]);

  const v = useMemo(() => new THREE.Vector3(), []);
  const dir = useMemo(() => new THREE.Vector3(), []);
  const chassis = useMemo(() => new Chassis([[-1.15, -0.915], [-1.15, 0.915], [1.15, -0.915], [1.15, 0.915]], 28, 5, 6), []);
  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const gh = (x: number, z: number) => (ground ? ground(x, z) : 0);
    const s = tour.get();
    const t = t0.current < 0 ? 0 : state.clock.elapsedTime - t0.current;
    // Until the ghost rover parks, the real one isn't here yet.
    live.hideMachine = !s.revealed.includes(stop.id) && !(on && t0.current >= 0 && t >= PARK);
    scene.root.visible = on;
    if (!on) return;
    if (t0.current < 0) t0.current = state.clock.elapsedTime;
    if (audio.current && t >= DRIVE[0] && audio.current.paused && !audio.current.ended && audio.current.currentTime === 0) audio.current.play().catch(() => {});

    // The drive: along the tracks, nose following the curve and tipping with the ground.
    const u = scene.start + (1 - scene.start) * driveFrac(t, DRIVE[0], DRIVE[1]);
    scene.curve.getPointAt(u, v);
    scene.curve.getTangentAt(u, dir);
    // Four sprung wheels on the ground: the car pitches, rolls and bounces softly over the craters (low gravity:
    // a soft spring and light damping), steering at a driver's pace.
    chassis.update(gh, v.x, v.z, Math.atan2(dir.z, -dir.x), dt, 1.6); // the rover's front is -x
    chassis.apply(scene.car, v.x, v.z);
    scene.car.updateMatrix();
    scene.carMat.uniforms.uAlpha.value = smooth(0, 1.5, t) * (1 - smooth(PARK, PARK + 1.2, t));
    scene.car.visible = t < PARK + 1.2;
    scene.mat.uniforms.uAlpha.value = smooth(0, 1.5, t) * (1 - smooth(30.5, 32.5, t));

    type Who = ReturnType<typeof suited>;
    const pose = (who: Who, hipL: number, hipR: number, kneeL: number, kneeR: number, shL: number, shR: number, elL: number, elR: number, spread = 0.18) => {
      who.legL.rotation.set(hipL, 0, 0);
      who.legR.rotation.set(hipR, 0, 0);
      who.shinL.rotation.set(kneeL, 0, 0);
      who.shinR.rotation.set(kneeR, 0, 0);
      who.armL.rotation.set(shL, 0, spread);
      who.armR.rotation.set(shR, 0, -spread);
      who.foreL.rotation.set(elL, 0, 0);
      who.foreR.rotation.set(elR, 0, 0);
    };
    const face = (who: Who, y: number, lean = 0) => {
      const cur = (who.g.userData.yaw as number | undefined) ?? y;
      const d = Math.atan2(Math.sin(y - cur), Math.cos(y - cur));
      const n = cur + d * Math.min(1, dt * 4);
      who.g.userData.yaw = n;
      who.g.rotation.set(lean, n, 0);
    };
    // Aboard: sitting facing forward, legs out in front with boots on the floor pan; the driver's hand on the T-handle between seats.
    const seated = (who: Who, side: number, hop = 0) => {
      v.set(SEAT_X, SEAT_Y, SEAT_Z * side).applyMatrix4(scene.car.matrix);
      // Hopping off: out to the side and down, legs straightening on the way.
      const out: [number, number] = [0.4, 1.3 * side];
      const [x, z] = lerp2([v.x, v.z], out, hop);
      who.g.position.set(x, v.y + (gh(x, z) - v.y) * hop + 0.3 * Math.sin(Math.PI * hop), z);
      if (hop === 0) {
        who.g.userData.yaw = chassis.yaw - Math.PI / 2;
        who.g.rotation.set(0, chassis.yaw - Math.PI / 2, 0);
      } else face(who, side > 0 ? 0 : Math.PI);
      const k = 1 - hop;
      // Legs stretched forward onto the footrest (the floor pan sits ~0.25 m below the seat), not hanging through it.
      pose(who, -1.7 * k, -1.7 * k, 0.55 * k, 0.55 * k, -0.5 * k, (side > 0 ? -0.9 : -0.5) * k, -0.6 * k, -0.6 * k, 0.12);
    };
    // The Moon lope, as in Apollo11Replay: a low floating bound, knees bent, arms out a little for balance.
    const walk = (who: Who, from: [number, number], to: [number, number], a: number, b: number, phase = 0) => {
      const k = smooth(a, b, t);
      const [x, z] = lerp2(from, to, k);
      const m = Math.min(1, Math.min(k, 1 - k) * 8);
      const w = 2 * Math.PI * (t * 1.15 + phase);
      const bob = 0.07 * Math.pow(Math.max(0, Math.sin(w)), 2);
      who.g.position.set(x, gh(x, z) + bob * m, z);
      face(who, Math.atan2(to[0] - from[0], to[1] - from[1]), (0.1 + 0.03 * Math.sin(w)) * m);
      const lead = (-0.32 - 0.14 * Math.sin(w)) * m;
      const trail = (0.22 + 0.14 * Math.sin(w + 0.7)) * m;
      const kneeLead = (0.3 + 0.25 * Math.max(0, -Math.sin(w))) * m;
      const kneeTrail = (0.35 + 0.3 * Math.max(0, Math.sin(w + 0.7))) * m;
      const sway = 0.06 * Math.sin(w) * m;
      pose(who, trail, lead, kneeTrail, kneeLead, -0.3 * m + sway, -0.3 * m - sway, -0.6 * m, -0.6 * m, 0.12 + 0.14 * m);
    };
    const hopAt = PARK + 0.5;
    // Scott: off on the left, out front to the TV camera (aiming it), round the side, then back toward Falcon.
    const sA: [number, number] = [0.4, 1.3], sB: [number, number] = [-2.6, 1], sC: [number, number] = [-1.5, 3.5], sD: [number, number] = [-12, 1];
    if (t < 20) seated(scene.scott, 1, smooth(hopAt, hopAt + 0.8, t));
    else if (t < 26) {
      walk(scene.scott, sA, sB, 20, 23.5);
      if (t > 23.8) {
        scene.scott.armR.rotation.set(-1.2, 0, -0.1);
        scene.scott.foreR.rotation.set(-0.4, 0, 0);
      }
    } else if (t < 28.5) walk(scene.scott, sB, sC, 26, 28.5);
    else walk(scene.scott, sC, sD, 28.5, 32.5);
    // Irwin: off on the right, to the tool carrier at the back, a few bounds out, then back toward Falcon.
    const iA: [number, number] = [0.4, -1.3], iB: [number, number] = [2.4, -1.2], iC: [number, number] = [2, -5.5], iD: [number, number] = [-10, -6];
    if (t < 20.3) seated(scene.irwin, -1, smooth(hopAt + 0.3, hopAt + 1.1, t));
    else if (t < 25.5) walk(scene.irwin, iA, iB, 20.3, 23.3, 0.4);
    else if (t < 28.5) walk(scene.irwin, iB, iC, 25.5, 28, 0.4);
    else walk(scene.irwin, iC, iD, 28.5, 32.5, 0.4);
    scene.scott.g.visible = scene.irwin.g.visible = t < 32.5;

    // Falcon's top half: fades in as you arrive to watch, then climbs away faster and faster.
    const fx = FALCON[0], fz = FALCON[1];
    const lift = Math.max(0, t - LIFT);
    scene.ascent.position.set(fx, gh(fx, fz) + 0.5 * 2.2 * lift * lift, fz);
    scene.ascent.rotation.y = stop.extras?.find((x) => x.kind === "lm-descent")?.rotationY ?? Math.PI / 2;
    scene.ascent.visible = t > 30;
    scene.falconMat.uniforms.uAlpha.value = smooth(30, 31.5, t) * (1 - smooth(37, 39, t));
    scene.flame.visible = lift > 0 && lift < 4;
    scene.flameMat.uniforms.uAlpha.value = lift > 0 ? (calm.current ? 0.8 : 0.85 + 0.06 * Math.sin(t * 9)) : 0;

    // The camera: follow the rover in, watch the moonwalk, then glide (no cuts) to just behind the parked rover and
    // turn to look past its TV camera at Falcon, as the camera saw it. The replay ends there, facing Falcon.
    const cp = scene.car.position;
    const k = smooth(CAM_TURN[0], CAM_TURN[1], t);
    const [x, z] = lerp2([VIEW_DRIVE.pos[0], VIEW_DRIVE.pos[2]], [VIEW_TV[0], VIEW_TV[2]], k);
    live.replayView = { pos: [x, 0, z], look: VIEW_DRIVE.look };
    // Watch Falcon's top half climb away, then settle back to eye level before handing over, so the site isn't left
    // looking at the sky.
    const ay = (scene.ascent.position.y + 3) * (1 - smooth(END - 4, END - 0.5, t)) + VIEW_DRIVE.look[1] * smooth(END - 4, END - 0.5, t);
    // At first look at Falcon (the zoom makes it big), then pan to the rover as it drives in.
    const toCar = smooth(ZOOM_OUT[0], ZOOM_OUT[1], t);
    const fy = gh(fx, fz) + 2;
    live.replayLook =
      t < PARK + 1
        ? [fx + (cp.x - fx) * toCar, fy + (cp.y + 1 - fy) * toCar, fz + (cp.z - fz) * toCar]
        : [VIEW_DRIVE.look[0] + (fx - VIEW_DRIVE.look[0]) * k, VIEW_DRIVE.look[1] + (ay - VIEW_DRIVE.look[1]) * k, VIEW_DRIVE.look[2] + (fz - VIEW_DRIVE.look[2]) * k];

    const zoom = Math.max(
      1 + (ZOOM_START - 1) * (1 - toCar),
      1 + (ZOOM_LIFT - 1) * smooth(ZOOM_IN[0], ZOOM_IN[1], t) * (1 - smooth(END - 4, END - 0.5, t)),
    );
    const fov = fitFov(state.size) / zoom;
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }

    let line = "", from = 0, until = END;
    LINES.forEach((c, i) => {
      if (t < c.at) return;
      line = c.who ? `${c.who}: “${c.text}”` : c.text;
      from = c.at;
      until = LINES[i + 1]?.at ?? END;
    });
    if (line !== shown.current) {
      shown.current = line;
      // The caption's bar shows how long this line stays up: until the next line (or the end).
      setCaption(line, until - Math.max(from, t));
    }
    if (t >= END) endReplay();
  });

  return <primitive object={scene.root} />;
}
