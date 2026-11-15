"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { reducedMotion } from "../lib/device";
import { aim, formatKm } from "../lib/geo";
import { plan, START_POSE, type Shot } from "../plans";
import { hud, live, tour, type SceneDesc, type Target, type TourState } from "../state";
import { STOPS } from "../stops";
import { modelSettled, preloadModel } from "./useModel";

type Run = { shots: Shot[]; t: number; shot: number; to: Target; skip: boolean };

function modelsFor(index: number) {
  const s = STOPS[index];
  const urls: string[] = [];
  if (s?.model.kind === "gltf") urls.push(s.model.url);
  if (s?.model.kind === "lrv" || s?.extras?.some((x) => x.kind === "lm-descent")) urls.push("/models/apollo-lm.gltf.json");
  return urls;
}
const preloadFor = (index: number) => modelsFor(index).forEach(preloadModel);
// A stop's scene is only cut to once its machine has loaded, so the machine is on screen from the first frame.
const ready = (scene: SceneDesc) => scene.kind === "travel" || modelsFor(scene.stop).every(modelSettled);

// The colour the screen dips through at a cut: black in space, the planet's haze at a surface.
let tint = "#000";
let shownTint = "";

// Scene changes during a journey dissolve instead of dipping: the last frame stays on top as a picture and
// fades out over the new scene, so the trip reads as one continuous shot.
const XFADE = 1.1;
let xfade = -1; // seconds into the current dissolve, or -1
function snapshot(canvas: HTMLCanvasElement) {
  if (!hud.fade) return;
  try {
    hud.fade.style.backgroundImage = `url(${canvas.toDataURL("image/jpeg", 0.85)})`;
    xfade = 0;
  } catch {
    xfade = -1; // canvas not readable: fall back to a plain cut
  }
}

// Runs travel plans: switches scenes, flies the camera, fades, and drives the star streaks and distance counter.
export function Director() {
  const { camera, gl } = useThree();
  const run = useRef<Run | null>(null);
  const seenRequest = useRef(0);
  const seenSkip = useRef(0);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    live.time += dt;
    const s = tour.get();

    // A new request (Start, Next, Back, a link to a stop): plan it from where the camera is now.
    const fresh = s.request && s.request.id !== seenRequest.current ? s.request : null;
    if (fresh) {
      seenRequest.current = fresh.id;
      const pose = { pos: camera.position.clone(), quat: camera.quaternion.clone() };
      run.current = { shots: plan(s, fresh.to, fresh.mode, pose, reducedMotion()), t: 0, shot: -1, to: fresh.to, skip: false };
      tour.set({ phase: "travel", stop: typeof fresh.to === "number" ? fresh.to : s.stop, openSpot: null, introOpen: false, cruise: null });
      if (typeof fresh.to === "number") preloadFor(fresh.to);
    }
    // Skip finishes the current trip; pressing it again changes nothing.
    if (s.skipId !== seenSkip.current) {
      seenSkip.current = s.skipId;
      if (run.current) run.current.skip = true;
    }

    const r = run.current;
    if (r) {
      const last = r.shots[r.shots.length - 1];
      let start = 0;
      let i = 0;
      if (r.skip) i = ready(last.scene) ? r.shots.length : r.shot;
      else {
        r.t += dt;
        while (i < r.shots.length && r.t >= start + r.shots[i].dur) {
          // Hold on the end of this shot (faded out) until the next scene's machine has loaded.
          if (i + 1 < r.shots.length && !ready(r.shots[i + 1].scene)) {
            r.t = start + r.shots[i].dur - 1e-4;
            break;
          }
          start += r.shots[i++].dur;
        }
        if (i === 0 && r.shot < 0 && !ready(r.shots[0].scene)) {
          r.t = 0;
          i = -1;
        }
      }
      if (i >= r.shots.length) {
        // Arrived (or skipped to the end).
        run.current = null;
        live.streak = 0;
        const cut = tour.get().scene.key !== last.scene.key;
        if (cut) {
          // A skip that changes scene comes in from the destination's haze (or black).
          live.fade = 1;
          tint = last.tint?.in ?? "#000";
        }
        last.cam(1, camera);
        const to = r.to;
        tour.set({
          ...(cut ? { scene: last.scene } : {}),
          phase: to === "start" ? "start" : to === "end" ? "end" : "explore",
          stop: typeof to === "number" ? to : to === "end" ? STOPS.length - 1 : -1,
          cruise: null,
          introOpen: typeof to === "number",
        });
        if (typeof to === "number") preloadFor(to + 1);
      } else if (i < 0) {
        live.fade = 1; // waiting for the first scene of the trip to load
        tint = r.shots[0].tint?.in ?? "#000";
      } else if (r.skip) {
        live.fade = 1; // skipped: covered until the destination has loaded
        tint = last.tint?.in ?? "#000";
        live.streak = 0;
      } else {
        const shot = r.shots[i];
        const local = (r.t - start) / shot.dur;
        if (i !== r.shot) {
          r.shot = i;
          const patch: Partial<TourState> = {
            cruise: shot.counter ? { label: shot.counter.label, dest: shot.counter.dest, from: shot.counter.from, to: shot.counter.to } : null,
          };
          if (tour.get().scene.key !== shot.scene.key) {
            patch.scene = shot.scene;
            // Only for journeys: jumps and skips still dip through black or haze.
            if (!shot.fadeIn && (i === 0 || !r.shots[i - 1].fadeOut)) snapshot(gl.domElement);
          }
          tour.set(patch);
        }
        shot.cam(local, camera);
        const into = r.t - start;
        const left = start + shot.dur - r.t;
        let f = 0;
        if (shot.fadeIn && into < shot.fadeIn) f = 1 - into / shot.fadeIn;
        if (shot.fadeOut && left < shot.fadeOut) f = Math.max(f, 1 - left / shot.fadeOut);
        // Ease the dips so the picture doesn't snap in and out of them.
        live.fade = f * f * (3 - 2 * f);
        tint = (shot.fadeOut && left < shot.fadeOut ? shot.tint?.out : shot.tint?.in) ?? "#000";
        live.streak = shot.streak ? shot.streak(local) : 0;
        if (shot.counter) live.counter = shot.counter.at(local);
      }
    } else {
      live.fade = Math.max(0, live.fade - dt * 3);
      live.streak = 0;
      if (s.phase === "start" || s.phase === "end") aim(camera, START_POSE.pos, START_POSE.look);
    }

    if (hud.fade) {
      if (xfade >= 0) {
        // Dissolving from the picture of the last frame.
        xfade += dt;
        const u = Math.min(1, xfade / XFADE);
        hud.fade.style.opacity = Math.max(live.fade, 1 - u * u * (3 - 2 * u)).toFixed(3);
        if (u >= 1) {
          xfade = -1;
          hud.fade.style.backgroundImage = "";
        }
      } else hud.fade.style.opacity = live.fade.toFixed(3);
      if (shownTint !== tint) hud.fade.style.backgroundColor = shownTint = tint;
    }
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
