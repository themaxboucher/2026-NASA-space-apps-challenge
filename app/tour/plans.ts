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

// Brakes as the target nears: by half time you've covered ~84% of the way, so you still see the planet swell up,
// without crawling through the last stretch.
const glide = (u: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, u)), 2.6);
// Every trip starts from rest (no jolt), speeds up, then takes the same long braking approach.
const launchEase = (u: number) => glide(u * u * (2 - u));
// The first trip, Earth to the Moon: an unhurried ease in, a steady cruise and a long soft approach.
const firstTrip = (u: number) => {
  const x = Math.min(1, Math.max(0, u));
  // Still moving (about a fifth of cruise speed) at the end, so the drop into the landing site carries on
  // through the dissolve instead of stalling first.
  return 0.7 * (1 - Math.pow(1 - x * x * (3 - 2 * x), 1.8)) + 0.3 * x;
};
// Other trips between worlds: the same braking approach, but never quite stopping before the hand-off.
const legEase = (u: number) => 0.75 * launchEase(u) + 0.25 * Math.min(1, Math.max(0, u));

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
    at: (u) => start + (distanceTo - start) * legEase(u), // the same ease as the camera (leg() flies with legEase)
  };
}

// Height above a world's surface (km) for a point in a site's frame (metres, site at the origin, centre at -R below).
const heightKm = (p: THREE.Vector3, R: number) => (Math.hypot(p.x, p.y + R, p.z) - R) / 1000;

// From Earth (the start screen) to the first stop on the Moon: rise over Earth's north pole toward the Moon.
function startLeg(): Shot {
  const first = STOPS[0];
  const moonAt = v(0, 0, -LEG);
  return {
    scene: START_SCENE, // the same scene as the start screen (it already holds the Moon), so nothing cuts
    dur: 6.5,
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
  const site = v(0, 0, 0), p = new THREE.Vector3(), q = new THREE.Vector3();
  const posAt = (u: number, out: THREE.Vector3) => {
    const s = 1 - Math.pow(1 - Math.min(1, Math.max(0, u)), 1.8);
    const alt = Math.exp(la + (lb - la) * s);
    const k = (alt - a1) / (a0 - a1); // 1 at the start, 0 at the end: sideways offset shrinks with height
    return out.set(startPos.x * k + endPos.x * (1 - k), alt, startPos.z * k + endPos.z * (1 - k));
  };
  return {
    scene: sceneFor(index),
    dur: 6.5,
    cam: (u, cam) => {
      posAt(u, p);
      const alt = p.y;
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
    // The true height above the curved surface where the camera is (not just its height over the site's flat frame).
    counter: { label: `Height above ${stop.body === "mars" ? "Mars" : "the Moon"}`, dest: `${stop.name} · ${WORLD_NAME[stop.body]}`, from: heightKm(startPos, f.R), to: 0, at: (u) => Math.max(0, heightKm(posAt(u, q), f.R)) },
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
  const site = v(0, 0, 0), p = new THREE.Vector3(), q = new THREE.Vector3();
  const posAt = (u: number, out: THREE.Vector3) => {
    const s = Math.pow(Math.min(1, Math.max(0, u)), 1.25); // a gentle lift-off that soon speeds up (no long hover by the site)
    const alt = Math.exp(la + (lb - la) * s);
    const k = (alt - a0) / (a1 - a0);
    return out.set(startPos.x * (1 - k) + endPos.x * k, alt, startPos.z * (1 - k) + endPos.z * k);
  };
  return {
    scene: sceneFor(index),
    dur: 7,
    cam: (u, cam) => {
      posAt(u, p);
      const alt = p.y;
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
    counter: { label: `Height above ${stop.body === "mars" ? "Mars" : "the Moon"}`, dest: `Leaving ${stop.name}`, from: 0, to: heightKm(endPos, f.R), at: (u) => Math.max(0, heightKm(posAt(u, q), f.R)) },
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

  // Out to Voyager 1 past the outer planets: from Saturn on the full trip, from Mars on the short one.
  if ((sa.body === "saturn" || sa.body === "mars") && sb?.body === "deep") return outerLeg(a, b as number, bodies);
  const dist = sb ? sb.distanceKm : 0;


  return {
    scene: { kind: "travel", key: `leg-${a}`, bodies },
    dur: sb?.body === "deep" ? 3 : 2.8,
    tint: { in: hazeOf(sa), out: hazeOf(sb) },
    cam: path(keys, legEase),
    counter: counterFor(sa, sb, dist, sb ? sb.distanceLabel : "Distance from Earth"),
  };
}

// --- Flying past a row of worlds ------------------------------------------------------------------
// A spline through key poses, flown at a speed that dips (to about a fifth) around each world's closest approach,
// so you get a look at it as it slides by. Time is the integral of 1/speed, tabulated and inverted.
function flyby(keys: Key[]) {
  const curve = new THREE.CatmullRomCurve3(keys.map((k) => k.pos), false, "centripetal");
  const look = new THREE.CatmullRomCurve3(keys.map((k) => k.look), false, "centripetal");
  const M = 400;
  const pts = curve.getSpacedPoints(M);
  // Where along the path (fraction of its length) a point is passed closest, or a test first holds.
  const nearest = (q: THREE.Vector3) => pts.reduce((best, p, i) => (p.distanceToSquared(q) < pts[best].distanceToSquared(q) ? i : best), 0) / M;
  const first = (test: (p: THREE.Vector3) => boolean) => pts.findIndex(test) / M;
  // dips: [where, how deep, how wide]. `land`: brake to a stop at the end (speed ~ sqrt of the distance left, so it
  // settles like a steady braking); otherwise it is still moving, so the next shot's dissolve carries the motion on.
  const timed = (dips: [number, number, number][], land = false) => {
    const speed = (s: number) => {
      let k = 1;
      for (const [f, depth, width] of dips) k -= depth * Math.exp(-(((s - f) / width) ** 2));
      const tail = land ? Math.sqrt(Math.min(1, (1 - s) / 0.22)) : 1 - 0.6 * Math.max(0, (s - 0.9) / 0.1);
      return Math.max(0.05, k) * (0.12 + 0.88 * Math.min(1, s / 0.07)) * tail;
    };
    const t = [0];
    for (let i = 1; i <= M; i++) t.push(t[i - 1] + 1 / M / speed((i - 0.5) / M));
    const total = t[M];
    return (u: number) => {
      const want = Math.min(1, Math.max(0, u)) * total;
      let i = 0;
      while (i < M && t[i + 1] < want) i++;
      return (i + (i < M ? (want - t[i]) / (t[i + 1] - t[i]) : 0)) / M;
    };
  };
  const p = new THREE.Vector3(), l = new THREE.Vector3();
  const cam = (ease: (u: number) => number) => (u: number, c: THREE.Camera) => {
    const s = ease(u);
    curve.getPointAt(s, p);
    look.getPoint(curve.getUtoTmapping(s, null as unknown as number), l);
    aim(c, p, l);
  };
  return { nearest, first, timed, cam, point: (s: number, out: THREE.Vector3) => curve.getPointAt(s, out) };
}

// A distance readout passing each world at its own figure: [where on the path, km]. `log` blends on a log scale,
// for counts that fall through many powers of ten.
function kmTrack(marks: [number, number][], log = false) {
  return (s: number) => {
    let i = 0;
    while (i < marks.length - 2 && s > marks[i + 1][0]) i++;
    const [s0, k0] = marks[i], [s1, k1] = marks[i + 1];
    const f = Math.min(1, Math.max(0, (s - s0) / Math.max(1e-6, s1 - s0)));
    return log ? Math.exp(Math.log(k0) + (Math.log(k1) - Math.log(k0)) * f) : k0 + (k1 - k0) * f;
  };
}

// Captions along a path: [where, how far either side it shows, text]; the nearest one in range wins.
type Chip = [number, number, string];
function chipAt(list: Chip[], s: number) {
  let best: Chip | null = null;
  for (const c of list) if (Math.abs(s - c[0]) < c[1] && (!best || Math.abs(s - c[0]) < Math.abs(s - best[0]))) best = c;
  return best ? best[2] : "";
}

// Voyager 1 and Voyager 2 today (public/data/deepspace.json: ecliptic longitude and latitude in degrees, AU from the Sun).
export const VOYAGER_ECL = { voyager1: { lon: 256.8, lat: 35.2, au: 172.35 }, voyager2: { lon: 290.7, lat: -38.5, au: 144.47 } };
const AU_KM = 149_597_870.7;
// Heliocentric ecliptic coordinates (AU) in scene axes (y = ecliptic north), the way the Voyager replay draws them.
export const eclToScene = ({ lon, lat, au }: { lon: number; lat: number; au: number }) =>
  v(Math.cos(lat * DEG) * Math.cos(lon * DEG), Math.sin(lat * DEG), -Math.cos(lat * DEG) * Math.sin(lon * DEG)).multiplyScalar(au);
// Where Voyager 2 is in Voyager 1's sky, in the travel scene: the real direction from Voyager 1 (44° from the Sun),
// turned so the Sun sits where the travel scene draws it, with ecliptic north kept up.
const V1_AT = eclToScene(VOYAGER_ECL.voyager1), V2_AT = eclToScene(VOYAGER_ECL.voyager2);
const V2_APART_AU = V2_AT.distanceTo(V1_AT);
const V2_DIR = (() => {
  const frame = (x: THREE.Vector3) => {
    const z = new THREE.Vector3().crossVectors(x, UP).normalize();
    return new THREE.Matrix4().makeBasis(x, new THREE.Vector3().crossVectors(z, x), z);
  };
  const from = frame(V1_AT.clone().negate().normalize()), to = frame(TRAVEL_SUN.clone());
  return V2_AT.clone().sub(V1_AT).normalize().applyMatrix4(to.multiply(from.transpose()));
})();
const billion = (au: number) => `${((au * AU_KM) / 1e9).toFixed(1)} billion km`;

// --- Voyager 1 back home: the whole solar system on the way --------------------------------------------
// Not to scale: the worlds are strung along the way home in their real order, each passed on its sunlit side,
// while the readout counts down through roughly their real distances from Earth. Then a dissolve into the start
// scene (the Moon is already out there), a pass by the Moon, a swing through Earth's cloud of junk, and the start
// screen's own view, where the tribute and the end screen take over.
const HOME = {
  neptune: v(-4.2, -0.7, 58),
  uranus: v(-5, 0.9, 104),
  saturn: v(-7, -1.8, 160),
  jupiter: v(-7.5, 0.3, 222),
  rock: v(1.4, -0.4, 256),
  ceres: v(-1.8, 0.35, 266),
  mars: v(-2.4, 0.15, 322),
  helioZ: 30, // where the path crosses back into the Sun's bubble
};

function homeTrip(from: number): Shot[] {
  const sa = STOPS[from];
  const { neptune: N, uranus: U, saturn: S, jupiter: J, rock: R, ceres: C, mars: M, helioZ } = HOME;
  // Eyes on the way ahead: each world slides past off to the side instead of being zoomed in on.
  const ahead = (from: THREE.Vector3) => v(from.x * 0.5, from.y * 0.5, from.z + 30);
  const glance = (from: THREE.Vector3, world: THREE.Vector3) => ahead(from).lerp(world, 0.3);
  const fly = flyby([
    { pos: v(0.6, 0.5, -4), look: v(14, -3, 20) }, // looking out toward the Sun and Voyager 2
    { pos: v(0.4, 0.4, 16), look: v(10, -2, 44) },
    { pos: v(0.8, 0.5, 40), look: glance(v(0.8, 0.5, 40), N) },
    { pos: v(-1.2, 0.4, 56.5), look: glance(v(-1.2, 0.4, 56.5), N) },
    { pos: v(-0.4, 0.6, 66), look: ahead(v(-0.4, 0.6, 66)) },
    { pos: v(-2.2, 0.8, 92), look: glance(v(-2.2, 0.8, 92), U) },
    { pos: v(-2.4, 1.0, 102.5), look: glance(v(-2.4, 1.0, 102.5), U) },
    { pos: v(-1.6, 1.0, 112), look: ahead(v(-1.6, 1.0, 112)) },
    { pos: v(-1.0, 2.4, 140), look: glance(v(-1.0, 2.4, 140), S) },
    { pos: v(-2.0, 3.2, 156), look: glance(v(-2.0, 3.2, 156), S) }, // high over the rings
    { pos: v(-1.4, 2.6, 168), look: ahead(v(-1.4, 2.6, 168)) },
    { pos: v(-1.6, 1.6, 200), look: glance(v(-1.6, 1.6, 200), J) },
    { pos: v(-1.6, 1.5, 219), look: glance(v(-1.6, 1.5, 219), J) },
    { pos: v(-1.8, 1.0, 230), look: ahead(v(-1.8, 1.0, 230)) },
    { pos: v(0.4, 0.4, 250), look: v(0, 0.2, 290) }, // into the asteroid belt
    { pos: v(0.1, 0.3, 262), look: glance(v(0.1, 0.3, 262), C) },
    { pos: v(-0.2, 0.4, 272), look: v(0, 0.3, 305) },
    { pos: v(-0.6, 0.4, 312), look: glance(v(-0.6, 0.4, 312), M) },
    { pos: v(-0.9, 0.5, 321), look: glance(v(-0.9, 0.5, 321), M) },
    { pos: v(-0.4, 0.5, 333), look: ahead(v(-0.4, 0.5, 333)) },
    { pos: v(0.3, 0.6, 362), look: v(0.3, 0.6, 420) },
  ]);
  const at = { helio: fly.first((p) => p.z > helioZ), neptune: fly.nearest(N), uranus: fly.nearest(U), saturn: fly.nearest(S), jupiter: fly.nearest(J), belt: (fly.nearest(R) + fly.nearest(C)) / 2, mars: fly.nearest(M) };
  const ease = fly.timed([
    [0.02, 0.45, 0.03], // a short look at the first view (the Sun ahead, Voyager 2 off to the side), then away
    [at.helio, 0.45, 0.03],
    [at.neptune, 0.3, 0.05],
    [at.uranus, 0.3, 0.04],
    [at.saturn, 0.3, 0.05],
    [at.jupiter, 0.3, 0.045],
    [at.belt, 0.3, 0.05],
    [at.mars, 0.3, 0.035],
  ]);
  const MARS_KM = STOPS.find((s) => s.body === "mars")?.distanceKm ?? 225e6;
  const SATURN_KM = STOPS.find((s) => s.body === "saturn")?.distanceKm ?? 1.3e9;
  const HANDOFF_KM = 6e6; // where the dissolve into the Earth-Moon scene happens
  const kmA = kmTrack(
    [
      [0, sa.distanceKm],
      [at.helio, 18.1e9], // about 121 AU, where Voyager 1 crossed it
      [at.neptune, 4.4e9],
      [at.uranus, 2.8e9],
      [at.saturn, SATURN_KM],
      [at.jupiter, 7.5e8],
      [at.belt, 3.5e8],
      [at.mars, MARS_KM],
      [1, HANDOFF_KM],
    ],
    true,
  );
  const chipsA: Chip[] = [
    [0.015, 0.045, `Voyager 2 (marked) · Voyager 1’s twin · ${billion(VOYAGER_ECL.voyager2.au)} from the Sun, ${billion(V2_APART_AU)} from Voyager 1`],
    [at.helio, 0.035, "The heliopause · back inside the Sun’s bubble · Voyager 2 crossed it in 2018"],
    [at.neptune, 0.05, "Neptune · the windiest planet · 4.5 billion km from the Sun"],
    [at.uranus, 0.05, "Uranus · the ice giant that spins on its side · 2.9 billion km from the Sun"],
    [at.saturn, 0.06, "Saturn · its rings are billions of chunks of ice, from specks of dust to the size of a house"],
    [at.jupiter, 0.055, "Jupiter · the biggest planet: more than 1,300 Earths would fit inside"],
    [at.belt, 0.05, "The asteroid belt · millions of rocks, so far apart that spacecraft fly through safely · Ceres is the biggest"],
    [at.mars, 0.045, "Mars · Opportunity and Ingenuity are still down there"],
  ];

  // The Earth-Moon part, in the start screen's own scene: Earth at the centre, the Moon 40 units out along -z.
  const moonAt = v(0, 0, -LEG);
  const home = flyby([
    { pos: v(0.4, 0.9, -100), look: moonAt },
    { pos: v(1.0, 0.6, -56), look: moonAt },
    { pos: v(1.35, 0.45, -41), look: moonAt },
    { pos: v(1.6, 0.8, -30), look: v(0, 0, 0) },
    { pos: v(4.5, 2.2, -8), look: v(0, 0, 0) },
    { pos: v(4.2, 1.8, 1.5), look: v(0, 0.3, 0) },
    START_POSE,
  ]);
  const atMoon = home.nearest(moonAt);
  const easeB = home.timed([[atMoon, 0.75, 0.06]], true);
  // Down to the Moon's real distance, then on toward Earth; in close, it hands over to the camera's real height in
  // this scene (Earth's radius is 1 here, 6,371 km), so it ends on the true height of the start screen's view.
  const endKm = (START_POSE.pos.length() - 1) * 6371;
  const toward = kmTrack([[0, HANDOFF_KM], [atMoon, 384_400], [1, endKm]], true);
  const camAt = new THREE.Vector3();
  const kmB = (s: number) => {
    const d = home.point(s, camAt).length();
    const w = smoothstep01((24 - d) / 16); // 0 beyond 24 Earth radii, 1 inside 8
    return toward(s) * (1 - w) + (d - 1) * 6371 * w;
  };
  const xyz = (p: THREE.Vector3) => p.toArray() as [number, number, number];

  return [
    {
      scene: {
        kind: "travel",
        key: "home-trip",
        bodies: [
          { key: "neptune", pos: xyz(N), rotY: 0 },
          { key: "uranus", pos: xyz(U), rotY: 0 },
          { key: "saturn", pos: xyz(S), rotY: 0 },
          { key: "jupiter", pos: xyz(J), rotY: 0 },
          { key: "rock", pos: xyz(R), rotY: 0.8 },
          { key: "ceres", pos: xyz(C), rotY: 0 },
          { key: "mars", pos: xyz(M), rotY: 2.2 },
        ],
        heliopause: { center: xyz(TRAVEL_SUN.clone().multiplyScalar(700).add(v(0, 0.3, helioZ))), radius: 700 },
        belt: { z: [R.z - 14, C.z + 16] },
        voyager2: { dir: xyz(V2_DIR), fadeZ: 34 },
      },
      dur: 28,
      cam: fly.cam(ease),
      counter: { label: "Distance from Earth", dest: "Home · Earth", from: sa.distanceKm, to: HANDOFF_KM, at: (u) => kmA(ease(u)) },
      chip: (u) => chipAt(chipsA, ease(u)),
    },
    {
      scene: START_SCENE,
      dur: 13,
      cam: home.cam(easeB),
      counter: { label: "Distance from Earth", dest: "Home · Earth", from: HANDOFF_KM, to: kmB(1), at: (u) => kmB(easeB(u)) },
      chip: (u) => {
        const s = easeB(u);
        if (Math.abs(s - atMoon) < 0.12) return "The Moon · Eagle’s lower half and the Apollo 15 rover are still parked there";
        return s > atMoon + 0.2 ? debrisLine() : ""; // ESA figures, public/data/earth-orbit.json
      },
    },
  ];
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
type OuterKey = "jupiter" | "saturn" | "uranus" | "neptune" | "pluto" | "heliopause";
const OUTER_FACTS: [key: OuterKey, text: string, km: number][] = [
  ["uranus", "Uranus · the ice giant that spins on its side · only Voyager 2 has been here, in 1986", 2.9e9],
  ["neptune", "Neptune · the windiest planet · Voyager 2 flew past in 1989, the only visit so far", 4.5e9],
  ["pluto", "Pluto · an icy dwarf planet with a heart of frozen nitrogen · 5.9 billion km out", 5.9e9],
  ["heliopause", "The heliopause · the edge of the Sun’s bubble · Voyager 1 crossed it in 2012", 18.1e9],
];
// The short trip leaves from Mars, so it passes the two giants first, the way Voyager 1 itself went.
const GIANT_FACTS: [key: OuterKey, text: string, km: number][] = [
  ["jupiter", "Jupiter · Voyager 1 swung past in 1979, and its gravity flung it on toward Saturn", 7.8e8],
  ["saturn", "Saturn · Voyager 1 flew by in 1980, then climbed out of the planets’ plane for good", 1.4e9],
];
const GIANTS = { jupiter: v(-12, -0.6, -22), saturn: v(14, -1.8, -42) };

function outerLeg(a: number, b: number, bodies: BodyPlacement[]): Shot {
  const sa = STOPS[a];
  const sb = STOPS[b];
  const { uranus: U, neptune: N, pluto: P, helioZ } = OUTER;
  const { jupiter: J, saturn: S } = GIANTS;
  const ahead = (z: number) => v(0, 0.3, z);
  const fromMars = sa.body === "mars";
  // Leaving the world you were on: from Mars, pull back from the planet and turn outward, then past Jupiter
  // and Saturn; from Saturn, pull back from its rings.
  let start: Key[];
  if (fromMars) {
    const r = BODY_RADIUS.mars;
    const d = facingSite(sa, -1);
    start = [
      { pos: d.clone().multiplyScalar(r * 1.25), look: d.clone().multiplyScalar(r) }, // where the climb out ended
      { pos: d.clone().multiplyScalar(r * 3.5), look: v(0, 0, 0) },
      { pos: d.clone().multiplyScalar(r * 6).add(v(0.6, 0.5, 0)), look: v(0, 0, -20) },
      { pos: v(-1.5, 0.8, -14), look: J },
      { pos: v(-3, 1.2, -22), look: J },
      { pos: v(0.5, 1.2, -32), look: S },
      { pos: v(4.5, 1.6, -42), look: S },
      { pos: v(2.6, 1.3, -50), look: U },
    ];
  } else
    start = [
      { pos: v(1.6, 0.5, -7.2), look: v(0, -0.4, 0) },
      { pos: v(3, 1.4, -11), look: v(0, 0, 0) },
      { pos: v(2.4, 1.3, -24), look: U },
    ];
  const fly = flyby([
    ...start,
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
  ]);
  const facts = fromMars ? [...GIANT_FACTS, ...OUTER_FACTS] : OUTER_FACTS;
  const at: Record<OuterKey, number> = {
    jupiter: fly.nearest(J),
    saturn: fly.nearest(S),
    uranus: fly.nearest(U),
    neptune: fly.nearest(N),
    pluto: fly.nearest(P),
    heliopause: fly.first((p) => p.z < helioZ),
  };
  // Slow enough past each world for its caption to be read (about 3 seconds each), quick in between.
  const ease = fly.timed(facts.map(([k]): [number, number, number] => (k === "heliopause" ? [at[k], 0.7, 0.05] : [at[k], 0.82, fromMars ? 0.05 : 0.06])));
  // The distance counter passes each world at its real distance (roughly, from the Sun), ending at Voyager's.
  const kmAt = kmTrack([[0, sa.distanceKm], ...facts.map(([k, , km]): [number, number] => [at[k], km]), [1, sb.distanceKm]]);
  const hc = TRAVEL_SUN.clone().multiplyScalar(700).add(v(0, 0.3, helioZ)); // a shell around the far-off Sun
  const xyz = (q: THREE.Vector3) => q.toArray() as [number, number, number];
  return {
    scene: {
      kind: "travel",
      key: `leg-${a}`,
      bodies: [
        ...bodies,
        ...(fromMars
          ? [
              { key: "jupiter" as const, pos: xyz(J), rotY: 0 },
              { key: "saturn" as const, pos: xyz(S), rotY: 0 },
            ]
          : []),
        { key: "uranus", pos: xyz(U), rotY: 0 },
        { key: "neptune", pos: xyz(N), rotY: 0 },
        { key: "pluto", pos: xyz(P), rotY: 0 }, // the heart faces you as you pass
      ],
      heliopause: { center: hc.toArray() as [number, number, number], radius: 700 },
    },
    dur: fromMars ? 22 : 16,
    tint: { in: hazeOf(sa) },
    cam: fly.cam(ease),
    counter: { label: sb.distanceLabel, dest: `${sb.name} · ${WORLD_NAME[sb.body]}`, from: sa.distanceKm, to: sb.distanceKm, at: (u) => kmAt(ease(u)) },
    chip: (u) => {
      const s = ease(u);
      if (s < (fromMars ? 0.03 : 0.05)) return fromMars ? "Leaving Mars" : "Leaving Saturn";
      const near = facts.find(([k]) => Math.abs(s - at[k]) < (k === "heliopause" ? 0.11 : fromMars ? 0.07 : 0.09));
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
  if (to === "end") return [depart(a, pose), ...homeTrip(a)];
  const sa = STOPS[a];
  const sb = STOPS[to];
  if (sa.body === sb.body && sa.site && sb.site) return [depart(a, pose), hop(a, to), arrive(to)];
  return [globeSite(sa) ? ascent(a, pose) : depart(a, pose), leg(a, to), globeSite(sb) ? descent(to) : arrive(to)];
}
