"use client";
/* eslint-disable react-hooks/immutability -- the camera and marker colours are three.js objects updated in place every frame, as in app/tour/scene. */

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { smoother } from "../tour/lib/geo";
import { auR, cardDist, fly, flyTo, HELIOPAUSE_AU, labelDist, STATUS_COLOR, ui, viewFor, Y, type Body, type Key, type World } from "./model";

export const markerColors = { attr: null as THREE.BufferAttribute | null };

const KEYS: Record<string, Key> = {
  KeyW: "fwd", ArrowUp: "fwd", KeyS: "back", ArrowDown: "back", KeyA: "left", ArrowLeft: "left", KeyD: "right", ArrowRight: "right",
  Space: "up", KeyC: "down", ShiftLeft: "boost", ShiftRight: "boost",
};
// Shift: x2 as you press it, doubling every 1.6 s you hold it (like the tour floating in space), capped at x2048.
const BOOST_START = 2;
const BOOST_DOUBLE = 1.6;
const BOOST_CAP = 2048;
const MAX_LABELS = 6;

const v = new THREE.Vector3(), v2 = new THREE.Vector3(), fwd = new THREE.Vector3(), right = new THREE.Vector3(), want = new THREE.Vector3();
const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), euler = new THREE.Euler(0, 0, 0, "YXZ");
const seg = new THREE.Vector3(), toC = new THREE.Vector3(), closest = new THREE.Vector3();
const clampPitch = (p: number) => Math.max(-1.5, Math.min(1.5, p));

// Does the line from the camera to p pass through a world (other than `skip`)?
function hidden(cam: THREE.Vector3, p: THREE.Vector3, bodies: Body[], skip?: Body) {
  const len = seg.subVectors(p, cam).length();
  if (len < 1e-6) return false;
  seg.divideScalar(len);
  for (const b of bodies) {
    if (b === skip) continue;
    const t = Math.max(0, Math.min(len, toC.subVectors(b.pos, cam).dot(seg)));
    if (closest.copy(cam).addScaledVector(seg, t).distanceTo(b.pos) < b.r * 0.999) return true;
  }
  return false;
}

type Trip = { key: string; t: number; dur: number; look: THREE.Vector3; u0: THREE.Vector3; u1: THREE.Vector3; d0: number; d1: number; q0: THREE.Quaternion };
// Orbit view: circling one world on a sphere (azimuth, elevation, distance), always looking at its centre.
type Orbit = { b: Body; az: number; el: number; dist: number; goal: number; min: number; max: number; start: number };
// Field-of-view zoom (magnification against the normal 50 deg view): from ~75 deg wide to a ~1 deg telescope.
const ZOOM_MIN = Math.tan((25 * Math.PI) / 180) / Math.tan((37.5 * Math.PI) / 180);
const ZOOM_MAX = Math.tan((25 * Math.PI) / 180) / Math.tan((0.5 * Math.PI) / 180);

export function Flight({ world, start, still }: { world: World; start: string; still: boolean }) {
  const { camera, gl, size } = useThree();
  const st = useRef({
    yaw: 0, pitch: 0, vel: new THREE.Vector3(), boost: 1, hold: 0, trip: null as Trip | null, goN: 0, started: false, frame: 0, introAt: 0,
    drag: null as null | { x: number; y: number; moved: number }, speedTxt: "", near: ["", ""], cursor: false,
    orbit: null as Orbit | null,
    focus: null as string | null, // the site an auto-flight just brought you to: its card wins over a closer neighbour's
    pinned: null as string | null, // in orbit view, the machine you last pointed at (its card stays up)
    zoom: 1, zoomGoal: 1, zoomTxt: "",
  });
  const colors = useMemo(() => world.sites.map((s) => new THREE.Color(STATUS_COLOR[s.status])), [world]);
  const bodyTargets = useMemo(() => world.bodies.map((b) => world.targets.get(`b:${b.key}`)!), [world]);

  // Keep yaw and pitch in step with wherever the camera ended up looking (after an auto-flight).
  const sync = () => {
    euler.setFromQuaternion(camera.quaternion, "YXZ");
    st.current.yaw = euler.y;
    st.current.pitch = clampPitch(euler.x);
  };
  const enterOrbit = (b: Body) => {
    const off = camera.position.clone().sub(b.pos);
    const dist = off.length();
    const frame = b.frame ?? b.r;
    st.current.orbit = { b, az: Math.atan2(off.x, off.z), el: Math.asin(off.y / dist), dist, goal: dist, start: dist, min: b.r * 1.3, max: Math.max(b.r * 14, frame * 6) };
    st.current.pinned = null;
    st.current.zoomGoal = 1;
    if (document.pointerLockElement) document.exitPointerLock();
    ui.set({ orbit: b.key });
  };
  const exitOrbit = () => {
    st.current.orbit = null;
    st.current.pinned = null;
    sync();
    if (ui.get().orbit) ui.set({ orbit: null });
  };

  useEffect(() => {
    const el = gl.domElement;
    const s = st.current;
    const down = (e: PointerEvent) => {
      if (e.button !== 0) return;
      s.drag = { x: e.clientX, y: e.clientY, moved: 0 };
      el.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      fly.pointer.x = e.clientX - r.left;
      fly.pointer.y = e.clientY - r.top;
      fly.pointer.on = true;
      // Mouse look: once the view has the mouse (after a click), moving it turns your head, like the tour.
      if (document.pointerLockElement === el) {
        if (s.trip) return;
        // Steadier aim when zoomed in: turning slows with the magnification.
        s.yaw -= (e.movementX * 0.0022) / s.zoom;
        s.pitch = clampPitch(s.pitch - (e.movementY * 0.0022) / s.zoom);
        return;
      }
      const d = s.drag;
      if (!d) return;
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      d.x = e.clientX;
      d.y = e.clientY;
      d.moved += Math.abs(dx) + Math.abs(dy);
      if (s.trip) return;
      // In orbit view, dragging turns the world under you ("grab the globe").
      if (s.orbit) {
        s.orbit.az -= dx * 0.005;
        s.orbit.el = Math.max(-1.45, Math.min(1.45, s.orbit.el + dy * 0.005));
        return;
      }
      // Drag to look: "grab the sky", like the tour and Street View.
      s.yaw += (dx * 0.004) / s.zoom;
      s.pitch = clampPitch(s.pitch + (dy * 0.004) / s.zoom);
    };
    const up = () => {
      const d = s.drag;
      s.drag = null;
      if (!d || d.moved > 6) return;
      // A click on a marker flies there; anywhere else takes the mouse for looking around (Esc gives it back).
      if (fly.hovered === "debris") ui.set({ debris: true });
      else if (fly.hovered) flyTo(fly.hovered);
      else if (!s.orbit && document.pointerLockElement !== el) (el.requestPointerLock() as unknown as Promise<void> | undefined)?.catch?.(() => {});
    };
    const leave = () => (fly.pointer.on = false);
    const lock = () => ui.set({ locked: document.pointerLockElement === el });
    const typing = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      return !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    };
    // Wheel, +/- and the on-screen buttons: in orbit view they move you closer or farther; in flight they zoom the lens.
    const zoom = (f: number) => {
      const o = s.orbit;
      if (o) o.goal = Math.max(o.min, Math.min(o.max, o.goal * f));
      else s.zoomGoal = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, s.zoomGoal / f));
    };
    fly.zoomBy = zoom;
    const resetZoom = () => (s.zoomGoal = 1);
    const keyDown = (e: KeyboardEvent) => {
      if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (s.orbit && e.code === "Escape") return exitOrbit();
      if (/^(Equal|NumpadAdd|Minus|NumpadSubtract)$/.test(e.code)) {
        e.preventDefault();
        return zoom(/Equal|Add/.test(e.code) ? 0.8 : 1.25);
      }
      if (e.code === "KeyZ") return resetZoom();
      const k = KEYS[e.code];
      if (!k) return;
      const arrowish = e.code === "Space" || e.code.startsWith("Arrow");
      // Space and arrows on a focused button or link still press it.
      if (arrowish && (e.target as HTMLElement | null)?.closest?.("button, a, summary")) return;
      if (arrowish) e.preventDefault();
      fly.keys.add(k);
      // Steering yourself takes over from an auto-flight or the orbit view, right where it is.
      if (k !== "boost" && s.trip) {
        s.trip = null;
        sync();
      }
      if (k !== "boost" && s.orbit) exitOrbit();
    };
    const keyUp = (e: KeyboardEvent) => {
      const k = KEYS[e.code];
      if (k) fly.keys.delete(k);
    };
    const clear = () => fly.keys.clear();
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      zoom(Math.exp(Math.max(-200, Math.min(200, e.deltaY)) * 0.0015));
    };
    el.addEventListener("wheel", wheel, { passive: false });
    el.addEventListener("dblclick", resetZoom);
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("pointerleave", leave);
    document.addEventListener("pointerlockchange", lock);
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", clear);
    if (process.env.NODE_ENV !== "production") Object.assign(window, { __solar: { camera, world, fly, ui } });
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("pointerleave", leave);
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("dblclick", resetZoom);
      document.removeEventListener("pointerlockchange", lock);
      if (document.pointerLockElement === el) document.exitPointerLock();
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", clear);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync only reads the camera, which never changes
  }, [gl, camera, world]);

  useFrame((state, raw) => {
    const s = st.current;
    const dt = Math.min(raw, 0.05);
    const cam = camera as THREE.PerspectiveCamera;
    const pos = cam.position;

    // An auto-flight: the distance to the target shrinks geometrically while the direction swings round to a
    // sunlit view, so a trip from Neptune to a lunar crater is one smooth glide, fast far out and gentle at the end.
    const begin = (key: string, instant: boolean) => {
      const t = world.targets.get(key);
      if (!t) return;
      const view = viewFor(t);
      const off0 = pos.clone().sub(view.look);
      const d0 = Math.max(off0.length(), 1e-4);
      const off1 = view.pos.clone().sub(view.look);
      const d1 = off1.length();
      if (s.orbit) {
        s.orbit = null;
        if (ui.get().orbit) ui.set({ orbit: null });
      }
      s.trip = { key, t: 0, dur: instant ? 0 : Math.min(9, Math.max(2.6, 2.2 + 0.7 * Math.abs(Math.log(d0 / d1)))), look: view.look, u0: off0.divideScalar(d0), u1: off1.divideScalar(d1), d0, d1, q0: cam.quaternion.clone() };
      s.vel.set(0, 0, 0);
    };
    if (!s.started) {
      s.started = true;
      // Arriving from the explore page's map (/solar?intro=map): start straight overhead, framed like that map
      // (same log-scale layout, the heliopause filling most of the view), then swoop down into 3D.
      if (typeof location !== "undefined" && new URLSearchParams(location.search).get("intro") === "map") {
        const half = Math.tan((cam.fov * Math.PI) / 360) * Math.min(1, cam.aspect);
        pos.set(0, auR(HELIOPAUSE_AU) / (0.86 * half), 0);
        m4.lookAt(pos, v.set(0, 0, 0), new THREE.Vector3(0, 0, -1));
        cam.quaternion.setFromRotationMatrix(m4);
        s.introAt = state.clock.elapsedTime + 1.9; // hold on the map-like view while the page fades up
      } else begin(start, true);
    }
    if (s.introAt && state.clock.elapsedTime >= s.introAt) {
      s.introAt = 0;
      begin(start, still);
    }
    const go = ui.get().go;
    if (go && go.n !== s.goN) {
      s.goN = go.n;
      begin(go.key, still);
    }

    // Distance to the nearest surface sets your cruising speed: slow over a landing site, fast in empty space.
    let dSurf = Infinity;
    let nearB = world.bodies[0];
    for (const b of world.bodies) {
      const d = pos.distanceTo(b.pos) - b.r;
      if (d < dSurf) {
        dSurf = d;
        nearB = b;
      }
    }

    // "Back to the solar system" (in the overlay) clears ui.orbit.
    if (s.orbit && ui.get().orbit !== s.orbit.b.key) exitOrbit();
    const keys = fly.keys;
    const trip = s.trip;
    const o = s.orbit;
    if (o) {
      o.dist += (o.goal - o.dist) * (1 - Math.exp(-dt * 8));
      pos.set(Math.cos(o.el) * Math.sin(o.az), Math.sin(o.el), Math.cos(o.el) * Math.cos(o.az)).multiplyScalar(o.dist).add(o.b.pos);
      m4.lookAt(pos, o.b.pos, Y);
      cam.quaternion.setFromRotationMatrix(m4);
      s.boost = 1;
    } else if (trip) {
      trip.t = trip.dur ? Math.min(1, trip.t + dt / trip.dur) : 1;
      const k = smoother(trip.t);
      qa.setFromUnitVectors(trip.u0, trip.u1);
      qb.identity().slerp(qa, k);
      pos.copy(trip.look).addScaledVector(v.copy(trip.u0).applyQuaternion(qb), trip.d0 * Math.pow(trip.d1 / trip.d0, k));
      m4.lookAt(pos, trip.look, Y);
      q.setFromRotationMatrix(m4);
      cam.quaternion.copy(trip.q0).slerp(q, smoother(Math.min(1, trip.t * 1.7)));
      if (trip.t >= 1) {
        s.trip = null;
        sync();
        // Arriving at a world opens its orbit view; arriving at a machine shows that machine's card.
        const t = world.targets.get(trip.key);
        if (t?.kind === "body") enterOrbit(t.host!);
        else s.focus = trip.key;
      }
      s.boost = 1;
    } else {
      const ahead = (keys.has("fwd") ? 1 : 0) - (keys.has("back") ? 1 : 0);
      const side = (keys.has("right") ? 1 : 0) - (keys.has("left") ? 1 : 0);
      const lift = (keys.has("up") ? 1 : 0) - (keys.has("down") ? 1 : 0);
      fwd.set(-Math.sin(s.yaw) * Math.cos(s.pitch), Math.sin(s.pitch), -Math.cos(s.yaw) * Math.cos(s.pitch));
      right.set(Math.cos(s.yaw), 0, -Math.sin(s.yaw));
      want.copy(fwd).multiplyScalar(ahead).addScaledVector(right, side).addScaledVector(Y, lift);
      const pushing = want.lengthSq() > 0;
      if (pushing) want.normalize();
      // Glide: velocity follows the keys with a gentle ease (about half a second), so starts, stops and turns
      // while moving are all smooth, and you coast for a moment after letting go.
      s.vel.lerp(want, 1 - Math.exp(-dt * (pushing ? 2.2 : 1.5)));
      // Shift: faster and faster while held. Let go and it eases back down (in log space, so even from a high
      // multiple it settles in about a second without a jolt).
      if (pushing && keys.has("boost")) s.hold += dt;
      else s.hold = 0;
      const goal = s.hold > 0 ? Math.min(BOOST_CAP, BOOST_START * Math.pow(2, s.hold / BOOST_DOUBLE)) : 1;
      const lb = Math.log(s.boost), lg = Math.log(goal);
      s.boost = Math.exp(lg + (lb - lg) * Math.exp(-dt * (lg > lb ? 3 : 4)));
      const base = Math.max(0.02, Math.min(2.5, dSurf * 0.5));
      pos.addScaledVector(s.vel, base * s.boost * dt);
      euler.set(s.pitch, s.yaw, 0, "YXZ");
      cam.quaternion.setFromEuler(euler);
    }
    // Never inside a world.
    for (const b of world.bodies) {
      const min = b.r * 1.003 + 0.004;
      if (pos.distanceTo(b.pos) < min) pos.sub(b.pos).setLength(min).add(b.pos);
    }
    // The near plane follows how close the nearest surface is, so a crater and Neptune both stay sharp.
    const near = Math.max(0.001, Math.min(2, dSurf * 0.3));
    // On tall portrait screens, widen the view so it still spans ~50 degrees across (like the tour).
    const aspect = size.width / Math.max(1, size.height);
    const baseFov = aspect >= 1 ? 50 : Math.min(78, (2 * Math.atan(Math.tan((25 * Math.PI) / 180) / aspect) * 180) / Math.PI);
    // Lens zoom eases in log space, so x1 to x50 feels as even as x1 to x2.
    s.zoom = Math.exp(Math.log(s.zoomGoal) + (Math.log(s.zoom) - Math.log(s.zoomGoal)) * Math.exp(-dt * 8));
    if (Math.abs(s.zoom - s.zoomGoal) < 1e-4 * s.zoomGoal) s.zoom = s.zoomGoal;
    const fov = (2 * Math.atan(Math.tan((baseFov * Math.PI) / 360) / s.zoom) * 180) / Math.PI;
    if (Math.abs(cam.near - near) > near * 0.05 || cam.far !== 20000 || Math.abs(cam.fov - fov) > 0.01) {
      cam.near = near;
      cam.far = 20000;
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    cam.updateMatrixWorld();

    const txt = s.boost < 1.05 ? "×1" : `×${s.boost < 10 ? s.boost.toFixed(1) : Math.round(s.boost).toLocaleString("en-US")}`;
    // In orbit view the readout is how much closer than the arrival view you are; in flight, the lens magnification.
    const zv = o ? o.start / o.dist : s.zoom;
    const ztxt = `×${zv < 9.95 ? zv.toFixed(1).replace(/\.0$/, "") : Math.round(zv)}`;
    if (ztxt !== s.zoomTxt && fly.hud.zoom) fly.hud.zoom.textContent = s.zoomTxt = ztxt;
    if (txt !== s.speedTxt && fly.hud.speed) {
      s.speedTxt = txt;
      fly.hud.speed.textContent = txt;
      fly.hud.speed.dataset.fast = s.boost > 1.05 ? "1" : "";
    }

    // Markers, hover and labels.
    const W = size.width, H = size.height;
    const locked = ui.get().locked;
    const px = locked ? W / 2 : fly.pointer.x, py = locked ? H / 2 : fly.pointer.y;
    const aiming = locked || fly.pointer.on;
    let hovered: string | null = null;
    let hoverD = 22;
    const pulse = still ? 1 : 0.8 + 0.25 * Math.sin(state.clock.elapsedTime * 2.6);
    const shown: [d: number, key: string, x: number, y: number][] = [];
    const scr = new Map<string, [number, number, boolean, number]>();
    const tanHalfFov = Math.tan((cam.fov * Math.PI) / 360);
    world.sites.forEach((site) => {
      v.copy(site.pos).project(cam);
      const sx = ((v.x + 1) / 2) * W, sy = ((1 - v.y) / 2) * H;
      const dist = pos.distanceTo(site.pos);
      // Surface sites show only on the side facing you, fading out towards the edge of the disc so no glow pokes
      // out past the limb, and only once the world is big enough on screen (zoom counts); before that its label
      // counts its machines.
      let fade = 1;
      if (site.normal) {
        const facing = v2.subVectors(pos, site.pos).normalize().dot(site.normal);
        const discPx = (site.host!.r / pos.distanceTo(site.host!.pos) / tanHalfFov) * (H / 2);
        fade = Math.min(1, Math.max(0, (facing - 0.3) / 0.25)) * Math.min(1, Math.max(0, (discPx - 26) / 14));
      }
      const vis = v.z < 1 && fade > 0.02 && !hidden(pos, site.pos, world.bodies);
      scr.set(site.key, [sx, sy, vis, fade]);
      if (vis && aiming) {
        const dd = Math.hypot(sx - px, sy - py);
        if (dd < hoverD) {
          hoverD = dd;
          hovered = site.key;
        }
      }
      // Labels: the near ones; in orbit view, every machine at this world; zoomed in, whatever the lens brings close.
      if (vis && (dist / s.zoom < labelDist(site) || (o && site.host === o.b))) shown.push([dist, site.key, sx, sy]);
    });
    const attr = markerColors.attr;
    if (attr) {
      world.sites.forEach((site, i) => {
        const [, , vis, fade] = scr.get(site.key)!;
        const k = !vis ? 0 : (site.key === hovered ? 1.9 : site.status === "alive" ? pulse : 0.85) * fade;
        attr.setXYZ(i, colors[i].r * k, colors[i].g * k, colors[i].b * k);
      });
      attr.needsUpdate = true;
    }
    // Pointing at a world (not one filling the view, not the one you're circling) picks it.
    if (!hovered && aiming) {
      const tanHalf = Math.tan((cam.fov * Math.PI) / 360);
      let best = Infinity;
      for (const b of world.bodies) {
        if (o?.b === b) continue;
        const dist = pos.distanceTo(b.pos);
        v.copy(b.pos).project(cam);
        const sr = (b.r / dist / tanHalf) * (H / 2);
        if (v.z >= 1 || sr > H * 0.35) continue;
        const dd = Math.hypot(((v.x + 1) / 2) * W - px, ((1 - v.y) / 2) * H - py);
        if (dd < Math.max(sr, 10) && dist < best && !hidden(pos, b.pos, world.bodies, b)) {
          best = dist;
          hovered = `b:${b.key}`;
        }
      }
    }
    // Pointing at the cloud of satellites and junk around Earth (inside the geostationary ring) opens its card.
    const earth = world.bodies.find((b) => b.key === "earth")!;
    const toEarth = pos.distanceTo(earth.pos);
    if (!hovered && aiming && toEarth < 45 && toEarth > 1.6) {
      v.copy(earth.pos).project(cam);
      const ex = ((v.x + 1) / 2) * W, ey = ((1 - v.y) / 2) * H;
      v.copy(earth.pos).addScaledVector(right.set(1, 0, 0).applyQuaternion(cam.quaternion), 6.7).project(cam);
      const ring = Math.hypot(((v.x + 1) / 2) * W - ex, ((1 - v.y) / 2) * H - ey);
      if (v.z < 1 && Math.hypot(px - ex, py - ey) < ring) hovered = "debris";
    }
    fly.hovered = hovered;
    // In orbit view, pointing at one of this world's machines brings up its card (and it stays up).
    const hot = hovered ? world.targets.get(hovered) : undefined;
    if (o && hot?.kind === "site" && hot.host === o.b) s.pinned = hot.key;
    if (!!hovered !== s.cursor) {
      s.cursor = !!hovered;
      gl.domElement.style.cursor = hovered && !locked ? "pointer" : "";
    }
    shown.sort((a, b) => a[0] - b[0]);
    const on = new Set<string>();
    if (o) {
      // ponytail: greedy label placement (nearest keeps its label, like the atlas map); hidden ones show on hover.
      const boxes: [number, number, number, number][] = [];
      for (const [, key, sx, sy] of shown) {
        const bx: [number, number, number, number] = [sx, sx + world.targets.get(key)!.name.length * 7.4 + 34, sy - 12, sy + 12];
        if (boxes.some((b) => bx[0] < b[1] && bx[1] > b[0] && bx[2] < b[3] && bx[3] > b[2])) continue;
        boxes.push(bx);
        on.add(key);
      }
    } else shown.slice(0, MAX_LABELS).forEach((x) => on.add(x[1]));
    if (hovered) on.add(hovered);
    for (const site of world.sites) {
      const el = fly.labels.get(site.key);
      if (!el) continue;
      const [sx, sy] = scr.get(site.key)!;
      const show = on.has(site.key);
      if (show) el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px)`;
      if (el.classList.contains("on") !== show) el.classList.toggle("on", show);
      el.classList.toggle("hot", site.key === hovered);
    }
    // World labels sit just above each disc; tiny worlds only once you're near them.
    const camUp = v2.set(0, 1, 0).applyQuaternion(cam.quaternion);
    for (const t of bodyTargets) {
      const el = fly.labels.get(t.key);
      if (!el) continue;
      const b = t.host!;
      const dist = pos.distanceTo(b.pos);
      v.copy(b.pos).addScaledVector(camUp, b.r * 1.15).project(cam);
      // The Moon's label only near Earth, or it sits on top of Earth's from across the system.
      const show = v.z < 1 && dist > b.r * 2.6 && (!b.small || dist < 60) && (b.key !== "moon" || dist < 90) && !hidden(pos, b.pos, world.bodies, b);
      if (show) el.style.transform = `translate(${(((v.x + 1) / 2) * W).toFixed(1)}px, ${(((1 - v.y) / 2) * H).toFixed(1)}px)`;
      if (el.classList.contains("on") !== show) el.classList.toggle("on", show);
    }

    s.frame++;
    // The nearest world and machine, and the card for the site you're next to: a few times a second is plenty.
    if (s.frame % 6 === 0) {
      let ns = world.sites[0];
      let nd = Infinity;
      for (const site of world.sites) {
        const d = pos.distanceTo(site.pos);
        if (d < nd) {
          nd = d;
          ns = site;
        }
      }
      const focus = s.focus ? world.targets.get(s.focus) : undefined;
      if (focus && pos.distanceTo(focus.pos) > cardDist(focus) * 1.5) s.focus = null;
      const card = s.trip ? null : o ? s.pinned : (s.focus ?? (nd < cardDist(ns) ? ns.key : null));
      const nearEarth = !s.trip && toEarth < 9; // inside the geostationary ring, about
      const u = ui.get();
      const debris = u.debris && toEarth < 45;
      if (u.card !== card || u.nearEarth !== nearEarth || u.debris !== debris) ui.set({ card, nearEarth, debris });
      // Out between the planets, the "nearest" world can be hundreds of units away: say so instead.
      // Measured in the ecliptic plane, so the high overhead start (?intro=map) doesn't count as interstellar.
      const where = dSurf < 60 ? nearB.name : Math.hypot(pos.x, pos.z) > auR(HELIOPAUSE_AU) ? "None: you're past the heliopause, in interstellar space" : "None close by";
      if (s.near[0] !== where && fly.hud.nearBody) fly.hud.nearBody.textContent = s.near[0] = where;
      const machine = nd < 60 ? ns.name : "None close by";
      if (s.near[1] !== machine && fly.hud.nearMachine) fly.hud.nearMachine.textContent = s.near[1] = machine;
    }
    if (s.frame % 3 === 0) drawMinimap(world, pos, cam.quaternion);
  });

  return null;
}

// Top-down map of the whole system (same log scale as the scene), with you as an arrow.
function drawMinimap(world: World, pos: THREE.Vector3, quat: THREE.Quaternion) {
  const c = fly.hud.minimap;
  const ctx = c?.getContext("2d");
  if (!c || !ctx) return;
  const w = c.width, half = w / 2;
  const k = (half - 6) / (auR(HELIOPAUSE_AU) * 1.08);
  ctx.clearRect(0, 0, w, w);
  ctx.save();
  ctx.translate(half, half);
  const dpr = w / 180;
  ctx.lineWidth = dpr;
  ctx.strokeStyle = "rgba(94,166,214,0.45)";
  ctx.setLineDash([3 * dpr, 3 * dpr]);
  ctx.beginPath();
  ctx.arc(0, 0, auR(HELIOPAUSE_AU) * k, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = "rgba(193,169,149,0.2)";
  for (const b of world.bodies) {
    if (b.key === "sun" || b.key === "moon" || b.small) continue;
    ctx.beginPath();
    ctx.arc(0, 0, Math.hypot(b.pos.x, b.pos.z) * k, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (const site of world.sites) {
    if (site.host) continue;
    ctx.fillStyle = STATUS_COLOR[site.status];
    ctx.beginPath();
    ctx.arc(site.pos.x * k, site.pos.z * k, 1.6 * dpr, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const b of world.bodies) {
    if (b.key === "moon" || b.small) continue;
    ctx.fillStyle = b.key === "sun" ? "#ffcf6b" : "#d8cbbd";
    ctx.beginPath();
    ctx.arc(b.pos.x * k, b.pos.z * k, (b.key === "sun" ? 3.2 : 1.9) * dpr, 0, Math.PI * 2);
    ctx.fill();
  }
  // You: an arrow pointing where you look, pinned to the rim when you're beyond the map.
  let x = pos.x * k, y = pos.z * k;
  const r = Math.hypot(x, y), lim = half - 7 * dpr;
  if (r > lim) {
    x *= lim / r;
    y *= lim / r;
  }
  v.set(0, 0, -1).applyQuaternion(quat);
  const a = Math.atan2(v.z, v.x);
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.fillStyle = "#efe5da";
  ctx.strokeStyle = "#090403";
  ctx.lineWidth = 1.5 * dpr;
  ctx.beginPath();
  ctx.moveTo(7 * dpr, 0);
  ctx.lineTo(-5 * dpr, 4.5 * dpr);
  ctx.lineTo(-2.5 * dpr, 0);
  ctx.lineTo(-5 * dpr, -4.5 * dpr);
  ctx.closePath();
  ctx.stroke();
  ctx.fill();
  ctx.restore();
}
