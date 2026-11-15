"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { reducedMotion } from "../../lib/device";
import { useStore } from "../../lib/store";
import { endReplay, live, REPLAYS, setCaption, tour } from "../../state";
import type { Stop } from "../../stops";
import { ghostMaterial, shell, smooth, type Cue } from "../Ghost";
import { prepareModel, type GltfSpec } from "../Machine";
import { useModel } from "../useModel";

REPLAYS.add("opportunity");

// Opportunity, 2004–2018 as a time-lapse: the clean rover drives in along its tracks a hop at a time, then the
// 2018 dust storm darkens the sky, its panels dim and it goes still. The storm clears on the dusty rover of today.
const LINES: Cue[] = [
  { at: 0, text: "25 January 2004. Opportunity bounces down onto Mars, wrapped in a ball of airbags." },
  { at: 3.5, text: "It was built to explore for 90 Mars days, called sols. Sol by sol, it starts to drive." },
  { at: 7, text: "It finds tiny round rocks, nicknamed “blueberries”, that formed in water long ago." },
  { at: 10.5, text: "Sol 90: job done! But Opportunity keeps going, year after year." },
  { at: 14, text: "In all, it drives 45 km. That’s farther than a marathon!" },
  { at: 17.5, text: "June 2018. A dust storm grows until it wraps around the whole planet." },
  { at: 21, text: "The dust blots out the Sun. With no sunlight on its solar panels, Opportunity runs out of power." },
  { at: 24.5, text: "10 June 2018: its last message reaches Earth. Then, silence." },
  { at: 28, text: "For eight months, the team sends more than a thousand calls to wake it up." },
  { at: 31.5, text: "With the very last call, they play it one more wake-up song: Billie Holiday’s “I’ll Be Seeing You.”" },
  { at: 35, text: "13 February 2019: the mission ends. Opportunity still stands here today, under a coat of red dust." },
];
const END = 40;
const DRIVE: [number, number] = [2.5, 16.5];
const HOPS = 9; // drive, stop, drive: one hop per stretch of sols
const STORM: [number, number] = [17.5, 24]; // the sky darkens
const STILL = 25; // last message
const CLEAR: [number, number] = [33, 36]; // the storm lifts on the present day
const REVEAL = 34;
const VIEW = { pos: [4.5, 0, 5] as [number, number, number], look: [0, 0.7, 0] as [number, number, number] };
const DUST = new THREE.Color("#4a2a18");
const CLEAN = new THREE.Color("#a8e6ff"), DIM = new THREE.Color("#a0603a");

export function OpportunityReplay({ stop, ground }: { stop: Stop; ground?: (x: number, z: number) => number }) {
  const on = useStore(tour, (s) => s.replay);
  const spec = stop.model as GltfSpec;
  const gltf = useModel(spec.url);
  const { scene: world, camera } = useThree();
  const scene = useMemo(() => {
    const mat = ghostMaterial(), panelMat = ghostMaterial("#a8e6ff");
    // The rover as it was, placed exactly like the real one; its solar panels get their own glow, to dim.
    const object = prepareModel(gltf.scene, spec, []).object;
    object.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || m.name === "_root") return;
      const name = (Array.isArray(m.material) ? m.material[0] : m.material)?.name ?? "";
      m.material = /^tex_panels/.test(name) ? panelMat : mat;
      m.castShadow = m.receiveShadow = false;
    });
    const rover = new THREE.Group();
    rover.add(object);
    // The tracks it left (stop.marks, from far out to here), driven in order.
    const path = stop.marks?.find((m) => m.kind === "tracks")?.path ?? [[0, -40], [0, -1]];
    const curve = new THREE.CatmullRomCurve3([...path].reverse().concat([[0, 0]]).map(([x, z]) => new THREE.Vector3(x, 0, z)));
    const root = new THREE.Group();
    root.add(rover);
    shell(root);
    // The storm's dusky veil over the whole view: a sphere around the camera, drawn last.
    const tint = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 8),
      new THREE.MeshBasicMaterial({ color: DUST, transparent: true, opacity: 0, depthTest: false, depthWrite: false, side: THREE.BackSide, fog: false }),
    );
    tint.renderOrder = 2000;
    tint.frustumCulled = false;
    root.add(tint);
    return { root, mat, panelMat, rover, curve, tint };
  }, [gltf, spec, stop]);
  useEffect(
    () => () => {
      scene.mat.dispose();
      scene.panelMat.dispose();
      (scene.tint.material as THREE.Material).dispose();
      scene.tint.geometry.dispose();
      live.hideMachine = false;
      live.replayLook = null;
      live.replayView = null;
    },
    [scene],
  );

  const t0 = useRef(-1);
  const shown = useRef("");
  const calm = useRef(false);
  // Mars's own haze (set up by Surface.tsx), saved so the storm can thicken it and put it back.
  const fog0 = useRef<{ fog: THREE.FogExp2; color: THREE.Color; density: number } | null>(null);
  useEffect(() => {
    if (!on) return;
    t0.current = -1;
    calm.current = reducedMotion();
    const fog = world.fog instanceof THREE.FogExp2 ? world.fog : null;
    fog0.current = fog ? { fog, color: fog.color.clone(), density: fog.density } : null;
    live.replayView = VIEW;
    return () => {
      const f = fog0.current;
      if (f) {
        f.fog.color.copy(f.color);
        f.fog.density = f.density;
      }
      fog0.current = null;
      live.replayLook = null;
      live.replayView = null;
      shown.current = "";
      setCaption("", 0);
    };
  }, [on, world]);

  const v = useMemo(() => new THREE.Vector3(), []);
  const dir = useMemo(() => new THREE.Vector3(), []);
  useFrame((state) => {
    const gh = (x: number, z: number) => (ground ? ground(x, z) : 0);
    const s = tour.get();
    const t = t0.current < 0 ? 0 : state.clock.elapsedTime - t0.current;
    // The real (dusty) rover stays hidden until the present day.
    live.hideMachine = !s.revealed.includes(stop.id) && !(on && t0.current >= 0 && t >= REVEAL);
    scene.root.visible = on;
    if (!on) return;
    if (t0.current < 0) t0.current = state.clock.elapsedTime;

    // The drive, as a time-lapse: a short move, a pause, another move, nose along its tracks.
    const p = Math.min(1, Math.max(0, (t - DRIVE[0]) / (DRIVE[1] - DRIVE[0])));
    const i = Math.min(HOPS - 1, Math.floor(p * HOPS));
    const u = (i + smooth(0, 0.7, p * HOPS - i)) / HOPS;
    scene.curve.getPointAt(u, v);
    scene.curve.getTangentAt(u, dir);
    scene.rover.position.set(v.x, gh(v.x, v.z), v.z);
    scene.rover.rotation.y = Math.atan2(dir.x, dir.z); // its front (mast and arm) is +z

    // The storm: the haze thickens and darkens, the panels dim to dusty red, and the rover's glow stops pulsing.
    const storm = smooth(STORM[0], STORM[1], t) * (1 - smooth(CLEAR[0], CLEAR[1], t));
    const f = fog0.current;
    if (f) {
      f.fog.density = f.density + (0.09 - f.density) * storm;
      f.fog.color.copy(f.color).lerp(DUST, storm);
    }
    (scene.tint.material as THREE.MeshBasicMaterial).opacity = 0.62 * storm;
    scene.tint.position.copy(camera.position);
    const alive = 1 - smooth(STILL - 1, STILL, t);
    const pulse = calm.current ? 1 : 1 + 0.15 * Math.sin(t * 2.5) * alive;
    const alpha = smooth(0, 1.5, t) * (1 - smooth(CLEAR[0], REVEAL + 1, t));
    scene.mat.uniforms.uAlpha.value = alpha * pulse * (1 - 0.45 * smooth(STILL - 3, STILL + 1, t));
    const dim = smooth(STORM[0] + 1.5, STILL, t);
    scene.panelMat.uniforms.uAlpha.value = alpha * pulse * (1 - 0.8 * dim);
    scene.panelMat.uniforms.uColor.value.copy(CLEAN).lerp(DIM, dim);
    scene.rover.visible = t < REVEAL + 1;

    const rp = scene.rover.position;
    live.replayLook = t < DRIVE[1] + 0.5 ? [rp.x, rp.y + 0.8, rp.z] : null;

    let line = "", from = 0, until = END;
    LINES.forEach((c, i) => {
      if (t < c.at) return;
      line = c.text;
      from = c.at;
      until = LINES[i + 1]?.at ?? END;
    });
    if (line !== shown.current) {
      shown.current = line;
      // The caption's bar shows how long this line stays up: until the next line (or the end).
      setCaption(line, until - Math.max(from, t));
    }
    if (t >= END) endReplay();
  });

  return <primitive object={scene.root} />;
}
