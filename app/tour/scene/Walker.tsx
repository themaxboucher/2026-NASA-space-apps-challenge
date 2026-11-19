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
// --- The ladder. You stand 0.45 m out from the rungs and climb from its foot (the ground or a footpad) to level
// with the deck, then step over onto the deck. Both heights are read off the model the first time you come near,
// so the climb always starts on the real footpad and ends on the real deck.
const STEP = 0.95; // from standing on the top rung to standing on the deck
const lOut = new THREE.Vector3();
const pFoot = new THREE.Vector3();
const pTop = new THREE.Vector3();
const onRail = new THREE.Vector3();
type RailCache = { l: Ladder | null; foot: number | null; deck: number | null };
// Sets pFoot and pTop (where your feet are at the bottom, and on the top rung) and lOut; returns the climb's length.
function rail(l: Ladder, cache: RailCache, pos: THREE.Vector3, ground?: (x: number, z: number) => number) {
  lOut.set(...l.out).setY(0).normalize();
  pFoot.set(l.from[0] + lOut.x * 0.45, l.from[1], l.from[2] + lOut.z * 0.45);
  pTop.set(l.to[0] + lOut.x * 0.45, l.to[1], l.to[2] + lOut.z * 0.45);
  if (cache.l !== l) Object.assign(cache, { l, foot: null, deck: null });
  // Measured once the model is in and you're near (raycasts against the model aren't free).
  const near = Math.min(Math.hypot(pos.x - pFoot.x, pos.z - pFoot.z), Math.hypot(pos.x - pTop.x, pos.z - pTop.z)) < 4;
  if (cache.deck == null && solids.size && near) {
    cache.foot = Math.max(ground ? ground(pFoot.x, pFoot.z) : 0, surfaceBelow(pFoot.x, l.from[1] + 1, pFoot.z) ?? -Infinity);
    cache.deck = surfaceBelow(pTop.x - lOut.x * STEP, l.to[1] + 1.2, pTop.z - lOut.z * STEP);
  }
  pFoot.y = cache.foot ?? l.from[1];
  pTop.y = cache.deck ?? l.to[1];
  return pFoot.distanceTo(pTop);
}
// The point u along the climb: 0 at the foot, 1 on the top rung, then on over the edge onto the deck.
function along(u: number, len: number, target: THREE.Vector3) {
  if (u <= 1) return target.lerpVectors(pFoot, pTop, u);
  return target.copy(pTop).addScaledVector(lOut, -(u - 1) * len);
}
// How far a press can wander, in px, and still be a click rather than a drag to look around.
const CLICK_SLOP = 10;
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
  // The ladder, lifted to the ground at its foot (Eagle stands at y = 0; Falcon, beside the rover, stands on its own pad).
  const ladder = useMemo((): Ladder | undefined => {
    const l = stop.ladder;
    if (!l) return undefined;
    const y = ground ? ground(l.from[0], l.from[2]) : 0;
    return { from: [l.from[0], l.from[1] + y, l.from[2]], to: [l.to[0], l.to[1] + y, l.to[2]], out: l.out };
  }, [stop, ground]);
  const st = useRef({ yaw: 0, pitch: 0, vel: new THREE.Vector3(), keys: new Set<Key>(), drag: null as null | { x: number; y: number; moved: number }, active: false, crouch: false, locked: false, aimed: null as HTMLElement | null, hop: 0, vy: 0, upWas: false, base: null as number | null, floor: null as number | null, climbing: false, ladU: 0, rail: { l: null, foot: null, deck: null } as RailCache, lockedAt: 0, held: 0, boost: 1, shown: "", walled: false });
  const orbit = useRef<OrbitControls | null>(null);

  useEffect(() => {
    const el = gl.domElement;
    const s = st.current;
    const down = (e: PointerEvent) => {
      if (tour.get().phase !== "explore" || e.button !== 0) return;
      s.drag = { x: e.clientX, y: e.clientY, moved: 0 };
      // (Not while the mouse is locked to the view: Chrome throws on capture then.)
      if (!touch && !s.locked) el.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      // Mouse look: once the view has the mouse (after a click), moving the mouse turns your head, like a game.
      if (s.locked) {
        // Chrome sometimes reports one wild jump just as the mouse is taken or given back: skip it, or the view spins.
        if (performance.now() - s.lockedAt < 150 || Math.abs(e.movementX) > 300 || Math.abs(e.movementY) > 300) return;
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
    let retry = 0;
    const lock = (again: boolean) => {
      const req = el.requestPointerLock() as unknown as Promise<void> | undefined;
      // Chrome won't take the mouse again for about a second after Esc gave it back: then try once more.
      req?.catch?.(() => {
        if (!again) return;
        clearTimeout(retry);
        retry = window.setTimeout(() => {
          const t = tour.get();
          if (!s.locked && t.phase === "explore" && !t.openSpot) lock(false);
        }, 1100);
      });
    };
    const up = () => {
      const click = s.drag && s.drag.moved < CLICK_SLOP;
      s.drag = null;
      if (!click || touch) return;
      if (s.locked) {
        // Clicking with the crosshair on (or near) a glowing dot opens it, and gives the mouse back to read its story.
        const id = aimedSpot()?.dataset.spot;
        if (id) {
          document.exitPointerLock();
          openHotspot(stop.id, id);
        }
        return;
      }
      // A click on the scene takes the mouse for looking around (Esc gives it back). Any open card has already
      // closed (anyUp below).
      dismissIntro();
      lock(true);
    };
    const lockChange = () => {
      s.locked = document.pointerLockElement === el;
      s.lockedAt = performance.now();
      s.drag = null;
      // While looking around, no button keeps the keyboard: Space must jump, not press the last dot you clicked.
      if (s.locked && document.activeElement instanceof HTMLElement) document.activeElement.blur();
      el.closest(".tour")?.classList.toggle("looking", s.locked);
    };
    document.addEventListener("pointerlockchange", lockChange);
    // Tapping Ctrl on its own toggles crouching. A toggle, not a hold (Ctrl+W would close the tab), and never
    // when Ctrl is part of a shortcut like Ctrl+C or Ctrl+click.
    let ctrlAlone = false;
    let press: { x: number; y: number; out: boolean } | null = null;
    // The last button or link pressed with the mouse (it keeps the keyboard focus afterwards).
    let pressed: Element | null = null;
    const anyPointer = (e: PointerEvent) => {
      ctrlAlone = false;
      const t = e.target as Element | null;
      press = { x: e.clientX, y: e.clientY, out: !t?.closest?.(".story, .spot, [role=dialog]") };
      pressed = t?.closest?.("button, a") ?? null;
    };
    // A click anywhere but on the card, a dot or a dialog closes the open card (a drag to look around doesn't).
    const anyUp = (e: PointerEvent) => {
      if (press?.out && Math.hypot(e.clientX - press.x, e.clientY - press.y) < CLICK_SLOP && tour.get().openSpot) openHotspot(stop.id, null);
      press = null;
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
      const t = e.target as HTMLElement | null;
      const onUi = t?.closest?.("button, a, [role=button], .overlay, .story, .chapter, video");
      if (onUi && t) {
        // A dot or button you clicked keeps the focus; walking keys mustn't be swallowed by it, or press it again
        // (Space would). Someone who tabbed there keeps their keys for it.
        const clicked = t === pressed && !t.closest(".overlay, .chapter, [role=dialog]");
        if (!clicked) {
          s.keys.delete(k);
          return;
        }
        t.blur();
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
    window.addEventListener("pointerup", anyUp, true);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", clear);
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerdown", anyPointer, true);
      window.removeEventListener("pointerup", anyUp, true);
      clearTimeout(retry);
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
    // Which way you're heading on the ground (unit length), for the ladder.
    const wl = Math.hypot(want.x, want.z) || 1, wx = want.x / wl, wz = want.z / wl;
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
      const len = ladder ? rail(ladder, s.rail, camera.position, ground) : 0;
      // Heading into the ladder (toward the machine) climbs up, heading out climbs down: so W goes up facing the
      // rungs, and at the top you can walk forwards off the edge, or back down it with S, to climb down.
      const into = -(wx * lOut.x + wz * lOut.z);
      if (ladder && !s.climbing && pushing) {
        const dx = camera.position.x - pTop.x, dz = camera.position.z - pTop.z;
        const inward = -(dx * lOut.x + dz * lOut.z), aside = Math.abs(dx * lOut.z - dz * lOut.x);
        if (into > 0.5 && feet < pFoot.y + 0.5 && Math.hypot(camera.position.x - pFoot.x, camera.position.z - pFoot.z) < 0.7) {
          s.climbing = true;
          s.ladU = 0;
        } else if (into < -0.5 && Math.abs(feet - pTop.y) < 0.5 && aside < 0.6 && inward > -0.2 && inward < STEP + 0.3) {
          // From the deck: picked up wherever you are on the step over the edge, so nothing jumps.
          s.climbing = true;
          s.ladU = 1 + Math.min(STEP, Math.max(0, inward)) / len;
        }
      }
      if (ladder && s.climbing) {
        const end = 1 + STEP / len;
        s.ladU += (into * 0.9 * dt) / len;
        const off = (s.ladU >= end && into > 0) || (s.ladU <= 0 && into < 0);
        s.ladU = Math.min(end, Math.max(0, s.ladU));
        along(s.ladU, len, onRail);
        // Ease onto the rail sideways (you grab it from up to 0.7 m off), so the view never snaps.
        const pull = 1 - Math.exp(-dt * 14);
        next.set(camera.position.x + (onRail.x - camera.position.x) * pull, onRail.y + eye, camera.position.z + (onRail.z - camera.position.z) * pull);
        s.floor = onRail.y;
        s.base = next.y;
        s.hop = s.vy = 0;
        s.upWas = k.has("up");
        s.vel.set(0, 0, 0);
        // Off at the foot or onto the deck; walking takes over from exactly where the ladder left you.
        if (off) s.climbing = false;
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
