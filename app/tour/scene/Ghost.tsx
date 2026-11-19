"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useStore } from "../lib/store";
import { endReplay, hud, live, replayClock, setCaption, tour } from "../state";
import type { Stop } from "../stops";
import { loadMedia, mediaSound } from "../Story";
import { prepareModel, type GltfSpec } from "./Machine";
import { useModel } from "./useModel";

// "What happened here": see-through figures re-enact the past over the real machine, then fade away.
// They are drawn as glowing silhouettes (bright at the edges, clear in the middle) so they read as memories.

// `core`: how much the middle of a shape shows (its edges always glow). A ghost over something bright (an astronaut
// against the lander's gold foil) needs a fuller body and normal blending, or it vanishes into what's behind it.
export function ghostMaterial(color = "#9fd8ff", core = 0.05, blending: THREE.Blending = THREE.AdditiveBlending) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uAlpha: { value: 0 }, uCore: { value: core } },
    vertexShader: `varying vec3 vN; varying vec3 vV;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uAlpha; uniform float uCore; varying vec3 vN; varying vec3 vV;
      void main() { float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0); gl_FragColor = vec4(uColor, (uCore + (1.0 - uCore) * f) * uAlpha); }`,
    transparent: true,
    depthWrite: false,
    blending,
    side: THREE.DoubleSide,
  });
}

// A rocket plume: white-hot at the nozzle fading to orange and then nothing at the tip, with flickering
// turbulence running down it. Drawn on an open cone (tip down), additive, so it glows over the ghosts.
export function flameMaterial(height: number) {
  return new THREE.ShaderMaterial({
    uniforms: { uAlpha: { value: 0 }, uTime: { value: 0 }, uH: { value: height } },
    vertexShader: `uniform float uH; varying float vAlong; varying float vAng; varying vec3 vN; varying vec3 vV;
      void main() {
        vAlong = clamp(0.5 - position.y / uH, 0.0, 1.0); // 0 at the nozzle, 1 at the tip
        vAng = atan(position.z, position.x);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform float uAlpha; uniform float uTime; varying float vAlong; varying float vAng; varying vec3 vN; varying vec3 vV;
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        float facing = abs(dot(normalize(vN), normalize(vV)));
        // Turbulence streaming away from the nozzle.
        vec2 q = vec2(vAng * 2.0, vAlong * 5.0 - uTime * 9.0);
        float turb = 0.55 * n(q) + 0.3 * n(q * 2.3 + 7.0) + 0.15 * n(q * 5.1 - 3.0);
        float body = pow(1.0 - vAlong, 1.6) * (0.55 + 0.75 * turb);
        float core = pow(facing, 3.0) * pow(1.0 - vAlong, 3.0); // the hot middle you look straight into
        vec3 col = mix(vec3(1.0, 0.42, 0.12), vec3(1.0, 0.78, 0.45), turb);
        col = mix(col, vec3(0.92, 0.96, 1.0), clamp(core * 1.6, 0.0, 1.0));
        gl_FragColor = vec4(col, clamp((body * 0.85 + core) * uAlpha, 0.0, 1.0));
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

// The dust the descent engine blasts sideways across the ground in the last few metres: thin radial streaks
// racing outward from under the lander. Lies flat on the ground.
function dustMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uAlpha: { value: 0 }, uTime: { value: 0 } },
    vertexShader: `varying vec2 vP; void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uAlpha; uniform float uTime; varying vec2 vP;
      float h(float x) { return fract(sin(x * 91.7) * 43758.5453); }
      void main() {
        float r = length(vP), a = atan(vP.y, vP.x);
        float k = floor((a + 3.14159) * 40.0); // 251 thin rays
        float ray = mix(0.25, 1.0, h(k)) * smoothstep(0.5, 0.0, abs(fract((a + 3.14159) * 40.0) - 0.5) - 0.15);
        float flow = 0.5 + 0.5 * sin(r * 1.8 - uTime * 14.0 + h(k + 3.0) * 6.28);
        float fade = smoothstep(0.3, 1.5, r) * (1.0 - smoothstep(3.0, 13.0, r));
        gl_FragColor = vec4(vec3(0.82, 0.79, 0.74), ray * (0.35 + 0.65 * flow) * fade * uAlpha * 1.1);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
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

// Transparent so it draws after everything else, including see-through things like stars and Saturn's rings.
const depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false, transparent: true });
export function shell(root: THREE.Object3D) {
  const list: THREE.Mesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && !(o as THREE.Mesh).userData.depthCopy) list.push(o as THREE.Mesh);
  });
  for (const m of list) {
    const d = new THREE.Mesh(m.geometry, depthOnly);
    d.userData.depthCopy = true;
    // Only block what's behind while this ghost is actually showing (a faded-out ghost leaves no silhouette).
    const ghostMat = m.material as THREE.ShaderMaterial;
    d.onBeforeRender = () => {
      depthOnly.depthWrite = (ghostMat.uniforms?.uAlpha?.value ?? 1) > 0.02;
    };
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
const AUDIO_LATE = 0.5; // a recording that can't start within this long of AUDIO_AT is dropped (captions carry on)

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
    // Descent engine plume (an outer glow and a tighter, longer inner jet) and the dust sheet it kicks up.
    const landFlame = new THREE.Group();
    const plumeOuter = new THREE.Mesh(new THREE.ConeGeometry(0.75, 3.2, 32, 8, true).rotateX(Math.PI), flameMaterial(3.2));
    const plumeInner = new THREE.Mesh(new THREE.ConeGeometry(0.38, 4.2, 32, 8, true).rotateX(Math.PI), flameMaterial(4.2));
    plumeOuter.position.y = -1.6 + 0.1;
    plumeInner.position.y = -2.1 + 0.1;
    landFlame.add(plumeOuter, plumeInner);
    landFlame.position.set(0, 0.35, 0); // the engine bell's exit, so the flame starts right at the nozzle
    const dust = new THREE.Mesh(new THREE.CircleGeometry(14, 64).rotateX(-Math.PI / 2), dustMaterial());
    dust.position.y = 0.06;
    // Engine flame at liftoff.
    const flameMat = flameMaterial(2.6);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.55, 2.6, 32, 8, true).rotateX(Math.PI), flameMat);
    flame.position.set(0, 2.2 - 1.3, 0);
    // Neil and Buzz get a fuller ghost: on the ladder they are seen against the bright gold foil.
    const suitMat = ghostMaterial("#9fd8ff", 0.4, THREE.NormalBlending);
    const neil = suited(suit.scene, suitMat), buzz = suited(suit.scene, suitMat);
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
    neilBox.material = buzzBox.material = suitMat;
    neil.armR.add(neilBox);
    buzz.armR.add(buzzBox);
    const root = new THREE.Group();
    root.add(ascent, neil.g, buzz.g, flag, landing);
    shell(root);
    // Added after shell(): glowing exhaust and dust get no depth copies, so they never hide what's behind them.
    landing.add(landFlame);
    ascent.add(flame);
    root.add(dust);
    const plumes = [plumeOuter.material, plumeInner.material] as THREE.ShaderMaterial[];
    return { root, mat, suitMat, flameMat, ascent, flame, neil, buzz, flag, landing, landMat, landFlame, plumes, dust, neilBox, buzzBox };
  }, [gltf, suit, spec]);
  useEffect(
    () => () => {
      scene.mat.dispose();
      scene.suitMat.dispose();
      scene.flameMat.dispose();
      live.replayLook = null;
      scene.landMat.dispose();
      scene.plumes.forEach((m) => m.dispose());
      (scene.dust.material as THREE.Material).dispose();
      live.hideMachine = false;
    },
    [scene],
  );

  const t0 = useRef(-1);
  const audio = useRef<HTMLAudioElement | null>(null);
  const cues = useRef<Cue[]>(A11_LINES);
  const shown = useRef("");
  const heard = useRef({ pos: -1, at: 0 }); // the radio's last position and when it got there (replay clock)
  useEffect(() => {
    if (!on) return;
    t0.current = -1;
    cues.current = A11_LINES;
    let cancelled = false;
    // Real air-to-ground radio, if it shipped: its cue times replace the fallback captions for the ladder part.
    loadMedia().then((m) => {
      const r = (m as Record<string, { file?: string; cues?: Cue[]; seconds?: number }>)["apollo11-replay"];
      if (cancelled || !r?.file || !/^media\/[\w.-]+$/.test(r.file)) return;
      // Arrived too late to start with the ladder: keep the narrator's captions rather than a radio out of step.
      if (t0.current >= 0 && replayClock() - t0.current - LAND > AUDIO_AT + AUDIO_LATE) return;
      const a = mediaSound(new Audio("/" + r.file));
      audio.current = a;
      if (r.cues?.length) {
        // The radio's own lines while it plays; the narrator's lines that fall during it wait until it's over.
        const radio = r.cues.map((c) => ({ ...c, at: c.at + AUDIO_AT }));
        const over = AUDIO_AT + (r.seconds ?? radio[radio.length - 1].at - AUDIO_AT + 3);
        const after = A11_LINES.filter((c) => c.at > 14).map((c) => ({ ...c, at: Math.max(c.at, over) }));
        cues.current = [...A11_LINES.filter((c) => c.at < AUDIO_AT), ...radio, ...after];
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
    live.hideMachine = !s.revealed.includes(stop.id) && !(on && t0.current >= 0 && replayClock() - t0.current >= LAND);
    scene.root.visible = on;
    if (!on) return;
    const a = audio.current;
    if (s.replayPaused) {
      a?.pause(); // paused: everything holds still, the radio too
      return;
    }
    if (t0.current < 0) t0.current = replayClock();
    // While the radio plays, the scene runs on the recording's clock, so the captions (and Neil's step) land
    // exactly on the words you hear, however long it took to load or if it stalled.
    if (a && !a.ended && !a.paused) {
      const now = replayClock();
      if (a.currentTime !== heard.current.pos) heard.current = { pos: a.currentTime, at: now };
      else if (now - heard.current.at > 1.5) {
        // Stuck (buffering that never ends, no sound device): carry on without it rather than freeze the scene.
        a.pause();
        audio.current = null;
      }
      if (audio.current) t0.current = now - LAND - AUDIO_AT - a.currentTime;
    }
    let t = replayClock() - t0.current - LAND; // 0 = touchdown
    if (a && audio.current && !a.ended && a.paused && t >= AUDIO_AT) {
      if (a.currentTime === 0 && t > AUDIO_AT + AUDIO_LATE) audio.current = null; // never started: carry on without it
      else {
        // Start (or resume) the radio, holding the scene at the moment it picks up from.
        t = AUDIO_AT + a.currentTime;
        t0.current = replayClock() - LAND - t;
        a.play().catch(() => {
          audio.current = null;
        });
      }
    }

    // The landing: the whole lander drifts down on its engine and settles, then the real one takes its place.
    const d = Math.min(1, Math.max(0, (t + LAND) / LAND));
    scene.landing.visible = t < 0.6;
    scene.landing.position.y = 10 * Math.pow(1 - d, 2.2);
    scene.landing.rotation.y = (1 - d) * 0.35;
    // Watch Eagle come down, then ease back to the site view. The aim sits halfway between eye level and the lander,
    // so the ground stays in the bottom of the frame instead of a screen of black sky.
    live.replayLook = t < 1.5 ? [0, 1.7 + (scene.landing.position.y + 2.5 - 1.7) * 0.5, 0] : null;
    scene.landMat.uniforms.uAlpha.value = smooth(-LAND, -LAND + 1.2, t) * (1 - smooth(-0.2, 0.6, t));
    // The plume flickers and breathes; Armstrong throttled down as he hovered, and it cut at "contact light".
    const burn = t < -0.3 ? 1 : 0;
    const now = state.clock.elapsedTime;
    scene.plumes.forEach((m, i) => {
      m.uniforms.uTime.value = now + i * 1.7;
      m.uniforms.uAlpha.value = burn * smooth(-LAND, -LAND + 1.2, t) * (0.85 + 0.15 * Math.sin(now * 23 + i * 2));
    });
    // Near the ground the jet has no room: it shortens and splays out instead of poking through the surface.
    const room = Math.min(1, Math.max(0.06, (scene.landing.position.y + 0.45) / 4.3));
    const spread = 1 + (1 - room) * 0.9;
    scene.landFlame.scale.set(spread, room * (0.9 + 0.12 * Math.sin(now * 17) + 0.06 * Math.sin(now * 41)), spread);
    scene.landFlame.visible = burn > 0;
    // Dust starts streaming out once the engine is within about 6 m of the ground, strongest just before touchdown.
    const dustMat = scene.dust.material as THREE.ShaderMaterial;
    dustMat.uniforms.uTime.value = now;
    dustMat.uniforms.uAlpha.value = t < 0.4 ? (1 - smooth(1.5, 6, scene.landing.position.y)) * (1 - smooth(-0.3, 0.4, t)) : 0;
    scene.dust.visible = dustMat.uniforms.uAlpha.value > 0.001;

    // Overall fade in and out.
    const alpha = smooth(0, 1.5, t) * (1 - smooth(A11_END - 2.5, A11_END, t));
    scene.mat.uniforms.uAlpha.value = scene.suitMat.uniforms.uAlpha.value = alpha;

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
      // Hands on the two side rails out in front (the ladder leans away up the leg), sliding one then the other
      // along the rail with the opposite foot, never waving free.
      const reachL = -1.45 - 0.22 * Math.max(0, -c), reachR = -1.45 - 0.22 * Math.max(0, c);
      pose(who, -0.45 - 0.45 * Math.max(0, c), -0.45 - 0.45 * Math.max(0, -c), 0.9 + 0.5 * Math.max(0, c), 0.9 + 0.5 * Math.max(0, -c), reachL, reachR, -0.3 + 0.15 * Math.max(0, c), -0.3 + 0.15 * Math.max(0, -c), 0.16);
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
    const cueAt = (re: RegExp, fallback: number) => cues.current.find((c) => re.test(c.text))?.at ?? fallback;
    const tFoot = cueAt(/foot of the ladder/i, 6.5), tSmall = cueAt(/small step/i, 10);
    const pad = [lad.from[0], lad.from[2] + 0.38] as const;
    if (t < tFoot) onLadder(scene.neil, 3, tFoot, false);
    else if (t < tSmall + 3.2) {
      // On the footpad, then the step: left foot reaches down and forward onto the Moon as he says the line.
      const st = smooth(tSmall - 0.5, tSmall + 0.4, t);
      const x = pad[0], z = pad[1] + (foot[1] - pad[1]) * st;
      scene.neil.g.position.set(x, ground(x, z) + 0.3 * (1 - st), z);
      face(scene.neil, 0);
      const reach = Math.sin(Math.PI * st);
      pose(scene.neil, -0.55 * reach, 0.15 * reach, 0.25 * reach, 0.45 * reach, -0.2, -0.2, -0.5, -0.5, 0.2);
    } else if (t < 25) walk(scene.neil, foot, neilAt, tSmall + 3.2, tSmall + 7.6);
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
    // The top half only exists from touchdown on: before that its invisible depth copies (see shell()) would cut its
    // outline out of the whole lander coming down through the same spot.
    scene.ascent.visible = t > 0.05;
    const lift = Math.max(0, t - 38.5);
    scene.ascent.position.y = 0.5 * 2.2 * lift * lift;
    scene.flame.visible = lift > 0 && lift < 4;
    scene.flameMat.uniforms.uAlpha.value = lift > 0 ? (0.85 + 0.15 * Math.sin(t * 23)) * alpha : 0;
    scene.flameMat.uniforms.uTime.value = state.clock.elapsedTime;
    scene.flame.scale.set(1, 0.9 + 0.12 * Math.sin(t * 17), 1);

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
    if (t >= A11_END) endReplay(stop.id);
  });

  return <primitive object={scene.root} />;
}
