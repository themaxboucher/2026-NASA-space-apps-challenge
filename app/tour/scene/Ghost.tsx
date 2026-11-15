"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useStore } from "../lib/store";
import { endReplay, hud, live, setCaption, tour } from "../state";
import type { Stop } from "../stops";
import { loadMedia } from "../Story";
import { prepareModel, type GltfSpec } from "./Machine";
import { useModel } from "./useModel";

// "What happened here": see-through figures re-enact the past over the real machine, then fade away.
// They are drawn as glowing silhouettes (bright at the edges, clear in the middle) so they read as memories.

export function ghostMaterial(color = "#9fd8ff") {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uAlpha: { value: 0 } },
    vertexShader: `varying vec3 vN; varying vec3 vV;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uAlpha; varying vec3 vN; varying vec3 vV;
      void main() { float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0); gl_FragColor = vec4(uColor, (0.05 + 0.95 * f) * uAlpha); }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

// The team's Blender model of an astronaut in the A7L suit (public/models/astronaut.gltf.json): joints are named
// nodes (legL/R at the hips, armL/R at the shoulders), so the replay can swing them without a skeleton.
export function suited(source: THREE.Object3D, mat: THREE.Material) {
  const g = source.clone(true);
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.material = mat;
      m.castShadow = m.receiveShadow = false;
    }
  });
  const node = (n: string) => g.getObjectByName(n) ?? new THREE.Group();
  return { g, legL: node("legL"), legR: node("legR"), armL: node("armL"), armR: node("armR"), shinL: node("shinL"), shinR: node("shinR"), foreL: node("forearmL"), foreR: node("forearmR"), torso: node("torso") };
}

const depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false });
export function shell(root: THREE.Object3D) {
  const list: THREE.Mesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && !(o as THREE.Mesh).userData.depthCopy) list.push(o as THREE.Mesh);
  });
  for (const m of list) {
    const d = new THREE.Mesh(m.geometry, depthOnly);
    d.userData.depthCopy = true;
    d.renderOrder = 999; // after the real (opaque) scene, so it never hides what's behind the ghost
    m.add(d);
    m.renderOrder = 1000;
    const mat = m.material as THREE.ShaderMaterial;
    mat.depthFunc = THREE.LessEqualDepth;
  }
}

export const smooth = (a: number, b: number, t: number) => {
  const u = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return u * u * (3 - 2 * u);
};
export const lerp2 = (a: [number, number], b: [number, number], u: number): [number, number] => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];

export type Cue = { at: number; who?: string; text: string };
// Fallback captions if the radio recording isn't available (times in seconds from the start of the replay).
// Negative times are during the landing (the replay clock reads 0 at touchdown).
const LAND = 8;
const A11_LINES: Cue[] = [
  { at: -LAND, text: "20 July 1969. Eagle comes in to land, with less than a minute of fuel to spare." },
  { at: -1.5, who: "Armstrong", text: "Houston, Tranquility Base here. The Eagle has landed." },
  { at: 0.8, text: "Six and a half hours later, the hatch opens." },
  { at: 2.5, who: "Houston", text: "Okay, Neil, we can see you coming down the ladder now." },
  { at: 7, who: "Armstrong", text: "I’m going to step off the LM now." },
  { at: 10, who: "Armstrong", text: "That’s one small step for man, one giant leap for mankind." },
  { at: 17, text: "Buzz Aldrin follows him down. Together they plant the flag." },
  { at: 24, text: "They fill sample boxes with 21.5 kg of Moon rocks and dust to bring home." },
  { at: 30, text: "After about two and a half hours outside, they climb back aboard." },
  { at: 37.5, text: "21 July 1969: the top half fires its engine and flies back to orbit." },
  { at: 42, text: "The blast knocks the flag over. The bottom half has stood here ever since." },
];
const A11_END = 46.5;
// The flag's foot: where the real fallen flag's pole ends (scene/Marks.tsx FallenFlag at (-3.4, 8.4), turned 0.6 rad,
// pole lying from x = -1.15 to +1.15). Standing it up about this point, then letting it fall, lands it exactly there.
const FLAG_YAW = 0.6;
const FLAG_FOOT: [number, number] = [-3.4 - 1.15 * Math.cos(FLAG_YAW), 8.4 + 1.15 * Math.sin(FLAG_YAW)];
const AUDIO_AT = 2; // the radio recording starts here

export function Apollo11Replay({ stop, ground }: { stop: Stop; ground: (x: number, z: number) => number }) {
  const on = useStore(tour, (s) => s.replay);
  const spec = stop.model as GltfSpec;
  const gltf = useModel(spec.url);
  const suit = useModel("/models/astronaut.gltf.json");
  const scene = useMemo(() => {
    const mat = ghostMaterial();
    // The lander as it was: the same placement as the real one, but only the top half (which flew away) is shown.
    const { object } = prepareModel(gltf.scene, spec, []);
    object.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (m.name === "_root") return;
      m.visible = !m.visible;
      m.material = mat;
      m.castShadow = m.receiveShadow = false;
    });
    const ascent = new THREE.Group();
    ascent.add(object);
    // The whole lander, for the landing.
    const landMat = ghostMaterial();
    const whole = prepareModel(gltf.scene, spec, []).object;
    whole.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || m.name === "_root") return;
      m.visible = true;
      m.material = landMat;
      m.castShadow = m.receiveShadow = false;
    });
    const landing = new THREE.Group();
    landing.add(whole);
    const landFlame = new THREE.Mesh(new THREE.ConeGeometry(0.7, 3, 16, 1, true).rotateX(Math.PI), ghostMaterial("#ffc27a"));
    landFlame.position.set(0, -0.2, 0);
    landing.add(landFlame);
    // Engine flame at liftoff.
    const flameMat = ghostMaterial("#ffc27a");
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.55, 2.2, 16, 1, true).rotateX(Math.PI), flameMat);
    flame.position.set(0, 2.2, 0);
    ascent.add(flame);
    const neil = suited(suit.scene, mat), buzz = suited(suit.scene, mat);
    // A standing flag, built in the same frame as the real fallen one: pole up from its foot, crossbar near the
    // top, cloth hanging off the crossbar along +z.
    const flag = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.3, 8), mat);
    pole.position.y = 1.15;
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.5, 8).rotateX(Math.PI / 2), mat);
    bar.position.set(0, 2.2, 0.75);
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.9).rotateY(-Math.PI / 2), mat);
    cloth.position.set(0, 1.75, 0.75);
    flag.add(pole, bar, cloth);
    // Sample boxes (the aluminium "rock boxes"), carried in the right hand on the way back.
    const box = () => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.3, 0.2), mat);
      b.position.set(0, -0.78, 0.12);
      return b;
    };
    const neilBox = box(), buzzBox = box();
    neil.armR.add(neilBox);
    buzz.armR.add(buzzBox);
    const root = new THREE.Group();
    root.add(ascent, neil.g, buzz.g, flag, landing);
    shell(root);
    return { root, mat, flameMat, ascent, flame, neil, buzz, flag, landing, landMat, landFlame, neilBox, buzzBox };
  }, [gltf, suit, spec]);
  useEffect(
    () => () => {
      scene.mat.dispose();
      scene.flameMat.dispose();
      live.replayLook = null;
      scene.landMat.dispose();
      (scene.landFlame.material as THREE.Material).dispose();
      live.hideMachine = false;
    },
    [scene],
  );

  const t0 = useRef(-1);
  const audio = useRef<HTMLAudioElement | null>(null);
  const cues = useRef<Cue[]>(A11_LINES);
  const shown = useRef("");
  useEffect(() => {
    if (!on) return;
    t0.current = -1;
    cues.current = A11_LINES;
    let cancelled = false;
    // Real air-to-ground radio, if it shipped: its cue times replace the fallback captions for the ladder part.
    loadMedia().then((m) => {
      const r = (m as Record<string, { file?: string; cues?: Cue[] }>)["apollo11-replay"];
      if (cancelled || !r?.file || !/^media\/[\w.-]+$/.test(r.file)) return;
      const a = new Audio("/" + r.file);
      audio.current = a;
      if (r.cues?.length) {
        const radio = r.cues.map((c) => ({ ...c, at: c.at + AUDIO_AT }));
        const lastRadio = radio[radio.length - 1].at;
        cues.current = [A11_LINES[0], ...radio, ...A11_LINES.filter((c) => c.at > Math.max(14, lastRadio + 3))];
      }
    });
    return () => {
      cancelled = true;
      audio.current?.pause();
      audio.current = null;
      if (hud.replayLine) hud.replayLine.textContent = "";
    };
  }, [on]);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const s = tour.get();
    // Until the replay has played, the site is as it was before Eagle arrived: the real lander is hidden.
    live.hideMachine = !s.revealed.includes(stop.id) && !(on && t0.current >= 0 && state.clock.elapsedTime - t0.current >= LAND);
    scene.root.visible = on;
    if (!on) return;
    if (t0.current < 0) t0.current = state.clock.elapsedTime;
    const t = state.clock.elapsedTime - t0.current - LAND; // 0 = touchdown

    // The landing: the whole lander drifts down on its engine and settles, then the real one takes its place.
    const d = Math.min(1, Math.max(0, (t + LAND) / LAND));
    scene.landing.visible = t < 0.6;
    scene.landing.position.y = 22 * Math.pow(1 - d, 2.2);
    scene.landing.rotation.y = (1 - d) * 0.35;
    // Watch Eagle come down, then ease back to the site view.
    live.replayLook = t < 1.5 ? [0, scene.landing.position.y + 2.5, 0] : null;
    scene.landMat.uniforms.uAlpha.value = smooth(-LAND, -LAND + 1.2, t) * (1 - smooth(-0.2, 0.6, t));
    (scene.landFlame.material as THREE.ShaderMaterial).uniforms.uAlpha.value = t < -0.3 ? 0.6 + 0.3 * Math.sin(t * 40) : 0;
    if (audio.current && t >= AUDIO_AT && audio.current.paused && !audio.current.ended && audio.current.currentTime === 0) audio.current.play().catch(() => {});

    // Overall fade in and out.
    const alpha = smooth(0, 1.5, t) * (1 - smooth(A11_END - 2.5, A11_END, t));
    scene.mat.uniforms.uAlpha.value = alpha;

    // The ladder runs from the porch down to the footpad (the same line the player can climb).
    const lad = stop.ladder!;
    type Who = ReturnType<typeof suited>;
    const pose = (who: Who, hipL: number, hipR: number, kneeL: number, kneeR: number, shL: number, shR: number, elL: number, elR: number, spread = 0.18) => {
      who.legL.rotation.set(hipL, 0, 0);
      who.legR.rotation.set(hipR, 0, 0);
      who.shinL.rotation.set(kneeL, 0, 0);
      who.shinR.rotation.set(kneeR, 0, 0);
      who.armL.rotation.set(shL, 0, spread);
      who.armR.rotation.set(shR, 0, -spread);
      who.foreL.rotation.set(elL, 0, 0);
      who.foreR.rotation.set(elR, 0, 0);
    };
    // Turn smoothly toward a heading instead of snapping.
    const face = (who: Who, yaw: number, lean = 0) => {
      const cur = (who.g.userData.yaw as number | undefined) ?? yaw;
      const d = Math.atan2(Math.sin(yaw - cur), Math.cos(yaw - cur));
      const y = cur + d * Math.min(1, dt * 4);
      who.g.userData.yaw = y;
      who.g.rotation.set(lean, y, 0);
    };
    const onLadder = (who: Who, a: number, b: number, up: boolean) => {
      // Facing the ladder, hand over hand: one hand and the opposite foot move together, rung by rung.
      const k = smooth(a, b, t), u = up ? 1 - k : k;
      who.g.position.set(lad.to[0] + (lad.from[0] - lad.to[0]) * u, lad.to[1] + (lad.from[1] - lad.to[1]) * u - 0.3, lad.to[2] + (lad.from[2] - lad.to[2]) * u + 0.38);
      face(who, Math.PI, 0.12);
      const on = k > 0 && k < 1 ? 1 : 0;
      const c = Math.sin(t * 3.2) * on;
      pose(who, -0.45 - 0.45 * Math.max(0, c), -0.45 - 0.45 * Math.max(0, -c), 0.9 + 0.5 * Math.max(0, c), 0.9 + 0.5 * Math.max(0, -c), -2.3 - 0.35 * Math.max(0, -c), -2.3 - 0.35 * Math.max(0, c), -0.5, -0.5, 0.1);
    };
    // The Moon lope (as in the Apollo films): a short crouch, a push off both feet with one slightly leading,
    // a low floating bound, and a soft landing on bent knees. Arms out a little and elbows bent for balance.
    const walk = (who: Who, from: [number, number], to: [number, number], a: number, b: number) => {
      const u = smooth(a, b, t);
      const [x, z] = lerp2(from, to, u);
      // Ease the gait in and out with the move, so nobody starts or stops mid-bound.
      const m = Math.min(1, Math.min(u, 1 - u) * 8);
      const w = 2 * Math.PI * (t * 1.15 + (who === scene.buzz ? 0.4 : 0));
      const bob = 0.07 * Math.pow(Math.max(0, Math.sin(w)), 2); // a short float off the ground each bound
      who.g.position.set(x, ground(x, z) + bob * m, z);
      face(who, Math.atan2(to[0] - from[0], to[1] - from[1]), (0.1 + 0.03 * Math.sin(w)) * m);
      const lead = (-0.32 - 0.14 * Math.sin(w)) * m; // right leg reaches ahead
      const trail = (0.22 + 0.14 * Math.sin(w + 0.7)) * m; // left pushes off behind
      const kneeLead = (0.3 + 0.25 * Math.max(0, -Math.sin(w))) * m;
      const kneeTrail = (0.35 + 0.3 * Math.max(0, Math.sin(w + 0.7))) * m;
      const sway = 0.06 * Math.sin(w) * m;
      pose(who, trail, lead, kneeTrail, kneeLead, -0.3 * m + sway, -0.3 * m - sway, -0.6 * m, -0.6 * m, 0.12 + 0.14 * m);
    };
    const foot: [number, number] = [lad.from[0], lad.from[2] + 0.6];
    const neilAt: [number, number] = [FLAG_FOOT[0] + 0.9, FLAG_FOOT[1] - 0.5];
    const buzzAt: [number, number] = [FLAG_FOOT[0] - 0.7, FLAG_FOOT[1] - 0.9];
    // Neil: down the ladder, the small step, out to the flag, back with a rock box, up the ladder.
    if (t < 12) onLadder(scene.neil, 3, 11.5, false);
    else if (t < 25) walk(scene.neil, foot, neilAt, 14, 18.5);
    else if (t < 30) walk(scene.neil, neilAt, foot, 25.5, 29.5);
    else onLadder(scene.neil, 30, 34, true);
    // Buzz follows him down (about 19 minutes later in real life; here, a few seconds) and climbs in after him.
    if (t < 19.5) onLadder(scene.buzz, 14.5, 19.5, false);
    else if (t < 25) walk(scene.buzz, foot, buzzAt, 19.5, 22.5);
    else if (t < 32) walk(scene.buzz, buzzAt, foot, 26, 31);
    else onLadder(scene.buzz, 32, 36, true);
    const carrying = t > 24.5 && t < 36.1;
    scene.neilBox.visible = scene.buzzBox.visible = carrying;
    // The rock box hangs from the right hand: arm down, elbow slightly bent, no swing.
    if (carrying && t < 30) {
      scene.neil.armR.rotation.set(-0.1, 0, -0.12);
      scene.neil.foreR.rotation.set(-0.25, 0, 0);
    }
    if (carrying && t < 32) {
      scene.buzz.armR.rotation.set(-0.1, 0, -0.12);
      scene.buzz.foreR.rotation.set(-0.25, 0, 0);
    }
    const inside = smooth(36, 37, t);
    const showNeil = t >= 2.5 && (t < 34 || inside < 0.98), showBuzz = t >= 14 && inside < 0.98;
    scene.neil.g.visible = showNeil;
    scene.buzz.g.visible = showBuzz;

    // The flag: planted (19–21 s, rising from a lean), standing, then knocked flat by the blast (about 37 s),
    // falling about its foot so it ends up exactly where the real one lies.
    const up = smooth(21.5, 23.5, t);
    const fall = Math.min(1, Math.max(0, (t - 39.7) / 1.1));
    scene.flag.visible = up > 0;
    scene.flag.position.set(FLAG_FOOT[0], ground(FLAG_FOOT[0], FLAG_FOOT[1]), FLAG_FOOT[1]);
    scene.flag.rotation.set(0, FLAG_YAW, (1 - up) * -0.7 - (Math.PI / 2) * fall * fall);

    // Liftoff (36 s on): the top half climbs away, faster and faster.
    const lift = Math.max(0, t - 38.5);
    scene.ascent.position.y = 0.5 * 2.2 * lift * lift;
    scene.flame.visible = lift > 0 && lift < 4;
    scene.flameMat.uniforms.uAlpha.value = lift > 0 ? (0.7 + 0.3 * Math.sin(t * 40)) * alpha : 0;

    // Captions.
    let line = "", from = 0, until = A11_END;
    const list = cues.current;
    for (let i = 0; i < list.length; i++)
      if (t >= list[i].at) {
        const c = list[i];
        line = c.who ? `${c.who}: “${c.text.replace(/^[“"]|[”"]$/g, "")}”` : c.text;
        from = c.at;
        until = list[i + 1]?.at ?? A11_END;
      }
    if (line !== shown.current) {
      shown.current = line;
      // The bar shows how long this line stays up: from now until the next line (or the end).
      setCaption(line, until - Math.max(from, t));
    }
    if (t >= A11_END) endReplay();
  });

  return <primitive object={scene.root} />;
}
