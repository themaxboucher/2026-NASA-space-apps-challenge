"use client";

import * as THREE from "three";
import { smooth } from "../Ghost";
import { disposeSprite, glowSprite } from "./cassini";

// A scene of its own for each machine in the shared replay (generic.tsx): the thing that machine is known for,
// played on the line that tells it (a hotspot's own text, chosen in the site file's "signature").
//   quake     the ground shaking: rings travel out from an impact (out) or in to a seismometer, and a seismograph
//             trace jumps as each one passes
//   aim       a bullseye closing on the crater: it hit exactly where it was aimed
//   laser     a laser pulse from Earth comes down to the mirror and goes back up
//   pictures  pictures (or data) leaving for Earth, one after another
//   collect   grains streaming in to the part that caught or counted them
//   dig       a trench opening in the soil under a scoop (hole: one small mark under a drill or a sensor)
//   drop      sample tubes set down on the ground one by one
//   plume     a cloud of dust rising from the crater into the sunlight
//   twin      a second flash close by: its twin coming down
//   burn      the machine glowing and shedding sparks as it burns in the air
//   pulses    landing engines firing in quick pulses, then cutting off too soon
//   crew      one of the astronauts: a ghost walks from the foot of the lander's ladder to the spot (back: from
//             out there back to the ladder; jump: and jumps half a metre, saluting)
// (hop, rolloff, chute, tracks and crew move the machine itself or bring in something else, so they are in
// generic.tsx.)
export type OwnKind = "quake" | "aim" | "laser" | "pictures" | "collect" | "dig" | "drop" | "plume" | "twin" | "burn" | "pulses" | "hop" | "rolloff" | "chute" | "tracks" | "crew";

export type OwnFrame = {
  into: number; // seconds since its line began
  span: number; // how long its line lasts
  lit: number; // 0..1: fades in as the line starts and out as it ends
  t: number; // the replay's clock
  focus: THREE.Vector3; // the hotspot the scene is about
  centre: THREE.Vector3; // the middle of the machine (or of its see-through model)
  hit: THREE.Vector3; // the middle of the site, on the ground
  ground: (x: number, z: number) => number;
  camera: THREE.Camera;
  calm: boolean; // "reduce motion": nothing flickers
};

const UP = new THREE.Vector3(0, 1, 0);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const light = (color: string) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, side: THREE.DoubleSide, fog: false });
// Directions spread evenly over a ball.
const spread = (n: number) =>
  Array.from({ length: n }, (_, i) => {
    const b = Math.acos(1 - (2 * (i + 0.5)) / n);
    return new THREE.Vector3(Math.cos(i * 2.399) * Math.sin(b), Math.cos(b), Math.sin(i * 2.399) * Math.sin(b));
  });

export function ownScene(kind: OwnKind, o: { size: number; crater: number; sky: THREE.Vector3; out?: boolean; hole?: boolean }) {
  const root = new THREE.Group();
  const owned: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => {
    owned.push(x);
    return x;
  };
  // Soft points of light (they share one picture).
  const dots = (n: number, color: string) => {
    const first = glowSprite(color);
    owned.push({ dispose: () => disposeSprite(first) });
    const all = [first];
    for (let i = 1; i < n; i++) {
      const s = new THREE.Sprite(keep(first.material.clone()));
      s.renderOrder = 1001;
      all.push(s);
    }
    for (const s of all) {
      s.visible = false;
      root.add(s);
    }
    return all;
  };
  const show = (s: THREE.Sprite, opacity: number, scale: number) => {
    s.visible = opacity > 0.01;
    s.material.opacity = opacity;
    s.scale.setScalar(scale);
  };
  const mesh = <G extends THREE.BufferGeometry, M extends THREE.Material>(geo: G, mat: M) => {
    const m = new THREE.Mesh(geo, mat);
    m.renderOrder = 1001;
    m.visible = false;
    root.add(m);
    return m;
  };
  const dir = new THREE.Vector3();
  // Which way is outward from the machine at the hotspot, along the ground.
  const outward = (f: OwnFrame) => {
    dir.set(f.focus.x - f.centre.x, 0, f.focus.z - f.centre.z);
    if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1);
    return dir.normalize();
  };
  const crater = Math.max(4, o.crater);
  let update: (f: OwnFrame) => void = () => {};

  if (kind === "quake" || kind === "aim") {
    const geo = keep(new THREE.RingGeometry(0.9, 1, 96).rotateX(-Math.PI / 2));
    const rings = Array.from({ length: 3 }, () => mesh(geo, keep(light(kind === "aim" ? "#ffd27a" : "#9fd8ff"))));
    // The seismograph: a pen line that jumps each time a wave of shaking passes.
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const pen = canvas.getContext("2d")!;
    const paper = keep(new THREE.CanvasTexture(canvas));
    const trace = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: paper, transparent: true, opacity: 0, depthWrite: false, depthTest: false })));
    trace.renderOrder = 1002;
    trace.visible = false;
    if (kind === "quake") root.add(trace);
    update = (f) => {
      const fromHit = kind === "aim" || !!o.out;
      const mid = fromHit ? f.hit : f.focus;
      const reach = kind === "aim" ? crater * 2.2 : o.out ? Math.max(45, Math.hypot(f.focus.x - f.hit.x, f.focus.z - f.hit.z) + 12) : Math.max(6, o.size * 2.5);
      const y = (fromHit ? f.hit.y : f.ground(mid.x, mid.z)) + 0.15;
      rings.forEach((ring, i) => {
        const phase = (f.into * 0.3 + i / rings.length) % 1;
        ring.position.set(mid.x, y, mid.z);
        ring.scale.setScalar(Math.max(0.01, reach * (o.out ? phase : 1 - phase)));
        ring.material.opacity = f.lit * 0.65 * (o.out ? 1 - phase : phase) ** 1.2;
        ring.visible = ring.material.opacity > 0.01;
      });
      trace.visible = kind === "quake" && f.lit > 0.01;
      if (!trace.visible) return;
      pen.clearRect(0, 0, 256, 64);
      pen.strokeStyle = "#bfe6ff";
      pen.lineWidth = 2;
      pen.lineJoin = "round";
      pen.beginPath();
      for (let i = 0; i < 128; i++) {
        const tau = f.into - (127 - i) * 0.03;
        const jolt = tau < 0 ? 0 : 0.1 + 0.9 * Math.exp(-3.5 * ((tau * 0.9) % 1));
        const y2 = 32 + 27 * jolt * Math.sin(tau * 46) * (0.65 + 0.35 * Math.sin(tau * 17));
        if (i) pen.lineTo(i * 2, y2);
        else pen.moveTo(0, y2);
      }
      pen.stroke();
      paper.needsUpdate = true;
      const wide = o.out ? 14 : Math.max(1.8, o.size * 0.8);
      trace.position.set(f.focus.x, f.focus.y + (o.out ? 2.4 : Math.max(0.9, o.size * 0.45)), f.focus.z);
      trace.scale.set(wide, wide / 4, 1);
      trace.material.opacity = f.lit * 0.95;
    };
  } else if (kind === "laser") {
    const geo = keep(new THREE.CylinderGeometry(1, 1, 1, 10, 1, true).translate(0, 0.5, 0));
    const guide = mesh(geo, keep(light("#6dffa0")));
    const pulse = mesh(geo, keep(light("#c4ffd9")));
    const aim = new THREE.Quaternion().setFromUnitVectors(UP, o.sky);
    guide.quaternion.copy(aim);
    pulse.quaternion.copy(aim);
    const [spark] = dots(1, "#8dffb4");
    const k = clamp(o.size / 1.5, 1, 6);
    const far = 320;
    update = (f) => {
      guide.visible = f.lit > 0.01;
      guide.position.copy(f.focus);
      guide.scale.set(0.012 * k, far, 0.012 * k);
      guide.material.opacity = f.lit * 0.25;
      // Down from Earth in the first second of each round, back up in the next.
      const c = f.into % 2.5;
      const d = c < 1 ? far * (1 - c) : c < 2 ? far * (c - 1) : -1;
      pulse.visible = f.lit > 0.01 && d >= 0;
      pulse.position.copy(f.focus).addScaledVector(o.sky, Math.max(0, d));
      pulse.scale.set(0.035 * k, 30, 0.035 * k);
      pulse.material.opacity = f.lit * 0.9;
      spark.position.copy(f.focus);
      show(spark, f.lit * Math.exp(-5 * Math.abs(c - 1)), clamp(o.size * 0.6, 0.5, 4));
    };
  } else if (kind === "pictures") {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 48;
    const pen = canvas.getContext("2d")!;
    pen.fillStyle = "rgba(255,255,255,0.16)";
    pen.fillRect(3, 3, 58, 42);
    pen.strokeStyle = "#ffffff";
    pen.lineWidth = 3;
    pen.strokeRect(3, 3, 58, 42);
    pen.lineWidth = 2;
    pen.beginPath();
    pen.moveTo(4, 31);
    pen.quadraticCurveTo(30, 22, 60, 30); // a horizon
    pen.stroke();
    pen.beginPath();
    pen.arc(44, 15, 5, 0, Math.PI * 2); // and something in the sky
    pen.stroke();
    const film = keep(new THREE.CanvasTexture(canvas));
    const geo = keep(new THREE.PlaneGeometry(1.33, 1));
    const frames = Array.from({ length: 6 }, () => {
      const mat = keep(light("#cfeaff"));
      mat.map = film;
      return mesh(geo, mat);
    });
    const base = clamp(o.size * 0.16, 0.3, 2.5);
    const far = Math.max(28, o.size * 8);
    update = (f) =>
      frames.forEach((m, i) => {
        const phase = (f.into * 0.3 + i / frames.length) % 1;
        m.position.copy(f.focus).addScaledVector(o.sky, phase * phase * far + base);
        m.quaternion.copy(f.camera.quaternion);
        m.scale.setScalar(base * (0.6 + 1.6 * phase));
        m.material.opacity = f.lit * 0.85 * Math.sin(Math.PI * phase) ** 0.7;
        m.visible = m.material.opacity > 0.01;
      });
  } else if (kind === "collect") {
    const bits = dots(14, "#ffe9b0");
    const from = spread(bits.length);
    const reach = Math.max(2.5, o.size * 1.2);
    const grain = clamp(o.size * 0.06, 0.1, 0.5);
    update = (f) =>
      bits.forEach((b, i) => {
        const phase = (f.into * 0.45 + i / bits.length) % 1;
        b.position.copy(f.focus).addScaledVector(from[i], (1 - phase) ** 1.5 * reach);
        show(b, f.lit * 0.9 * smooth(0, 0.3, phase), grain * (1.4 - 0.6 * phase));
      });
  } else if (kind === "dig") {
    const mark = mesh(keep(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)), keep(new THREE.MeshBasicMaterial({ color: "#120c08", transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, fog: false })));
    mark.renderOrder = 2;
    const [tool] = dots(1, "#bfe6ff");
    const wide = clamp(o.size * 0.05, 0.08, 0.3);
    const long = o.hole ? wide * 1.3 : clamp(o.size * 0.24, 0.35, 1.3);
    update = (f) => {
      const d = outward(f);
      const len = long * (o.hole ? 1 : 0.15 + 0.85 * smooth(0, Math.min(4, f.span * 0.7), f.into));
      const near = o.size * 0.06;
      const x = f.focus.x + d.x * (near + len / 2);
      const z = f.focus.z + d.z * (near + len / 2);
      mark.visible = f.lit > 0.01;
      mark.position.set(x, f.ground(x, z) + 0.02, z);
      mark.rotation.y = Math.atan2(d.x, d.z);
      mark.scale.set(wide, 1, len);
      mark.material.opacity = f.lit * 0.75 * (o.hole ? smooth(0, 2, f.into) : 1);
      // The tool at work, at the far end of the trench.
      const ex = f.focus.x + d.x * (near + len);
      const ez = f.focus.z + d.z * (near + len);
      tool.position.set(ex, f.ground(ex, ez) + wide * 0.5, ez);
      show(tool, f.lit * 0.75 * (f.calm ? 1 : 0.7 + 0.3 * Math.sin(f.t * 9)), wide * 3.5);
    };
  } else if (kind === "drop") {
    const tubes = dots(10, "#dff3ff");
    const k = clamp(o.size / 3, 0.6, 1.5);
    update = (f) => {
      const d = outward(f);
      tubes.forEach((s, i) => {
        const along = o.size * 0.3 + i * 0.24 * k;
        const side = (i % 2 ? 0.2 : -0.2) * k;
        const x = f.focus.x + d.x * along + d.z * side;
        const z = f.focus.z + d.z * along - d.x * side;
        s.position.set(x, f.ground(x, z) + 0.06, z);
        show(s, f.lit * smooth(i * 0.3, i * 0.3 + 0.4, f.into), 0.4 * k);
      });
    };
  } else if (kind === "plume") {
    const puffs = dots(6, "#ffe9c8");
    update = (f) =>
      puffs.forEach((s, i) => {
        const phase = (f.into * 0.2 + i / puffs.length) % 1;
        s.position.set(f.hit.x + Math.sin(i * 2.4) * crater * 0.25 * phase, f.hit.y + crater * 3 * phase, f.hit.z + Math.cos(i * 2.4) * crater * 0.25 * phase);
        show(s, f.lit * 0.5 * Math.sin(Math.PI * phase) ** 0.8, crater * (0.8 + 2.2 * phase));
      });
  } else if (kind === "twin") {
    const [flash, scar] = dots(2, "#fff1d6");
    update = (f) => {
      const g = f.ground(f.focus.x, f.focus.z);
      const u = (f.into - 0.7) / 0.9;
      flash.position.set(f.focus.x, g + crater * 0.15, f.focus.z);
      show(flash, u >= 0 && u < 1 ? (1 - u) ** 1.3 : 0, crater * (1.2 + 4 * (1 - (1 - clamp(u, 0, 1)) ** 3)));
      scar.position.set(f.focus.x, g + 0.3, f.focus.z);
      show(scar, f.lit * 0.5 * smooth(0.7, 1.6, f.into), crater * 0.9);
    };
  } else if (kind === "burn") {
    const [fire, ...sparks] = dots(9, "#ff9a3d");
    const back = spread(sparks.length).map((d) => d.multiplyScalar(0.45).add(new THREE.Vector3(0.3, 0.8, -0.5)).normalize());
    update = (f) => {
      fire.position.copy(f.centre);
      show(fire, f.lit * 0.7 * (f.calm ? 1 : 0.8 + 0.2 * Math.sin(f.t * 23)), o.size * 1.6);
      sparks.forEach((s, i) => {
        const phase = (f.into * 0.7 + i / sparks.length) % 1;
        s.position.copy(f.centre).addScaledVector(back[i], phase * o.size * 1.8);
        show(s, f.lit * 0.8 * (1 - phase), o.size * 0.18);
      });
    };
  } else if (kind === "pulses") {
    const jets = dots(3, "#ffb056");
    update = (f) => {
      // Quick pulses for the first half of the line, then nothing: the engines have stopped.
      const firing = f.into < f.span * 0.55 && (f.calm || Math.sin(f.into * 2 * Math.PI * 5) > 0);
      jets.forEach((s, i) => {
        const a = i * 2.094;
        s.position.set(f.centre.x + Math.cos(a) * o.size * 0.22, f.centre.y - o.size * 0.3, f.centre.z + Math.sin(a) * o.size * 0.22);
        show(s, firing ? f.lit * 0.9 : 0, o.size * 0.32);
      });
    };
  }
  return {
    root,
    update,
    hide: () => {
      for (const c of root.children) c.visible = false;
    },
    dispose: () => owned.forEach((x) => x.dispose()),
  };
}
