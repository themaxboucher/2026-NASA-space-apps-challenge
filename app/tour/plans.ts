import * as THREE from "three";
import { aim, DEG, faceLonRotation, latLon, smoother, UP } from "./lib/geo";
import { BODY_RADIUS } from "./scene/Space";
import { terrainFor } from "./scene/terrain";
import { EYE } from "./scene/Walker";
import { START_SCENE, type BodyKey, type BodyPlacement, type SceneDesc, type Target } from "./state";
import { STORY_COUNT, STOPS, type Stop } from "./stops";
import { debrisLine } from "./sites";
import { siteFrame } from "./lib/siteframe";

// A travel plan is a list of shots. Each shot shows one scene and moves the camera over its duration;
// cuts between scenes happen under a quick dip (to black in space, through the haze at a surface), so the
// trip reads as one continuous journey.
export type Shot = {
  scene: SceneDesc;
  dur: number;
  fadeIn?: number;
  fadeOut?: number;
  cam: (u: number, camera: THREE.Camera) => void;
  streak?: (u: number) => number;
  counter?: { label: string; dest: string; from: number; to: number; at: (u: number) => number };
  tint?: { in?: string; out?: string }; // dip colour for the fade in / out (default black)
  chip?: (u: number) => string; // a caption naming what you're passing ("" = none)
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

// Brakes hard as the target nears: by half time you've covered ~94% of the way, and the rest (the planet
// swelling up, the drop to the landing site) happens slowly, so you see the approach instead of a fly-by.
const glide = (u: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, u)), 4);
// Every trip starts from rest (no jolt), speeds up, then takes the same long braking approach.
const launchEase = (u: number) => glide(u * u * (2 - u));
// The first trip, Earth to the Moon: an unhurried ease in, a steady cruise and a long soft approach.
const firstTrip = (u: number) => {
  const x = Math.min(1, Math.max(0, u));
  // Still moving (about a fifth of cruise speed) at the end, so the drop into the landing site carries on
  // through the dissolve instead of stalling first.
  return 0.82 * (1 - Math.pow(1 - x * x * (3 - 2 * x), 2.2)) + 0.18 * x;
};
// Other trips between worlds: the same braking approach, but never quite stopping before the hand-off.
const legEase = (u: number) => 0.88 * launchEase(u) + 0.12 * Math.min(1, Math.max(0, u));

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

// Diving into (or climbing out of) a surface stop passes through its sky: Mars dust, a soft lunar white-out.
const HAZE: Partial<Record<Stop["body"], string>> = { moon: "#d6d2ca", mars: "#c9a47f" };
const hazeOf = (stop: Stop | null | undefined) => (stop && stop.setting.kind !== "space" ? HAZE[stop.body] : undefined);

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

// Push in on the machine: it is centred and small at the first frame (the Director waits for it to load),
// and the camera glides in from above (or from far off in space) and settles at the spawn point.
const settle = (u: number) => 0.4 * smoother(u) + 0.6 * glide(u);
function arrive(index: number, dur = 2.1, fadeIn = 0): Shot {
  const stop = STOPS[index];
  const tint = { in: hazeOf(stop) };
  // A stop with a replay view ends its arrival right there, so the replay starts without another camera move.
  const rv = stop.replayView;
  const { pos, look } = rv
    ? { pos: v(rv.pos[0], terrainFor(index).height(rv.pos[0], rv.pos[2]) + EYE, rv.pos[2]), look: v(...rv.look) }
    : spawnPose(index);
  const out = pos.clone().sub(look).setY(0).normalize();
  if (stop.setting.kind === "space") {
    const far = pos.clone().multiplyScalar(4).add(v(6, 4, -2));
    const mid = pos.clone().multiplyScalar(1.8).add(v(1.5, 1, 0));
    return { scene: sceneFor(index), dur, fadeIn, tint, cam: path([{ pos: far, look }, { pos: mid, look }, { pos, look }], settle) };
  }
  // Start high above the site, still dropping as the trip left off, and glide down to eye height.
  const high = look.clone().addScaledVector(out, 12).add(v(0, 70, 0));
  const mid = look.clone().addScaledVector(out, 9).add(v(0, 8, 0));
  return { scene: sceneFor(index), dur, fadeIn, tint, cam: path([{ pos: high, look }, { pos: mid, look }, { pos, look }], settle) };
}

// Rise straight up from wherever you are standing (or drift away in space), then fade out.
function depart(index: number, from: Pose, dur = 0.9): Shot {
  const stop = STOPS[index];
  const ahead = from.pos.clone().addScaledVector(forwardOf(from), 10);
  const center = v(0, stop.setting.kind === "space" ? 0 : 1, 0);
  if (stop.setting.kind === "space") {
    const away = from.pos.clone().normalize();
    return {
      scene: sceneFor(index),
      dur,
      cam: path(
        [
          { pos: from.pos.clone(), look: ahead },
          { pos: from.pos.clone().addScaledVector(away, 14).add(v(0, 4, 0)), look: center },
          { pos: from.pos.clone().addScaledVector(away, 70).add(v(0, 18, 0)), look: center },
        ],
        (u) => u * u * u * (3 - 2 * u), // eases out of standing still
      ),
    };
  }
  return {
    scene: sceneFor(index),
    dur,
    tint: { out: hazeOf(stop) },
    cam: path(
      [
        { pos: from.pos.clone(), look: ahead },
        { pos: from.pos.clone().add(v(0, 14, 0)), look: center },
        { pos: from.pos.clone().add(v(0, 110, 0)), look: center, up: v(0, 0, -1) },
      ],
      (u) => u * u * u * (3 - 2 * u), // eases out of standing still
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
    dur: 2.8,
    tint: { in: hazeOf(sa), out: hazeOf(sb) },
    cam: path(
      [
        { pos: da.clone().multiplyScalar(r * 1.25), look: da.clone().multiplyScalar(r) },
        { pos: mid.clone().multiplyScalar(r * 2.05), look: mid.clone().multiplyScalar(r * 0.6) },
        { pos: db.clone().multiplyScalar(r * 1.1), look: db.clone().multiplyScalar(r) },
      ],
      launchEase,
    ),
    counter: { label: "Distance between the two sites", dest: `${sb.name} · ${WORLD_NAME[sb.body]}`, from: 0, to: km, at: (u) => launchEase(u) * km },
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
    // Dive right down at the landing site, so the haze dip reads as dropping through the sky.
    { pos: at.clone().addScaledVector(d, r * 1.1), look: at.clone().addScaledVector(d, r) },
  ];
}

function counterFor(from: Stop | null, to: Stop | null, distanceTo: number, labelTo: string): Shot["counter"] {
  const start = from ? from.distanceKm : 0;
  return {
    label: labelTo,
    dest: to ? `${to.name} · ${WORLD_NAME[to.body]}` : "Home · Earth",
    from: start,
    to: distanceTo,
    at: (u) => start + (distanceTo - start) * launchEase(u),
  };
}

// From Earth (the start screen) to the first stop on the Moon: rise over Earth's north pole toward the Moon.
function startLeg(): Shot {
  const first = STOPS[0];
  const moonAt = v(0, 0, -LEG);
  return {
    scene: START_SCENE, // the same scene as the start screen (it already holds the Moon), so nothing cuts
    dur: 8,
    tint: { out: hazeOf(first) },
    cam: path(
      [
        START_POSE,
        { pos: v(0, 1.3, 2.5), look: v(0, 1.25, -6) },
        { pos: v(0, 1.95, -1.6), look: v(0, 0.6, -LEG) },
        { pos: v(0.35, 0.9, -LEG * 0.55), look: moonAt },
        approachKeys(first, moonAt)[0],
      ],
      firstTrip,
    ),
    counter: { ...counterFor(null, first, first.distanceKm, first.distanceLabel)!, at: (u) => first.distanceKm * firstTrip(u) },
  };
}

// From orbit straight down to the landing site, in the site's own scene. It starts on exactly the trip's last
// picture (lib/siteframe.ts maps the camera across), drops with height shrinking smoothly on a log scale, keeps
// the site in view, and ends at the spot where you watch the replay (or the usual spawn point).
const descM = new THREE.Matrix4();
const descQ = new THREE.Quaternion();
const descQ2 = new THREE.Quaternion();
function descent(index: number): Shot {
  const stop = STOPS[index];
  const f = siteFrame(stop);
  const handoff = approachKeys(stop, v(0, 0, -LEG))[0];
  const startPos = f.toSite(handoff.pos);
  descM.lookAt(handoff.pos, handoff.look, UP);
  const startQ = f.quatToSite(new THREE.Quaternion().setFromRotationMatrix(descM));
  const rv = stop.replayView;
  const t = terrainFor(index);
  const endPos = rv ? v(rv.pos[0], t.height(rv.pos[0], rv.pos[2]) + EYE, rv.pos[2]) : spawnPose(index).pos;
  const endLook = rv ? v(...rv.look) : spawnPose(index).look;
  const a0 = startPos.y, a1 = endPos.y, la = Math.log(a0), lb = Math.log(Math.max(1, a1));
  const site = v(0, 0, 0), p = new THREE.Vector3();
  return {
    scene: sceneFor(index),
    dur: 8,
    cam: (u, cam) => {
      const s = 1 - Math.pow(1 - Math.min(1, Math.max(0, u)), 2.2);
      const alt = Math.exp(la + (lb - la) * s);
      const k = (alt - a1) / (a0 - a1); // 1 at the start, 0 at the end: sideways offset shrinks with height
      p.set(startPos.x * k + endPos.x * (1 - k), alt, startPos.z * k + endPos.z * (1 - k));
      cam.position.copy(p);
      // Turn from the trip's view to the site, then (near the ground) to the replay view.
      descM.lookAt(p, site, UP);
      descQ.setFromRotationMatrix(descM);
      cam.quaternion.copy(startQ).slerp(descQ, smoothstep01(u / 0.3));
      descM.lookAt(p, endLook, UP);
      descQ2.setFromRotationMatrix(descM);
      cam.quaternion.slerp(descQ2, smoothstep01((u - 0.7) / 0.3));
      // The far plane has to reach the whole Moon while high up.
      const pc = cam as THREE.PerspectiveCamera;
      // Out to the horizon (sqrt(2 R h)) and a bit more.
      const far = Math.max(9000, Math.sqrt(2 * f.R * alt) * 1.6 + alt * 2);
      const near = Math.min(400, Math.max(0.03, alt * 0.004));
      if (Math.abs(pc.far - far) > 1 || Math.abs(pc.near - near) > 0.005) {
        pc.far = far;
        pc.near = near;
        pc.updateProjectionMatrix();
      }
    },
    counter: { label: `Height above ${stop.body === "mars" ? "Mars" : "the Moon"}`, dest: `${stop.name} · ${WORLD_NAME[stop.body]}`, from: a0 / 1000, to: 0, at: (u) => Math.exp(la + (lb - la) * (1 - Math.pow(1 - u, 2.2))) / 1000 },
  };
}
// The mirror of the descent: from wherever you're standing, climb straight up out of the site scene into orbit,
// ending on exactly the first picture of the trip to the next world.
const globeSite = (s: Stop | null | undefined) => !!s?.site && (s.body === "moon" || s.body === "mars");
function ascent(index: number, from: Pose): Shot {
  const stop = STOPS[index];
  const f = siteFrame(stop, { center: [0, 0, 0], toward: -1 });
  const r = BODY_RADIUS[stop.body === "mars" ? "mars" : "moon"];
  const d = facingSite(stop, -1);
  const handPos = d.clone().multiplyScalar(r * 1.25), handLook = d.clone().multiplyScalar(r);
  const endPos = f.toSite(handPos);
  descM.lookAt(handPos, handLook, UP);
  const endQ = f.quatToSite(new THREE.Quaternion().setFromRotationMatrix(descM));
  const startPos = from.pos.clone(), startQ = from.quat.clone();
  const a0 = Math.max(1, startPos.y), a1 = endPos.y, la = Math.log(a0), lb = Math.log(a1);
  const site = v(0, 0, 0), p = new THREE.Vector3();
  return {
    scene: sceneFor(index),
    dur: 11,
    cam: (u, cam) => {
      const s = Math.pow(Math.min(1, Math.max(0, u)), 1.7); // a slow, gentle lift-off that speeds up as you climb
      const alt = Math.exp(la + (lb - la) * s);
      const k = (alt - a0) / (a1 - a0);
      p.set(startPos.x * (1 - k) + endPos.x * k, alt, startPos.z * (1 - k) + endPos.z * k);
      cam.position.copy(p);
      // Look down at the site as you rise, and settle on the trip's first view.
      descM.lookAt(p, site, UP);
      descQ.setFromRotationMatrix(descM);
      cam.quaternion.copy(startQ).slerp(descQ, smoothstep01(u / 0.35));
      cam.quaternion.slerp(endQ, smoothstep01((u - 0.6) / 0.4));
      const pc = cam as THREE.PerspectiveCamera;
      const far = Math.max(9000, Math.sqrt(2 * f.R * alt) * 1.6 + alt * 2);
      const near = Math.min(400, Math.max(0.03, alt * 0.004));
      if (Math.abs(pc.far - far) > 1 || Math.abs(pc.near - near) > 0.005) {
        pc.far = far;
        pc.near = near;
        pc.updateProjectionMatrix();
      }
    },
    counter: { label: `Height above ${stop.body === "mars" ? "Mars" : "the Moon"}`, dest: `Leaving ${stop.name}`, from: 0, to: a1 / 1000, at: (u) => Math.exp(la + (lb - la) * Math.pow(u, 1.7)) / 1000 },
  };
}
const smoothstep01 = (x: number) => {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
};

// From one world to another (or out into empty space): lift off, cruise, and arrive.
function leg(a: number, b: number | "end"): Shot {
  const sa = STOPS[a];
  const sb = b === "end" ? null : STOPS[b];
  const bodies: BodyPlacement[] = [];
  const from = placement(sa, [0, 0, 0], -1);
  if (from && globeSite(sa)) from.lit = siteFrame(sa, { center: [0, 0, 0], toward: -1 }).sunTravel().toArray() as [number, number, number];
  if (from) bodies.push(from);
  const at = v(0, 0, -LEG);
  const to = sb ? placement(sb, [0, 0, -LEG], 1) : null;
  if (to && sb && globeSite(sb)) to.lit = siteFrame(sb).sunTravel().toArray() as [number, number, number];
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
  } else if (sb && globeSite(sb)) keys.push(approachKeys(sb, at)[0]); // the descent takes it from here
  else keys.push(...approachKeys(sb, at));

  if (sa.body === "saturn" && sb?.body === "deep") return outerLeg(a, b as number, bodies);
  const dist = sb ? sb.distanceKm : 0;
  return {
    scene: { kind: "travel", key: `leg-${a}`, bodies },
    dur: sb?.body === "deep" ? 3.6 : 3.4,
    tint: { in: hazeOf(sa), out: hazeOf(sb) },
    cam: path(keys, legEase),
    counter: counterFor(sa, sb, dist, sb ? sb.distanceLabel : "Distance from Earth"),
  };
}

// From Voyager all the way home, ending on the same view of Earth as the start screen.
function homeLeg(from: number): Shot {
  const sa = STOPS[from];
  return {
    scene: START_SCENE,
    dur: 3.4,
    cam: path(
      [
        { pos: v(0, 0.5, 70), look: v(0, 0, 0) },
        { pos: v(0.3, 0.6, 24), look: v(0, 0.2, 0) },
        { pos: v(0, 0.6, 7.5), look: v(0, 0.6, 0) },
        START_POSE,
      ],
      launchEase,
    ),
    counter: { label: "Distance from Earth", dest: "Home · Earth", from: sa.distanceKm, to: 0, at: (u) => sa.distanceKm * (1 - launchEase(u)) },
    chip: (u) => (u > 0.35 ? debrisLine() : ""), // ESA figures, public/data/earth-orbit.json
  };
}


// --- Saturn to Voyager 1: the rest of the solar system ---------------------------------------
// Past Uranus, Neptune and icy Pluto, then through the heliopause, the edge of the Sun's bubble. The camera
// eases off as each world slides by (its speed dips around each closest approach), so you get a look at them.
const OUTER = {
  uranus: v(-5, 0.6, -62),
  neptune: v(6, -0.8, -112),
  pluto: v(-1.7, 0.4, -152),
  helioZ: -186, // where the path crosses the heliopause
};
const OUTER_FACTS: [key: "uranus" | "neptune" | "pluto" | "heliopause", text: string, km: number][] = [
  ["uranus", "Uranus · the ice giant that spins on its side · 2.9 billion km from the Sun", 2.9e9],
  ["neptune", "Neptune · the windiest planet · 4.5 billion km from the Sun", 4.5e9],
  ["pluto", "Pluto · an icy dwarf planet with a heart of frozen nitrogen · 5.9 billion km out", 5.9e9],
  ["heliopause", "The heliopause · the edge of the Sun’s bubble · Voyager 1 crossed it in 2012", 18.1e9],
];

function outerLeg(a: number, b: number, bodies: BodyPlacement[]): Shot {
  const sa = STOPS[a];
  const sb = STOPS[b];
  const { uranus: U, neptune: N, pluto: P, helioZ } = OUTER;
  const ahead = (z: number) => v(0, 0.3, z);
  const keys: Key[] = [
    { pos: v(1.6, 0.5, -7.2), look: v(0, -0.4, 0) },
    { pos: v(3, 1.4, -11), look: v(0, 0, 0) },
    { pos: v(2.4, 1.3, -24), look: U },
    { pos: v(-0.9, 0.9, -57), look: U },
    { pos: v(-0.4, 0.8, -64), look: U.clone().add(v(0, 0, -6)) },
    { pos: v(2.5, 0, -92), look: N },
    { pos: v(2.9, -0.5, -108), look: N },
    { pos: v(2.6, -0.4, -115), look: N.clone().add(v(0, 0, -6)) },
    { pos: v(-0.3, 0.3, -142), look: P },
    { pos: v(-1.0, 0.45, -150.5), look: P },
    { pos: v(-0.6, 0.4, -158), look: ahead(-240) },
    { pos: v(0, 0.3, -200), look: ahead(-300) },
    { pos: v(0, 0.3, -222), look: ahead(-320) },
  ];
  const curve = new THREE.CatmullRomCurve3(keys.map((k) => k.pos), false, "centripetal");
  const look = new THREE.CatmullRomCurve3(keys.map((k) => k.look), false, "centripetal");
  // Where along the path (fraction of its length) each world is closest, and where the heliopause is crossed.
  const M = 400;
  const pts = curve.getSpacedPoints(M);
  const nearest = (q: THREE.Vector3) => pts.reduce((best, p, i) => (p.distanceToSquared(q) < pts[best].distanceToSquared(q) ? i : best), 0) / M;
  const at = { uranus: nearest(U), neptune: nearest(N), pluto: nearest(P), heliopause: pts.findIndex((p) => p.z < helioZ) / M };
  // Speed along the path: starts from rest, dips to a fifth around each world, and is still moving at the end
  // (the dissolve into Voyager's scene carries on the motion). Time is the integral of 1/speed, tabulated and inverted.
  const speed = (s: number) => {
    let k = 1;
    for (const f of [at.uranus, at.neptune, at.pluto]) k -= 0.8 * Math.exp(-(((s - f) / 0.045) ** 2));
    k -= 0.5 * Math.exp(-(((s - at.heliopause) / 0.03) ** 2));
    return Math.max(0.05, k) * (0.12 + 0.88 * Math.min(1, s / 0.07)) * (1 - 0.6 * Math.max(0, (s - 0.9) / 0.1));
  };
  const t = [0];
  for (let i = 1; i <= M; i++) t.push(t[i - 1] + 1 / M / speed((i - 0.5) / M));
  const total = t[M];
  const ease = (u: number) => {
    const want = Math.min(1, Math.max(0, u)) * total;
    let i = 0;
    while (i < M && t[i + 1] < want) i++;
    return (i + (i < M ? (want - t[i]) / (t[i + 1] - t[i]) : 0)) / M;
  };
  // The distance counter passes each world at its real distance (roughly, from the Sun), ending at Voyager's.
  const marks: [number, number][] = [[0, sa.distanceKm], ...OUTER_FACTS.map(([k, , km]): [number, number] => [at[k], km]), [1, sb.distanceKm]];
  const kmAt = (s: number) => {
    let i = 0;
    while (i < marks.length - 2 && s > marks[i + 1][0]) i++;
    const [s0, k0] = marks[i], [s1, k1] = marks[i + 1];
    return k0 + (k1 - k0) * Math.min(1, Math.max(0, (s - s0) / Math.max(1e-6, s1 - s0)));
  };
  const p = new THREE.Vector3(), l = new THREE.Vector3();
  const hc = TRAVEL_SUN.clone().multiplyScalar(700).add(v(0, 0.3, helioZ)); // a shell around the far-off Sun
  return {
    scene: {
      kind: "travel",
      key: `leg-${a}`,
      bodies: [
        ...bodies,
        { key: "uranus", pos: U.toArray() as [number, number, number], rotY: 0 },
        { key: "neptune", pos: N.toArray() as [number, number, number], rotY: 0 },
        { key: "pluto", pos: P.toArray() as [number, number, number], rotY: 0 }, // the heart faces you as you pass
      ],
      heliopause: { center: hc.toArray() as [number, number, number], radius: 700 },
    },
    dur: 11,
    tint: { in: hazeOf(sa) },
    cam: (u, cam) => {
      const s = ease(u);
      curve.getPointAt(s, p);
      look.getPoint(curve.getUtoTmapping(s, null as unknown as number), l);
      aim(cam, p, l);
    },
    counter: { label: sb.distanceLabel, dest: `${sb.name} · ${WORLD_NAME[sb.body]}`, from: sa.distanceKm, to: sb.distanceKm, at: (u) => kmAt(ease(u)) },
    chip: (u) => {
      const s = ease(u);
      if (s < 0.05) return "Leaving Saturn";
      const near = OUTER_FACTS.find(([k]) => Math.abs(s - at[k]) < (k === "heliopause" ? 0.09 : 0.07));
      return near ? near[1] : "";
    },
  };
}

function startShot(dur: number, fadeIn: number): Shot {
  return { scene: START_SCENE, dur, fadeIn, cam: (_, cam) => aim(cam, START_POSE.pos, START_POSE.look) };
}

// --- Plans -----------------------------------------------------------------------------------

export function plan(from: { phase: string; stop: number; scene: SceneDesc }, to: Target, mode: "journey" | "jump", pose: Pose, reduced: boolean): Shot[] {
  const here = from.scene;
  const exploring = from.phase === "explore" && from.stop >= 0;

  // Jumps (Back, skipping, links straight to a stop, reduced motion): fade out, cut, fade in. Trips to and from
  // machines outside the story are jumps too.
  const outside = (typeof to === "number" && to >= STORY_COUNT) || (exploring && from.stop >= STORY_COUNT);
  if (mode === "jump" || reduced || outside) {
    const shots: Shot[] = [];
    if (from.phase !== "start" || from.stop >= 0) shots.push({ ...hold(here, pose, 0.5, 0.5), tint: { out: typeof to === "number" ? hazeOf(STOPS[to]) : undefined } });
    if (to === "start" || to === "end") shots.push(startShot(0.9, 0.6));
    else shots.push(reduced ? { ...arrive(to, 0.8, 0.5), cam: (_, cam) => aim(cam, spawnPose(to).pos, spawnPose(to).look) } : arrive(to, 1.8, 0.5));
    return shots;
  }

  if (to === "start") return [hold(here, pose, 0.5, 0.5), startShot(0.9, 0.6)];

  // The very first trip, from Earth.
  if (!exploring) {
    if (to === "end") return [startShot(0.9, 0.6)];
    if (to === 0) return [startLeg(), descent(0)];
    return [arrive(to, 1.8, 0.5)];
  }

  const a = from.stop;
  if (to === "end") return [depart(a, pose), homeLeg(a)];
  const sa = STOPS[a];
  const sb = STOPS[to];
  if (sa.body === sb.body && sa.site && sb.site) return [depart(a, pose), hop(a, to), arrive(to)];
  return [globeSite(sa) ? ascent(a, pose) : depart(a, pose), leg(a, to), globeSite(sb) ? descent(to) : arrive(to)];
}
