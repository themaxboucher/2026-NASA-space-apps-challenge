"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { reducedMotion } from "../lib/device";
import { aim, formatKm } from "../lib/geo";
import { plan, START_POSE, type Shot } from "../plans";
import { hud, live, tour, type SceneDesc, type Target, type TourState } from "../state";
import { STORY_COUNT, STOPS } from "../stops";
import { modelSettled, preloadModel } from "./useModel";

// `cut`: the shot that switched scenes without a fade of its own; it fades in from black.
type Run = { shots: Shot[]; t: number; shot: number; to: Target; skip: boolean; cut?: number };

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

// Scene changes during a journey that have no fade of their own get a quick dip through black (this long out,
// and this long back in), so you never see one environment snap into the next.
const DIP = 0.25;

// Runs travel plans: switches scenes, flies the camera, fades, and drives the star streaks and distance counter.
export function Director() {
  const { camera } = useThree();
  const run = useRef<Run | null>(null);
  const seenRequest = useRef(0);
  const seenSkip = useRef(0);
  // The first stop's lander starts loading while the start screen and briefing are up, so the trip to the Moon
  // doesn't freeze on its last frame waiting for it (it took about 4 seconds on a first visit).
  useEffect(() => {
    preloadFor(0);
  }, []);

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
      tour.set({ phase: "travel", stop: typeof fresh.to === "number" ? fresh.to : s.stop, openSpot: null, introOpen: false, cruise: null, replay: false });
      if (typeof fresh.to === "number") preloadFor(fresh.to);
    }
    // Skip finishes the current trip; pressing it again changes nothing.
    if (s.skipId !== seenSkip.current) {
      seenSkip.current = s.skipId;
      if (run.current) run.current.skip = true;
    }

    const r = run.current;
    let chip = "";
    if (r) {
      const last = r.shots[r.shots.length - 1];
      let start = 0;
      let i = 0;
      if (r.skip) i = ready(last.scene) ? r.shots.length : r.shot;
      else {
        r.t += live.compiling ? 0 : dt; // hold while the new scene's shaders compile (no frozen page)
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
          stop: typeof to === "number" ? to : to === "end" ? STORY_COUNT - 1 : -1,
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
            if (!shot.fadeIn) r.cut = i; // comes in from black (see DIP)
          }
          tour.set(patch);
        }
        shot.cam(local, camera);
        const into = r.t - start;
        const left = start + shot.dur - r.t;
        let f = 0;
        if (shot.fadeIn && into < shot.fadeIn) f = 1 - into / shot.fadeIn;
        if (shot.fadeOut && left < shot.fadeOut) f = Math.max(f, 1 - left / shot.fadeOut);
        tint = (shot.fadeOut && left < shot.fadeOut ? shot.tint?.out : shot.tint?.in) ?? "#000";
        // The quick dip to black around a scene change with no fade of its own: out at the end of this shot,
        // back in at the start of the next.
        const next = r.shots[i + 1];
        let dip = 0;
        if (next && next.scene.key !== shot.scene.key && !shot.fadeOut && !next.fadeIn && left < DIP) dip = 1 - left / DIP;
        if (r.cut === i && into < DIP) dip = Math.max(dip, 1 - into / DIP);
        if (dip > f) {
          f = dip;
          tint = "#000";
        }
        // Ease the dips so the picture doesn't snap in and out of them.
        live.fade = f * f * (3 - 2 * f);
        live.streak = shot.streak ? shot.streak(local) : 0;
        chip = shot.chip?.(local) ?? "";
        if (shot.counter) live.counter = shot.counter.at(local);
      }
    } else {
      live.fade = Math.max(0, live.fade - dt * 3);
      live.streak = 0;
      if (s.phase === "start" || s.phase === "end") {
        aim(camera, START_POSE.pos, START_POSE.look);
        // The last seconds of the launch countdown: the camera rumbles, harder as liftoff nears.
        if (s.countdown != null && s.countdown <= 2) {
          const k = (3 - s.countdown) * 0.006;
          camera.position.x += (Math.random() - 0.5) * k;
          camera.position.y += (Math.random() - 0.5) * k;
        }
      }
    }

    if (hud.fade) {
      hud.fade.style.opacity = live.fade.toFixed(3);
      if (shownTint !== tint) hud.fade.style.backgroundColor = shownTint = tint;
    }
    // Only into the readout showing this shot's label: on the frame a shot starts, React hasn't swapped the readout
    // yet, and the old one (say "Height above Mars") would show the new shot's figure as it fades out.
    const cruise = tour.get().cruise;
    if (hud.counter && cruise && hud.counter.dataset.label === cruise.label) hud.counter.textContent = formatKm(live.counter);
    // The caption chip naming what you're flying past; it fades between captions (CSS on [data-on]).
    if (hud.chip && hud.chip.dataset.text !== chip) {
      hud.chip.dataset.text = chip;
      if (chip) hud.chip.textContent = chip;
      hud.chip.toggleAttribute("data-on", !!chip);
    }
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
