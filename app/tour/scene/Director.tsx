"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { reducedMotion } from "../lib/device";
import { aim, formatKm } from "../lib/geo";
import { plan, START_POSE, type Shot } from "../plans";
import { hud, live, tour, type Target } from "../state";
import { STOPS } from "../stops";
import { preloadModel } from "./useModel";

type Run = { shots: Shot[]; t: number; shot: number; to: Target };

function preloadFor(index: number) {
  const s = STOPS[index];
  if (s?.model.kind === "gltf") preloadModel(s.model.url);
  if (s?.model.kind === "lrv" || s?.extras?.some((x) => x.kind === "lm-descent")) preloadModel("/models/apollo-lm.gltf.json");
}

// Runs travel plans: switches scenes, flies the camera, fades, and drives the star streaks and distance counter.
export function Director() {
  const { camera } = useThree();
  const run = useRef<Run | null>(null);
  const seenRequest = useRef(0);
  const seenSkip = useRef(0);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    live.time += dt;
    const s = tour.get();

    // A new request (Start, Next, Back, a link to a stop) or a skip: plan it from where the camera is now.
    const fresh = s.request && s.request.id !== seenRequest.current ? s.request : null;
    const skipped = s.skipId !== seenSkip.current;
    seenSkip.current = s.skipId;
    if (fresh || (skipped && run.current)) {
      const to = fresh ? fresh.to : run.current!.to;
      const mode = fresh ? fresh.mode : "jump";
      if (fresh) seenRequest.current = fresh.id;
      const pose = { pos: camera.position.clone(), quat: camera.quaternion.clone() };
      const shots = plan(s, to, mode, pose, reducedMotion());
      run.current = { shots, t: 0, shot: -1, to };
      tour.set({ phase: "travel", stop: typeof to === "number" ? to : s.stop, openSpot: null, introOpen: false, cruise: null });
      if (typeof to === "number") preloadFor(to);
    }

    const r = run.current;
    if (r) {
      r.t += dt;
      let start = 0;
      let i = 0;
      while (i < r.shots.length && r.t >= start + r.shots[i].dur) start += r.shots[i++].dur;
      if (i >= r.shots.length) {
        // Arrived.
        const last = r.shots[r.shots.length - 1];
        last.cam(1, camera);
        run.current = null;
        live.streak = 0;
        const to = r.to;
        tour.set({
          phase: to === "start" ? "start" : to === "end" ? "end" : "explore",
          stop: typeof to === "number" ? to : to === "end" ? STOPS.length - 1 : -1,
          cruise: null,
          introOpen: typeof to === "number",
        });
        if (typeof to === "number") preloadFor(to + 1);
      } else {
        const shot = r.shots[i];
        const local = (r.t - start) / shot.dur;
        if (i !== r.shot) {
          r.shot = i;
          const patch: Partial<ReturnType<typeof tour.get>> = {
            cruise: shot.counter ? { label: shot.counter.label, dest: shot.counter.dest, from: shot.counter.from, to: shot.counter.to } : null,
          };
          if (tour.get().scene.key !== shot.scene.key) patch.scene = shot.scene;
          tour.set(patch);
        }
        shot.cam(local, camera);
        const into = r.t - start;
        const left = start + shot.dur - r.t;
        let f = 0;
        if (shot.fadeIn && into < shot.fadeIn) f = 1 - into / shot.fadeIn;
        if (shot.fadeOut && left < shot.fadeOut) f = Math.max(f, 1 - left / shot.fadeOut);
        live.fade = f;
        live.streak = shot.streak ? shot.streak(local) : 0;
        if (shot.counter) live.counter = shot.counter.at(local);
      }
    } else {
      live.fade = Math.max(0, live.fade - dt * 1.6);
      live.streak = 0;
      if (s.phase === "start" || s.phase === "end") aim(camera, START_POSE.pos, START_POSE.look);
    }

    if (hud.fade) hud.fade.style.opacity = live.fade.toFixed(3);
    if (hud.counter && tour.get().cruise) hud.counter.textContent = formatKm(live.counter);
  });

  return null;
}

// On tall portrait screens, widen the view so machines aren't cropped: keep at least ~50 degrees across.
export function AdaptiveFov() {
  const { camera, size } = useThree();
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const aspect = size.width / Math.max(1, size.height);
    const fov = aspect >= 1 ? 50 : Math.min(78, (2 * Math.atan(Math.tan((25 * Math.PI) / 180) / aspect) * 180) / Math.PI);
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
  }, [camera, size]);
  return null;
}
