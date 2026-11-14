import * as THREE from "three";
import { aim, DEG, faceLonRotation, latLon, smoother, UP } from "./lib/geo";
import { BODY_RADIUS } from "./scene/Space";
import { terrainFor } from "./scene/terrain";
import { EYE } from "./scene/Walker";
import { START_SCENE, type BodyKey, type BodyPlacement, type SceneDesc, type Target } from "./state";
import { STOPS, type Stop } from "./stops";

// A travel plan is a list of shots. Each shot shows one scene and moves the camera over its duration;
// cuts between scenes happen under a quick fade to black, so the trip reads as one continuous journey.
export type Shot = {
  scene: SceneDesc;
  dur: number;
  fadeIn?: number;
  fadeOut?: number;
  cam: (u: number, camera: THREE.Camera) => void;
  streak?: (u: number) => number;
  counter?: { label: string; dest: string; from: number; to: number; at: (u: number) => number };
};

export type Pose = { pos: THREE.Vector3; quat: THREE.Quaternion };

const LEG = 40; // distance between worlds in the travel scene (planet radii are about 1)
export const TRAVEL_SUN = new THREE.Vector3(0.75, 0.35, 0.55).normalize();
export const START_POSE = { pos: new THREE.Vector3(0, 0, 3.4), look: new THREE.Vector3(0, 1, 0) };

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

type Key = { pos: THREE.Vector3; look: THREE.Vector3; up?: THREE.Vector3 };

// A smooth camera move through key poses: the position follows a spline at a speed set by `ease`,
// and the camera keeps looking at a point that glides along its own spline.
function path(keys: Key[], ease: (u: number) => number = smoother) {
  const curve = new THREE.CatmullRomCurve3(keys.map((k) => k.pos), false, "centripetal");
  const look = new THREE.CatmullRomCurve3(keys.map((k) => k.look), false, "centripetal");
  const ups = keys.map((k) => k.up ?? UP);
  const p = new THREE.Vector3();
  const l = new THREE.Vector3();
  const up = new THREE.Vector3();
  const n = keys.length - 1;
  return (u: number, cam: THREE.Camera) => {
    const t = curve.getUtoTmapping(Math.min(1, Math.max(0, ease(u))), null as unknown as number);
    curve.getPoint(t, p);
    look.getPoint(t, l);
    const seg = Math.min(n - 1, Math.floor(t * n));
    up.copy(ups[seg]).lerp(ups[seg + 1], t * n - seg).normalize();
    aim(cam, p, l, up);
  };
}

// How fast the camera moves at u for a smootherstep ease, turned into star-streak strength.
const cruiseStreak = (u: number) => Math.max(0, Math.min(1, (30 * u * u * (1 - u) * (1 - u)) / 1.875 * 1.35 - 0.3));

function hold(scene: SceneDesc, pose: Pose, dur: number, fadeOut?: number): Shot {
  return {
    scene,
    dur,
    fadeOut,
    cam: (_, cam) => {
      cam.position.copy(pose.pos);
      cam.quaternion.copy(pose.quat);
    },
  };
}

function forwardOf(pose: Pose) {
  return v(0, 0, -1).applyQuaternion(pose.quat);
}

// --- Bodies and sites ------------------------------------------------------------------------

const BODY_OF: Record<Stop["body"], BodyKey | null> = { moon: "moon", mars: "mars", saturn: "saturn", deep: null };
const WORLD_NAME: Record<Stop["body"], string> = { moon: "The Moon", mars: "Mars", saturn: "Saturn", deep: "Interstellar space" };

// A site's direction once its globe is turned so the site faces +z (toward = 1) or -z (toward = -1).
function facingSite(stop: Stop, toward: 1 | -1) {
  const lat = (stop.site?.lat ?? 0) * DEG;
  return v(0, Math.sin(lat), toward * Math.cos(lat));
}

function placement(stop: Stop, pos: [number, number, number], toward: 1 | -1): BodyPlacement | null {
  const key = BODY_OF[stop.body];
  if (!key) return null;
  return { key, pos, rotY: stop.site ? faceLonRotation(stop.site.lon, toward) : 0 };
}

// --- Arrival and departure at a stop ---------------------------------------------------------

export function spawnPose(index: number) {
  const stop = STOPS[index];
  const [x, , z] = stop.spawn.pos;
  const y = stop.setting.kind === "space" ? stop.spawn.pos[1] : terrainFor(index).height(x, z) + EYE;
  return { pos: v(x, y, z), look: v(...stop.spawn.look) };
}

function sceneFor(index: number): SceneDesc {
  const stop = STOPS[index];
  return stop.setting.kind === "space" ? { kind: "space", key: `space-${index}`, stop: index } : { kind: "surface", key: `surface-${index}`, stop: index };
}

// Drop in from high above (or glide in from far away in space) and land at the spawn point.
function arrive(index: number, dur = 3.4, fadeIn = 0.8): Shot {
  const stop = STOPS[index];
  const { pos, look } = spawnPose(index);
  const out = pos.clone().sub(look).setY(0).normalize();
  if (stop.setting.kind === "space") {
    const far = pos.clone().multiplyScalar(7).add(v(18, 10, -6));
    const mid = pos.clone().multiplyScalar(2.6).add(v(4, 3, 0));
    return { scene: sceneFor(index), dur, fadeIn, cam: path([{ pos: far, look }, { pos: mid, look }, { pos, look }], (u) => 1 - Math.pow(1 - u, 2.6)) };
  }
  const high = look.clone().addScaledVector(out, 22).add(v(0, 95, 0));
  const mid = look.clone().addScaledVector(out, 16).add(v(0, 18, 0));
  return { scene: sceneFor(index), dur, fadeIn, cam: path([{ pos: high, look }, { pos: mid, look }, { pos, look }], (u) => 1 - Math.pow(1 - u, 2.4)) };
}

// Rise straight up from wherever you are standing (or drift away in space), then fade out.
function depart(index: number, from: Pose, dur = 2.1): Shot {
  const stop = STOPS[index];
  const ahead = from.pos.clone().addScaledVector(forwardOf(from), 10);
  const center = v(0, stop.setting.kind === "space" ? 0 : 1, 0);
  if (stop.setting.kind === "space") {
    const away = from.pos.clone().normalize();
    return {
      scene: sceneFor(index),
      dur,
      fadeOut: 0.55,
      cam: path(
        [
          { pos: from.pos.clone(), look: ahead },
          { pos: from.pos.clone().addScaledVector(away, 14).add(v(0, 4, 0)), look: center },
          { pos: from.pos.clone().addScaledVector(away, 70).add(v(0, 18, 0)), look: center },
        ],
        (u) => Math.pow(u, 2.1),
      ),
    };
  }
  return {
    scene: sceneFor(index),
    dur,
    fadeOut: 0.55,
    cam: path(
      [
        { pos: from.pos.clone(), look: ahead },
        { pos: from.pos.clone().add(v(0, 14, 0)), look: center },
        { pos: from.pos.clone().add(v(0, 110, 0)), look: center, up: v(0, 0, -1) },
      ],
      (u) => Math.pow(u, 2.1),
    ),
  };
}

// --- Travel between places -------------------------------------------------------------------

function greatCircleKm(a: Stop, b: Stop, radiusKm: number) {
  const pa = latLon(a.site!.lat, a.site!.lon);
  const pb = latLon(b.site!.lat, b.site!.lon);
  return pa.angleTo(pb) * radiusKm;
}

// Two sites on the same world: skim over the globe from one to the other.
function hop(a: number, b: number): Shot {
  const sa = STOPS[a];
  const sb = STOPS[b];
  const key = BODY_OF[sa.body]!;
  const r = BODY_RADIUS[key];
  const da = latLon(sa.site!.lat, sa.site!.lon);
  const db = latLon(sb.site!.lat, sb.site!.lon);
  const mid = da.clone().add(db).normalize();
  const km = greatCircleKm(sa, sb, key === "moon" ? 1737.4 : 3389.5);
  return {
    scene: { kind: "travel", key: `hop-${key}`, bodies: [{ key, pos: [0, 0, 0], rotY: 0 }] },
    dur: 4.2,
    fadeIn: 0.55,
    fadeOut: 0.55,
    cam: path([
      { pos: da.clone().multiplyScalar(r * 1.25), look: da.clone().multiplyScalar(r) },
      { pos: mid.clone().multiplyScalar(r * 2.05), look: mid.clone().multiplyScalar(r * 0.6) },
      { pos: db.clone().multiplyScalar(r * 1.25), look: db.clone().multiplyScalar(r) },
    ]),
    counter: { label: "Distance between the two sites", dest: `${sb.name} · ${WORLD_NAME[sb.body]}`, from: 0, to: km, at: (u) => smoother(u) * km },
  };
}

// The approach end of a leg: from in front of the globe down to just above the landing site.
function approachKeys(stop: Stop | null, at: THREE.Vector3): Key[] {
  if (!stop || stop.body === "deep") return [{ pos: at.clone().add(v(0.3, 0.5, 6)), look: at.clone().add(v(0, 0, -30)) }, { pos: at.clone(), look: at.clone().add(v(0, 0, -30)) }];
  if (stop.body === "saturn") {
    return [
      { pos: at.clone().add(v(4.5, 2.2, 15)), look: at },
      { pos: at.clone().add(v(1.6, 0.5, 7.2)), look: at.clone().add(v(0, -0.4, 0)) },
    ];
  }
  const r = BODY_RADIUS[BODY_OF[stop.body]!];
  const d = facingSite(stop, 1);
  return [
    { pos: at.clone().add(v(0.4 * r, 0.35 * r, 4.4 * r)), look: at },
    { pos: at.clone().addScaledVector(d, r * 1.25), look: at.clone().addScaledVector(d, r) },
  ];
}

function counterFor(from: Stop | null, to: Stop | null, distanceTo: number, labelTo: string): Shot["counter"] {
  const start = from ? from.distanceKm : 0;
  return {
    label: labelTo,
    dest: to ? `${to.name} · ${WORLD_NAME[to.body]}` : "Home · Earth",
    from: start,
    to: distanceTo,
    at: (u) => start + (distanceTo - start) * smoother(u),
  };
}

// From Earth (the start screen) to the first stop on the Moon: rise over Earth's north pole toward the Moon.
function startLeg(): Shot {
  const first = STOPS[0];
  const moonAt = v(0, 0, -LEG);
  const moon = placement(first, [0, 0, -LEG], 1)!;
  return {
    scene: { kind: "travel", key: "earth-moon", bodies: [{ key: "earth", pos: [0, 0, 0], rotY: 0, spin: true }, moon] },
    dur: 9.5,
    fadeOut: 0.55,
    cam: path([
      START_POSE,
      { pos: v(0, 1.3, 2.5), look: v(0, 1.25, -6) },
      { pos: v(0, 1.95, -1.6), look: v(0, 0.6, -LEG) },
      { pos: v(0.35, 0.9, -LEG * 0.55), look: moonAt },
      ...approachKeys(first, moonAt),
    ]),
    streak: cruiseStreak,
    counter: counterFor(null, first, first.distanceKm, first.distanceLabel),
  };
}

// From one world to another (or out into empty space): lift off, cruise, and arrive.
function leg(a: number, b: number | "end"): Shot {
  const sa = STOPS[a];
  const sb = b === "end" ? null : STOPS[b];
  const bodies: BodyPlacement[] = [];
  const from = placement(sa, [0, 0, 0], -1);
  if (from) bodies.push(from);
  const at = v(0, 0, -LEG);
  const to = sb ? placement(sb, [0, 0, -LEG], 1) : null;
  if (to) bodies.push(to);

  const keys: Key[] = [];
  if (sa.body === "saturn") {
    // Leaving Saturn behind: pull back from the planet, then turn to face the dark.
    keys.push({ pos: v(1.6, 0.5, -7.2), look: v(0, -0.4, 0) });
    keys.push({ pos: v(3, 1.4, -11), look: v(0, 0, 0) });
    keys.push({ pos: v(3.2, 1.6, -15), look: v(30, 2, -20) });
  } else {
    const r = BODY_RADIUS[from!.key];
    const d = facingSite(sa, -1);
    keys.push({ pos: d.clone().multiplyScalar(r * 1.25), look: d.clone().multiplyScalar(r) });
    keys.push({ pos: d.clone().multiplyScalar(r * 2.4).add(v(0.25, 0.2, -0.4)), look: v(0, 0, -LEG) });
  }
  keys.push({ pos: v(0.4, 0.6, -LEG * 0.5), look: at });
  if (sb?.body === "deep") {
    // Voyager is out in the dark: keep cruising and slow to a stop among the stars.
    keys.push({ pos: v(0.2, 0.4, -LEG * 0.85), look: v(0, 0, -LEG * 2) });
    keys.push({ pos: v(0, 0.3, -LEG * 1.1), look: v(0, 0, -LEG * 2) });
  } else keys.push(...approachKeys(sb, at));

  const dist = sb ? sb.distanceKm : 0;
  return {
    scene: { kind: "travel", key: `leg-${a}`, bodies },
    dur: sb?.body === "deep" ? 10 : 9,
    fadeIn: 0.5,
    fadeOut: 0.55,
    cam: path(keys),
    streak: cruiseStreak,
    counter: counterFor(sa, sb, dist, sb ? sb.distanceLabel : "Distance from Earth"),
  };
}

// From Voyager all the way home, ending on the same view of Earth as the start screen.
function homeLeg(from: number): Shot {
  const sa = STOPS[from];
  return {
    scene: START_SCENE,
    dur: 9.5,
    fadeIn: 0.6,
    cam: path([
      { pos: v(0, 0.5, 70), look: v(0, 0, 0) },
      { pos: v(0.3, 0.6, 24), look: v(0, 0.2, 0) },
      { pos: v(0, 0.6, 7.5), look: v(0, 0.6, 0) },
      START_POSE,
    ]),
    streak: cruiseStreak,
    counter: { label: "Distance from Earth", dest: "Home · Earth", from: sa.distanceKm, to: 0, at: (u) => sa.distanceKm * (1 - smoother(u)) },
  };
}

function startShot(dur: number, fadeIn: number): Shot {
  return { scene: START_SCENE, dur, fadeIn, cam: (_, cam) => aim(cam, START_POSE.pos, START_POSE.look) };
}

// --- Plans -----------------------------------------------------------------------------------

export function plan(from: { phase: string; stop: number; scene: SceneDesc }, to: Target, mode: "journey" | "jump", pose: Pose, reduced: boolean): Shot[] {
  const here = from.scene;
  const exploring = from.phase === "explore" && from.stop >= 0;

  // Jumps (Back, skipping, links straight to a stop, reduced motion): fade out, cut, fade in.
  if (mode === "jump" || reduced) {
    const shots: Shot[] = [];
    if (from.phase !== "start" || from.stop >= 0) shots.push(hold(here, pose, 0.45, 0.45));
    if (to === "start") shots.push(startShot(0.9, 0.8));
    else if (to === "end") shots.push(startShot(0.9, 0.8));
    else shots.push(reduced ? { ...arrive(to, 1.2, 0.8), cam: (_, cam) => aim(cam, spawnPose(to).pos, spawnPose(to).look) } : arrive(to, 1.8, 0.7));
    return shots;
  }

  if (to === "start") return [hold(here, pose, 0.45, 0.45), startShot(0.9, 0.8)];

  // The very first trip, from Earth.
  if (!exploring) {
    if (to === "end") return [startShot(0.9, 0.8)];
    if (to === 0) return [startLeg(), arrive(0)];
    return [arrive(to, 1.8, 0.7)];
  }

  const a = from.stop;
  if (to === "end") return [depart(a, pose), homeLeg(a)];
  const sa = STOPS[a];
  const sb = STOPS[to];
  if (sa.body === sb.body && sa.site && sb.site) return [depart(a, pose), hop(a, to), arrive(to)];
  return [depart(a, pose), leg(a, to), arrive(to)];
}
