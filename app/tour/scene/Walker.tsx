"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { coarsePointer } from "../lib/device";
import { dismissIntro, hud, live, openHotspot, solids, tour } from "../state";
import type { Ladder, Stop } from "../stops";

export const EYE = 1.7;
// Crouched eye height: low enough to look a rover in the eye.
const CROUCH_EYE = 0.85;

type Key = "fwd" | "back" | "left" | "right" | "run" | "up" | "down";
const KEYS: Record<string, Key> = {
  KeyW: "fwd",
  ArrowUp: "fwd",
  KeyS: "back",
  ArrowDown: "back",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
  ShiftLeft: "run",
  ShiftRight: "run",
  // Straight up and down, used when floating in space.
  Space: "up",
  KeyE: "up",
  KeyC: "down",
  KeyQ: "down",
};

const isTyping = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
};

const euler = new THREE.Euler(0, 0, 0, "YXZ");
const fwd = new THREE.Vector3();
const right = new THREE.Vector3();
const want = new THREE.Vector3();
const next = new THREE.Vector3();
const replayAt = new THREE.Vector3();
const replayLook = new THREE.Vector3();
const replayM = new THREE.Matrix4();
const replayQ = new THREE.Quaternion();

// --- Collisions against the machine's real meshes (raycasts; the models are tens of thousands of triangles) ---
const ray = new THREE.Raycaster();
const DOWN = new THREE.Vector3(0, -1, 0);
const o = new THREE.Vector3();
const dir = new THREE.Vector3();
const n = new THREE.Vector3();
const RADIUS = 0.35; // how close you can get to a wall
const shown = (x: THREE.Object3D | null) => {
  for (; x; x = x.parent) if (!x.visible) return false;
  return true;
};
function firstHit(origin: THREE.Vector3, d: THREE.Vector3, far: number) {
  ray.set(origin, d);
  ray.far = far;
  for (const h of ray.intersectObjects([...solids], true)) if (shown(h.object)) return h;
  return null;
}
// Slide the move from `from` to `to` along anything hit at knee and chest height.
function collide(from: THREE.Vector3, to: THREE.Vector3, feet: number, eye: number) {
  // Knees, chest and the top of your head: crouch low enough and you can duck under things.
  for (const hgt of [0.45, Math.min(1.25, eye - 0.2), eye + 0.15]) {
    dir.set(to.x - from.x, 0, to.z - from.z);
    const len = dir.length();
    if (len < 1e-5) return;
    dir.divideScalar(len);
    o.set(from.x, feet + hgt, from.z);
    const h = firstHit(o, dir, len + RADIUS);
    if (!h?.face) continue;
    n.copy(h.face.normal).transformDirection(h.object.matrixWorld).setY(0);
    if (n.lengthSq() < 1e-6) continue;
    n.normalize();
    if (n.dot(dir) > 0) n.negate();
    const pen = len + RADIUS - h.distance;
    to.x += n.x * pen;
    to.z += n.z * pen;
  }
}
// Height of the machine's surface under (x, z), looking down from `fromY`; null if there's only ground below.
function surfaceBelow(x: number, fromY: number, z: number) {
  o.set(x, fromY, z);
  const h = firstHit(o, DOWN, 40);
  return h ? h.point.y : null;
}
// Close enough to a ladder, and facing it, to grab on? Returns where along it you are (t: 0 bottom .. 1 top).
const la = new THREE.Vector3();
const lb = new THREE.Vector3();
const lout = new THREE.Vector3();
function onLadder(l: Ladder, pos: THREE.Vector3, yaw: number, feet: number) {
  la.set(...l.from);
  lb.set(...l.to);
  lout.set(...l.out).setY(0).normalize();
  const len = la.distanceTo(lb);
  const t = Math.min(1, Math.max(0, (feet - la.y) / (lb.y - la.y)));
  // You stand 0.45 m out from the rungs, on the side away from the machine.
  const sx = la.x + (lb.x - la.x) * t + lout.x * 0.45, sz = la.z + (lb.z - la.z) * t + lout.z * 0.45;
  if (Math.hypot(pos.x - sx, pos.z - sz) > 0.8) return null;
  const facing = Math.sin(yaw) * lout.x + Math.cos(yaw) * lout.z; // 1 when looking straight at the ladder
  if (facing < 0.3 && t < 0.05) return null;
  return {
    t,
    len,
    over: new THREE.Vector3(-lout.x, 0, -lout.z),
    at: (u: number, target: THREE.Vector3) =>
      target.set(la.x + (lb.x - la.x) * u + lout.x * 0.45, la.y + (lb.y - la.y) * u, la.z + (lb.z - la.z) * u + lout.z * 0.45),
  };
}
// Shows the "far enough" hint when you reach the invisible fence.
let atEdge = false;
function edge(on: boolean) {
  if (on === atEdge) return;
  atEdge = on;
  document.querySelector(".tour")?.classList.toggle("at-edge", on);
}

// The "x8" readout in the keys bar, shown while running faster than double speed.
function showSpeed(s: { shown: string }, boost: number) {
  const text = boost > 2 ? `×${Math.round(boost)}` : "";
  if (text === s.shown || !hud.speed) return;
  s.shown = text;
  if (text) hud.speed.textContent = text;
  hud.speed.toggleAttribute("data-on", !!text);
}

// Walk on the ground (or float in space) with W A S D / arrow keys, and drag to look around.
// On touch screens it falls back to circling the machine.
// The glowing dot nearest the middle of the screen (within 90 px): what the crosshair would open.
function aimedSpot() {
  const cx = innerWidth / 2, cy = innerHeight / 2;
  let best: HTMLElement | null = null, bestD = 90;
  document.querySelectorAll<HTMLElement>(".spot-wrap .spot").forEach((b) => {
    const r = b.getBoundingClientRect();
    if (!r.width || b.closest<HTMLElement>(".spot-wrap")?.style.visibility === "hidden") return;
    const d = Math.hypot(r.left + r.width / 2 - cx, r.top + r.height / 2 - cy);
    if (d < bestD) { bestD = d; best = b; }
  });
  return best as HTMLElement | null;
}

export function Walker({ stop, mode, ground, center }: { stop: Stop; mode: "walk" | "float"; ground?: (x: number, z: number) => number; center: [number, number, number] }) {
  const { camera, gl } = useThree();
  const touch = useMemo(() => coarsePointer(), []);
  const st = useRef({ yaw: 0, pitch: 0, vel: new THREE.Vector3(), keys: new Set<Key>(), drag: null as null | { x: number; y: number; moved: number }, active: false, crouch: false, locked: false, aimed: null as HTMLElement | null, hop: 0, vy: 0, upWas: false, base: null as number | null, floor: null as number | null, climbing: false, held: 0, boost: 1, shown: "", walled: false });
  const orbit = useRef<OrbitControls | null>(null);

  useEffect(() => {
    const el = gl.domElement;
    const s = st.current;
    const down = (e: PointerEvent) => {
      if (tour.get().phase !== "explore" || e.button !== 0) return;
      s.drag = { x: e.clientX, y: e.clientY, moved: 0 };
      if (!touch) el.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      // Mouse look: once the view has the mouse (after a click), moving the mouse turns your head, like a game.
      if (s.locked) {
        s.yaw -= e.movementX * 0.0024;
        s.pitch = Math.max(-1.4, Math.min(1.4, s.pitch - e.movementY * 0.0024));
        return;
      }
      const d = s.drag;
      if (!d) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      d.x = e.clientX;
      d.y = e.clientY;
      d.moved += Math.abs(dx) + Math.abs(dy);
      if (d.moved > 6) dismissIntro();
      if (touch) return;
      // "Grab the world" dragging, like the atlas's walk mode and Street View.
      s.yaw += dx * 0.0042;
      s.pitch = Math.max(-1.4, Math.min(1.4, s.pitch + dy * 0.0042));
    };
    const up = () => {
      const click = s.drag && s.drag.moved < 6;
      s.drag = null;
      if (!click || touch) return;
      if (s.locked) {
        // Clicking with the crosshair on (or near) a glowing dot opens it, and gives the mouse back to read its story.
        const best = aimedSpot();
        if (best) { document.exitPointerLock(); best.click(); }
        return;
      }
      // A click on the scene closes any open card and takes the mouse for looking around (Esc gives it back).
      openHotspot(stop.id, null);
      dismissIntro();
      const req = el.requestPointerLock() as unknown as Promise<void> | undefined;
      req?.catch?.(() => {});
    };
    const lockChange = () => {
      s.locked = document.pointerLockElement === el;
      el.closest(".tour")?.classList.toggle("looking", s.locked);
    };
    document.addEventListener("pointerlockchange", lockChange);
    // Tapping Ctrl on its own toggles crouching. A toggle, not a hold (Ctrl+W would close the tab), and never
    // when Ctrl is part of a shortcut like Ctrl+C or Ctrl+click.
    let ctrlAlone = false;
    const anyPointer = () => {
      ctrlAlone = false;
    };
    const keyDown = (e: KeyboardEvent) => {
      const isCtrl = e.code === "ControlLeft" || e.code === "ControlRight";
      if (isCtrl) {
        if (!e.repeat) ctrlAlone = true;
        return;
      }
      ctrlAlone = false;
      const k = KEYS[e.code];
      if (!k || isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (tour.get().phase !== "explore") return;
      s.keys.add(k);
      if (k !== "run") dismissIntro();
      const onUi = (e.target as HTMLElement | null)?.closest?.("button, a, [role=button], .overlay, .story, .chapter, video");
      if (onUi) {
        s.keys.delete(k);
        return;
      }
      if (e.code.startsWith("Arrow") || e.code === "Space") e.preventDefault();
    };
    const keyUp = (e: KeyboardEvent) => {
      if ((e.code === "ControlLeft" || e.code === "ControlRight") && ctrlAlone && !isTyping(e) && tour.get().phase === "explore") s.crouch = !s.crouch;
      if (e.code === "ControlLeft" || e.code === "ControlRight") ctrlAlone = false;
      const k = KEYS[e.code];
      if (k) s.keys.delete(k);
    };
    const clear = () => s.keys.clear();
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointerdown", anyPointer, true);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", clear);
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerdown", anyPointer, true);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      document.removeEventListener("pointerlockchange", lockChange);
      if (document.pointerLockElement === el) document.exitPointerLock();
      // The listener is gone, so drop the crosshair here (it stayed over the start screen otherwise).
      el.closest(".tour")?.classList.remove("looking", "aiming");
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", clear);
    };
  }, [gl, touch, stop.id]);

  useEffect(() => () => orbit.current?.dispose(), []);

  useFrame((_, rawDt) => {
    const s = st.current;
    // While looking around, show when the crosshair is on a dot you can open.
    const aimed = s.locked ? aimedSpot() : null;
    if (aimed !== s.aimed) {
      s.aimed?.classList.remove("aimed");
      aimed?.classList.add("aimed");
      gl.domElement.closest(".tour")?.classList.toggle("aiming", !!aimed);
      s.aimed = aimed;
    }
    if (tour.get().phase !== "explore") {
      s.active = false;
      s.base = s.floor = null;
      s.hop = s.vy = 0;
      s.climbing = false;
      s.held = 0;
      s.boost = 1;
      showSpeed(s, 1);
      edge(false);
      if (orbit.current) orbit.current.enabled = false;
      return;
    }
    // During a replay of the past you watch from a fixed spot (the stop's replayView); you walk once it's over.
    const rv = tour.get().replay ? (live.replayView ?? stop.replayView) : undefined;
    if (rv) {
      const k = 1 - Math.exp(-Math.min(rawDt, 0.05) * 2.5);
      replayAt.set(rv.pos[0], ground ? ground(rv.pos[0], rv.pos[2]) + EYE : rv.pos[1], rv.pos[2]);
      camera.position.lerp(replayAt, k);
      replayM.lookAt(camera.position, replayLook.set(...(live.replayLook ?? rv.look)), camera.up);
      replayQ.setFromRotationMatrix(replayM);
      camera.quaternion.slerp(replayQ, k);
      s.active = false;
      s.base = s.floor = null;
      return;
    }
    if (!s.active) {
      euler.setFromQuaternion(camera.quaternion, "YXZ");
      s.yaw = euler.y;
      s.pitch = euler.x;
      s.vel.set(0, 0, 0);
      s.active = true;
      if (touch) {
        if (!orbit.current) {
          const c = new OrbitControls(camera, gl.domElement);
          c.enableDamping = true;
          c.enablePan = false;
          c.minDistance = stop.id === "ingenuity" ? 0.9 : 2.5;
          c.maxDistance = mode === "float" ? 40 : 22;
          if (mode === "walk") c.maxPolarAngle = Math.PI * 0.47;
          c.addEventListener("start", dismissIntro);
          orbit.current = c;
        }
        orbit.current.target.set(...center);
        orbit.current.enabled = true;
        orbit.current.update();
      }
    }
    if (touch) {
      orbit.current?.update();
      return;
    }

    const dt = Math.min(rawDt, 0.05);
    const k = s.keys;
    const ahead = (k.has("fwd") ? 1 : 0) - (k.has("back") ? 1 : 0);
    const side = (k.has("right") ? 1 : 0) - (k.has("left") ? 1 : 0);
    if (mode === "float") fwd.set(-Math.sin(s.yaw) * Math.cos(s.pitch), Math.sin(s.pitch), -Math.cos(s.yaw) * Math.cos(s.pitch));
    else fwd.set(-Math.sin(s.yaw), 0, -Math.cos(s.yaw));
    right.set(Math.cos(s.yaw), 0, -Math.sin(s.yaw));
    want.copy(fwd).multiplyScalar(ahead).addScaledVector(right, side);
    if (mode === "float") want.y += (k.has("up") ? 1 : 0) - (k.has("down") ? 1 : 0);
    const pushing = want.lengthSq() > 0;
    // On the ground, holding C crouches too (in space C means down).
    const low = mode === "walk" && (s.crouch || k.has("down"));
    if (mode !== "walk") s.upWas = false;
    // Shift runs, and the longer Shift and a direction are held, the faster you go (see below). It eases up and
    // back down, so it never jerks; letting go, or pushing into the invisible fence, resets it.
    const outward = s.walled && want.x * camera.position.x + want.z * camera.position.z + (mode === "float" ? want.y * camera.position.y : 0) > 0;
    const sprint = pushing && k.has("run") && !outward;
    s.held = sprint ? s.held + dt : 0;
    // On the ground the speed builds steadily (linear: ×2, then +3 each second held); floating in space it builds
    // exponentially (×2, doubling about every 1.6 s). Eased both ways so it never lurches.
    // Floating tops out where crossing the whole site still takes about two seconds, so the fence never cuts it short.
    const cap = mode === "float" ? Math.max(4, stop.bounds / 6) : 30;
    const goal = !sprint ? 1 : Math.min(cap, mode === "float" ? 2 * Math.pow(2, s.held / 1.6) : 2 + s.held * 3);
    s.boost += (goal - s.boost) * (1 - Math.exp(-dt * (goal > s.boost ? 2.2 : 3.5)));
    showSpeed(s, s.boost);
    if (pushing) want.normalize().multiplyScalar((mode === "float" ? 3 : 2.2) * s.boost * (low ? 0.45 : 1));
    // On the ground you stop almost at once. In space you ease up to speed and coast briefly after letting go.
    // Gentle drift: you coast for about a second after letting go, not several.
    const grip = mode === "float" ? (pushing ? 3 : 1.6) : 7;
    s.vel.lerp(want, 1 - Math.exp(-dt * grip));
    next.copy(camera.position).addScaledVector(s.vel, dt);

    if (mode === "float") {
      for (const c of stop.colliders) {
        const dx = next.x - c.pos[0], dy = next.y - c.pos[1], dz = next.z - c.pos[2];
        const d = Math.hypot(dx, dy, dz);
        if (d < c.r && d > 1e-4) next.set(c.pos[0] + (dx / d) * c.r, c.pos[1] + (dy / d) * c.r, c.pos[2] + (dz / d) * c.r);
      }
      if (next.length() > stop.bounds) next.setLength(stop.bounds);
      s.walled = next.length() > stop.bounds - 1;
      edge(s.walled);
    } else {
      const eye = low ? CROUCH_EYE : EYE;
      const absY = s.base == null ? camera.position.y : s.base + s.hop;
      const feet = absY - eye;
      const lad = stop.ladder ? onLadder(stop.ladder, camera.position, s.yaw, feet) : null;
      if (lad && (ahead !== 0 || s.climbing)) {
        // Climbing: W goes up, S goes down; you hug the ladder and step off onto the deck at the top.
        s.climbing = true;
        s.hop = 0;
        s.vy = 0;
        const t = Math.min(1, Math.max(0, lad.t + (ahead * 0.9 * dt) / lad.len));
        lad.at(t, next);
        const top = t >= 1 && ahead > 0, bottom = t <= 0 && ahead < 0;
        if (top) next.addScaledVector(lad.over, 0.9);
        if (top || bottom) s.climbing = false;
        s.floor = next.y;
        s.base = next.y + eye;
        next.y = s.base;
        s.vel.set(0, 0, 0);
      } else {
        s.climbing = false;
        // Bump into the machine itself (its real shape), sliding along whatever you hit.
        if (solids.size) collide(camera.position, next, feet, eye);
        else
          for (const c of stop.colliders) {
            const dx = next.x - c.pos[0], dz = next.z - c.pos[2], d = Math.hypot(dx, dz);
            if (d < c.r && d > 1e-4) {
              next.x = c.pos[0] + (dx / d) * c.r;
              next.z = c.pos[2] + (dz / d) * c.r;
            }
          }
        // An invisible fence keeps you near the site.
        const d = Math.hypot(next.x, next.z);
        if (d > stop.bounds) {
          next.x *= stop.bounds / d;
          next.z *= stop.bounds / d;
        }
        s.walled = d > stop.bounds - 1;
        edge(s.walled);
        // The floor is the ground, or the top of whatever part of the machine you're standing on (a footpad, the deck).
        let fl = ground ? ground(next.x, next.z) : 0;
        const top = solids.size ? surfaceBelow(next.x, feet + 0.6, next.z) : null;
        if (top != null && top > fl) fl = top;
        const prev = s.floor ?? fl;
        s.floor = fl;
        // Space hops, under this world's real gravity: about 2 m and 3 s in the air on the Moon, under 1 m on Mars.
        if (k.has("up") && !s.upWas && s.hop <= 0) s.vy = 2.6; // a hard astronaut hop is ~2.6 m/s
        s.upWas = k.has("up");
        if (s.base == null) s.base = fl + eye;
        if (s.hop > 0 || s.vy > 0 || prev - fl > 0.4) {
          // In the air (or walked off an edge): keep your height and let gravity bring you down.
          s.base = fl + eye;
          s.hop = Math.max(0, absY - s.base);
          s.vy -= (stop.body === "mars" ? 3.71 : 1.62) * dt;
          s.hop = Math.max(0, s.hop + s.vy * dt);
          if (s.hop === 0) s.vy = 0;
        } else s.base += (fl + eye - s.base) * (1 - Math.exp(-dt * 18));
        next.y = s.base + s.hop;
      }
    }
    camera.position.copy(next);
    euler.set(s.pitch, s.yaw, 0, "YXZ");
    camera.quaternion.setFromEuler(euler);
  });

  return null;
}
