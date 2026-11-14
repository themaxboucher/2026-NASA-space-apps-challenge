"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { coarsePointer } from "../lib/device";
import { dismissIntro, openHotspot, tour } from "../state";
import type { Stop } from "../stops";

export const EYE = 1.7;

type Key = "fwd" | "back" | "left" | "right" | "run";
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

// Walk on the ground (or float in space) with W A S D / arrow keys, and drag to look around.
// On touch screens it falls back to circling the machine.
export function Walker({ stop, mode, ground, center }: { stop: Stop; mode: "walk" | "float"; ground?: (x: number, z: number) => number; center: [number, number, number] }) {
  const { camera, gl } = useThree();
  const touch = useMemo(() => coarsePointer(), []);
  const st = useRef({ yaw: 0, pitch: 0, vel: new THREE.Vector3(), keys: new Set<Key>(), drag: null as null | { x: number; y: number; moved: number }, active: false });
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
      // A click on the scene (not a drag) closes the open hotspot card.
      if (s.drag && s.drag.moved < 6) openHotspot(stop.id, null);
      s.drag = null;
    };
    const keyDown = (e: KeyboardEvent) => {
      const k = KEYS[e.code];
      if (!k || isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (tour.get().phase !== "explore") return;
      s.keys.add(k);
      if (k !== "run") dismissIntro();
      if (e.code.startsWith("Arrow")) e.preventDefault();
    };
    const keyUp = (e: KeyboardEvent) => {
      const k = KEYS[e.code];
      if (k) s.keys.delete(k);
    };
    const clear = () => s.keys.clear();
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", clear);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", clear);
    };
  }, [gl, touch, stop.id]);

  useEffect(() => () => orbit.current?.dispose(), []);

  useFrame((_, rawDt) => {
    const s = st.current;
    if (tour.get().phase !== "explore") {
      s.active = false;
      if (orbit.current) orbit.current.enabled = false;
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
    if (want.lengthSq() > 0) want.normalize().multiplyScalar((mode === "float" ? 3 : 2.2) * (k.has("run") ? 2.4 : 1));
    s.vel.lerp(want, 1 - Math.exp(-dt * 7));
    next.copy(camera.position).addScaledVector(s.vel, dt);

    for (const c of stop.colliders) {
      const dx = next.x - c.pos[0];
      const dz = next.z - c.pos[2];
      if (mode === "float") {
        const dy = next.y - c.pos[1];
        const d = Math.hypot(dx, dy, dz);
        if (d < c.r && d > 1e-4) next.set(c.pos[0] + (dx / d) * c.r, c.pos[1] + (dy / d) * c.r, c.pos[2] + (dz / d) * c.r);
      } else {
        const d = Math.hypot(dx, dz);
        if (d < c.r && d > 1e-4) {
          next.x = c.pos[0] + (dx / d) * c.r;
          next.z = c.pos[2] + (dz / d) * c.r;
        }
      }
    }
    if (mode === "float") {
      if (next.length() > stop.bounds) next.setLength(stop.bounds);
    } else {
      const d = Math.hypot(next.x, next.z);
      if (d > stop.bounds) {
        next.x *= stop.bounds / d;
        next.z *= stop.bounds / d;
      }
      const floor = (ground ? ground(next.x, next.z) : 0) + EYE;
      next.y += (floor - next.y) * (1 - Math.exp(-dt * 18));
    }
    camera.position.copy(next);
    euler.set(s.pitch, s.yaw, 0, "YXZ");
    camera.quaternion.setFromEuler(euler);
  });

  return null;
}
