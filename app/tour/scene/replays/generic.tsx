"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { reducedMotion } from "../../lib/device";
import { skyDir } from "../../lib/geo";
import { useStore } from "../../lib/store";
import { endReplay, live, replayClock, setCaption, tour } from "../../state";
import type { Stop } from "../../stops";
import { dustMaterial, flameMaterial, ghostMaterial, shell, smooth, suited } from "../Ghost";
import { prepareModel, type GltfSpec } from "../Machine";
import { useModel } from "../useModel";
import { disposeSprite, glowSprite } from "./cassini";
import { ownScene } from "./own";
import { buildSoundtrack, useSoundtrack } from "./sound";

// "What happened here" for every site without a hand-made replay (the six story stops have their own, see index.tsx).
// A ghost of the machine arrives the way that kind of machine did, while its story is told in the site file's own
// words (stop.replay.cues, built in sites.ts), then it hands over to what is there today:
//   dive   an impactor or crash comes in along its path over ground that has no crater yet, and hits: a flash,
//          soil thrown out in rays, and the crater and wreckage are there. Then the see-through model appears over
//          the crater, the machine as it was a moment before
//   land   a lander comes down from the sky onto its spot. Rocket landers ride an engine plume that blows dust
//          across the ground; Mars Pathfinder bounces in inside its airbags; a discarded backshell tumbles down.
//          A lunar module lands whole, and later its top half lifts off and leaves the bottom half behind
//   drive  a rover rolls up, a stretch at a time, to where it stopped for good
//   place  an experiment an astronaut carried out and set down
//   fly    a spacecraft sails in from far off
// A working machine sends out radio rings (if it had a radio: a mirror or a discarded shell did not) and its glow
// pulses. Each machine has scenes of its own, from its site file: on the line that tells what it did here, that
// part lights up blue and the view turns to it; a real photo of it comes up beside the story with its caption;
// and on the line that tells what gave out, the part that failed (the site's "broken" hotspot) lights up red,
// then the rings stop and the glow dims and steadies. A machine that still works keeps signalling to the end.
// On top of that each machine has a scene made for it alone (own.ts, and here: a rover's wheel tracks, Surveyor
// 6's hop, Sojourner rolling off Mars Pathfinder, the backshell's parachute), chosen in its site file.
// Each replay has an effects track made from the same timeline (sound.ts).

const START = 0.4;
const outCubic = (u: number) => 1 - (1 - u) ** 3;

// Which way each rover model's front points once placed (radians about y, 0 = +z), so it drives in nose first.
// (The Moon rover's file is turned a quarter turn when placed, and its front, with the dish antenna, ends up on -x.)
const FRONT: Record<string, number> = { mer: 0, curiosity: 0, perseverance: 0, sojourner: 0, "lrv-team": -Math.PI / 2 };
const BOUNCES = 5.5; // Pathfinder's airbags: this many bounces across the ground before it rolls to a stop
const RINGS = 3;
const DIVE_FROM = new THREE.Vector3(0.5, 0.78, -0.37).normalize();
const FLY_FROM = new THREE.Vector3(-0.7, 0.2, -0.7).normalize();
const LIFT = 5.5; // seconds a lunar module's top half takes to climb out of sight
const SEGS = 48; // pieces in a rover's wheel tracks
const HOP = 2.4; // metres Surveyor 6 moved west when it hopped

export function GenericReplay({ stop, ground }: { stop: Stop; ground?: (x: number, z: number) => number }) {
  const on = useStore(tour, (s) => s.replay);
  const spec = stop.model as GltfSpec;
  const plan = stop.replay!;
  const gltf = useModel(spec.url);
  const bounce = plan.effect === "bounce";
  const arrive = bounce ? 9 : { dive: 5, land: 7, drive: 8.5, place: 6.5, fly: 7 }[plan.kind];

  const scene = useMemo(() => {
    const mat = ghostMaterial("#9fd8ff", 0.14);
    const owned: { dispose(): void }[] = [mat];
    // The machine as it was, placed exactly like the real one (or like the see-through model, for one that is gone).
    // A lunar module came down whole: its top half, which later flew the crew home, is in the replay too.
    const whole = spec.hideAbove !== undefined && plan.kind === "land";
    const made = prepareModel(gltf.scene, { ...spec, ghost: false, at: undefined, hideAbove: whole ? undefined : spec.hideAbove }, stop.hotspots);
    const object = made.object;
    const list: THREE.Mesh[] = [];
    object.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || m.name === "_root") return;
      m.material = mat;
      m.castShadow = m.receiveShadow = false;
      list.push(m);
    });
    const box = new THREE.Box3().setFromObject(object);
    const dims = box.getSize(new THREE.Vector3());
    const size = dims.length() || 3;
    const mid = box.getCenter(new THREE.Vector3());
    const mover = new THREE.Group();
    mover.add(object);
    const root = new THREE.Group();
    root.add(mover);
    // A lunar module's top half, as a piece of its own, so it can lift off and leave.
    let ascent: THREE.Group | null = null;
    let ascentMat: THREE.ShaderMaterial | null = null;
    let seam = 0;
    if (whole) {
      root.updateMatrixWorld(true);
      ascent = new THREE.Group();
      ascentMat = ghostMaterial("#9fd8ff", 0.14);
      owned.push(ascentMat);
      mover.add(ascent);
      seam = spec.hideAbove! * made.model.scale.x + made.model.position.y; // where the two halves meet, in metres
      const b = new THREE.Box3();
      for (const m of list)
        if (b.setFromObject(m).max.y > seam || m.name === "pSphere28") {
          m.material = ascentMat;
          ascent.attach(m);
        }
    }
    // Pathfinder's ball of airbags, which the lander rides inside.
    let airbag: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial> | null = null;
    if (plan.effect === "bounce") {
      airbag = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18), ghostMaterial("#e8f4ff", 0.3, THREE.NormalBlending));
      root.add(airbag);
      owned.push(airbag.geometry, airbag.material);
    }
    // A parachute over a shell that came down on one: it sags flat as the shell reaches the ground.
    let chute: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial> | null = null;
    if (plan.own?.kind === "chute") {
      chute = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), ghostMaterial("#ffd9b0", 0.3, THREE.NormalBlending));
      root.add(chute);
      owned.push(chute.geometry, chute.material);
    }
    shell(root);
    // Added after shell(): glowing exhaust, dust, flashes and radio rings get no depth copies, so they never hide
    // what is behind them.
    const jet = (width: number, height: number) => {
      const group = new THREE.Group();
      const flames: THREE.ShaderMaterial[] = [];
      for (const [r, len] of [[width, height], [width * 0.53, height * 1.3]] as const) {
        const fm = flameMaterial(len);
        const cone = new THREE.Mesh(new THREE.ConeGeometry(r, len, 28, 8, true).rotateX(Math.PI), fm);
        cone.position.y = -len / 2;
        group.add(cone);
        flames.push(fm);
        owned.push(fm, cone.geometry);
      }
      return { group, flames };
    };
    // A rocket lander's engine plume (an outer glow and a tighter inner jet), sized to the lander.
    const w = Math.max(dims.x, dims.z);
    const plume = plan.effect === "plume" ? jet(w * 0.085, Math.max(1.4, w * 0.42)) : null;
    if (plume) {
      plume.group.position.set(mid.x, Math.max(0.15, dims.y * 0.12), mid.z); // just under the body, where the engines are
      mover.add(plume.group);
    }
    // The top half's own engine, for its lift-off.
    const liftJet = ascent ? jet(0.4, 2.2) : null;
    if (liftJet && ascent) {
      liftJet.group.position.set(mid.x, seam + 0.1, mid.z);
      ascent.add(liftJet.group);
    }
    // Dust blown across the ground by a plume, or soil thrown out in rays by an impact.
    let dust: THREE.Mesh<THREE.CircleGeometry, THREE.ShaderMaterial> | null = null;
    if (plan.effect === "plume" || plan.kind === "dive") {
      // (The disc is turned flat as a mesh, not in its geometry: the shader draws its rays from the disc's own x and y.)
      dust = new THREE.Mesh(new THREE.CircleGeometry(14, 64), dustMaterial());
      dust.rotation.x = -Math.PI / 2;
      root.add(dust);
      owned.push(dust.geometry, dust.material);
    }
    const glow = (color: string) => {
      const g = glowSprite(color); // a soft ball of light, bright in the middle
      g.visible = false;
      root.add(g);
      owned.push({ dispose: () => disposeSprite(g) });
      return g;
    };
    // The flash of an impact.
    const flash = plan.kind === "dive" ? glow("#fff1d6") : null;
    // A light on one part of the machine, where a hotspot of the site points: blue on the part that shows what it
    // did here, red on the part that gave out (the "broken" hotspot). A hotspot on a part of the model moves with
    // the machine; one at a fixed place (a crater, wreckage on the ground) stays put.
    const mark = (id: string | undefined, color: string) => {
      const spot = id ? stop.hotspots.find((h) => h.id === id) : undefined;
      return spot && made.anchors[spot.id] ? { glow: glow(color), at: made.anchors[spot.id].clone(), fixed: "pos" in spot.anchor, onGround: "pos" in spot.anchor && !!spot.anchor.ground } : null;
    };
    const fault = mark(plan.fault?.spot, "#ff3b1f");
    const work = mark(plan.work?.spot, "#7fd0ff");
    // Radio rings: the machine talking to Earth.
    const rings: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>[] = [];
    if (plan.kind !== "dive" && plan.signal) {
      const geo = new THREE.RingGeometry(0.955, 1, 64);
      owned.push(geo);
      for (let i = 0; i < RINGS; i++) {
        const ring = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: "#9fd8ff", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
        ring.renderOrder = 1001;
        ring.visible = false;
        root.add(ring);
        rings.push(ring);
        owned.push(ring.material);
      }
    }
    // The machine's own scene (own.ts), at the hotspot it is about.
    const known = plan.own?.spot ? stop.hotspots.find((h) => h.id === plan.own!.spot) : undefined;
    const ownAt = known && made.anchors[known.id] ? { at: made.anchors[known.id].clone(), fixed: "pos" in known.anchor, onGround: "pos" in known.anchor && !!known.anchor.ground } : null;
    const sky = stop.setting.earth ? skyDir(stop.setting.earth.az, stop.setting.earth.el) : new THREE.Vector3(0.25, 0.9, -0.35).normalize();
    const own = plan.own ? ownScene(plan.own.kind, { size, crater: stop.setting.crater ?? 0, sky, out: plan.own.out, hole: plan.own.hole }) : null;
    if (own) {
      root.add(own.root);
      owned.push(own);
    }
    // A light on the hotspot, for the scenes that are played by the machine itself (a hop, tracks, a parachute).
    const ownGlow = plan.own && ["hop", "rolloff", "chute", "tracks", "crew"].includes(plan.own.kind) ? glow("#7fd0ff") : null;
    // The wheel tracks a rover leaves on its drive: two ruts, laid as it goes.
    let tracks: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | null = null;
    if (plan.kind === "drive") {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array((SEGS + 1) * 4 * 3), 3));
      const index: number[] = [];
      for (let i = 0; i < SEGS; i++)
        for (const rut of [0, 2]) {
          const a = i * 4 + rut;
          index.push(a, a + 1, a + 4, a + 1, a + 5, a + 4);
        }
      geo.setIndex(index);
      tracks = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, fog: false }));
      tracks.frustumCulled = false;
      tracks.renderOrder = 2;
      root.add(tracks);
      owned.push(geo, tracks.material);
    }
    return { root, mover, mat, size, dims, mid, airbag, plume, dust, flash, fault, work, rings, ascent, ascentMat, liftJet, chute, own, ownAt, ownGlow, tracks, owned };
  }, [gltf, spec, plan, stop]);
  useEffect(
    () => () => {
      scene.owned.forEach((x) => x.dispose());
      live.hideMachine = false;
      live.replayLook = null;
      live.replayView = null;
    },
    [scene],
  );

  // When each line of the story comes up, and when its events happen. (Where things are is worked out every frame,
  // from the ground as it is then: an impact site's ground changes when the machine hits.)
  const time = useMemo(() => {
    const cues: { at: number; until: number; text: string }[] = [];
    let at = 0;
    for (const c of plan.cues) {
      cues.push({ at, until: at + c.secs, text: c.text });
      at += c.secs;
    }
    const arrived = START + arrive;
    // The present day takes over as the last line begins; after an impact, as soon as the flash has cleared.
    const reveal = plan.kind === "dive" ? arrived + 1.5 : Math.max(arrived + 2, cues[cues.length - 1]?.at ?? 0);
    // A scene on a line of the story starts once the machine is here (and, after an impact, once it is drawn again).
    const here = plan.kind === "dive" ? reveal + 0.8 : arrived + 0.5;
    const scene = (cue: number | undefined) => (cue !== undefined && cues[cue] && cues[cue].until > here + 1.5 ? { at: Math.max(cues[cue].at, here), until: cues[cue].until } : null);
    const fault = scene(plan.fault?.cue);
    const work = scene(plan.work?.cue);
    const own = scene(plan.own?.cue);
    const photo = plan.photo && cues[plan.photo.cue] ? { at: cues[plan.photo.cue].at, until: cues[plan.photo.cue].until } : null;
    // With real footage of the lift-off beside it, the top half leaves when it leaves in the footage.
    const liftCue = plan.liftoff !== undefined ? cues[plan.liftoff] : undefined;
    const lift = liftCue ? Math.max(liftCue.at + (plan.liftShot?.lead ?? 0.6), arrived + 2) : Infinity;
    const liftShot = plan.liftShot && liftCue ? { at: liftCue.at, until: liftCue.until } : null;
    // While footage plays its own real sound, the effects made in code drop right down.
    const hush: [number, number][] = [];
    if (photo && plan.photo?.sound) hush.push([photo.at, photo.until]);
    if (liftShot && plan.liftShot?.sound) hush.push([liftShot.at, plan.liftShot.soundFor !== undefined ? liftShot.at + plan.liftShot.soundFor : liftShot.until]);
    // A lunar module's bottom half is what is left today: it shows once the top half has gone.
    const present = Math.max(reveal, lift === Infinity ? 0 : lift + LIFT - 1);
    return { cues, arrived, reveal: present, total: Math.max(at, present + 3), quiet: cues[plan.quiet]?.at ?? Infinity, fault, work, own, photo, lift, liftShot, hush };
  }, [plan, arrive]);

  const t0 = useRef(-1);
  const shown = useRef("");
  const calm = useRef(false);
  const pictured = useRef("");
  type View = { pos: [number, number, number]; look: [number, number, number] };
  const views = useRef<{ near: View; far: View } | null>(null);
  // The effects track for this replay (sound.ts), built from the same timeline.
  const sound = useSoundtrack(
    on,
    () =>
      buildSoundtrack({
        total: time.total,
        kind: plan.kind,
        effect: plan.effect,
        start: START,
        arrived: time.arrived,
        bounces: BOUNCES,
        signal: plan.signal && plan.kind !== "dive" ? { from: time.arrived + 0.8, until: plan.working ? time.total - 0.5 : Math.min(time.quiet, time.total - 1), lost: !plan.working } : undefined,
        fault: time.fault?.at,
        work: time.work?.at,
        liftoff: time.lift === Infinity ? undefined : time.lift,
        own: time.own && plan.own ? { at: time.own.at, span: time.own.until - time.own.at, kind: plan.own.kind } : undefined,
        hush: time.hush,
        handover: time.cues[time.cues.length - 1]?.at,
      }),
    time.total,
  );
  useEffect(() => {
    if (!on) return;
    if (process.env.NODE_ENV !== "production")
      // For checking a replay from the console while developing: what it will do, and a way to jump to a moment.
      Object.assign(window, {
        __replay: { id: stop.id, kind: plan.kind, effect: plan.effect ?? null, cues: plan.cues.length, seconds: +time.total.toFixed(1), working: plan.working, arrived: time.arrived, reveal: +time.reveal.toFixed(1), fault: time.fault ? +time.fault.at.toFixed(1) : null, work: time.work ? +time.work.at.toFixed(1) : null, photo: time.photo ? +time.photo.at.toFixed(1) : null, film: plan.photo?.video ?? null, filmSound: !!plan.photo?.sound, liftFilm: plan.liftShot?.video ?? null, own: time.own && plan.own ? { kind: plan.own.kind, at: +time.own.at.toFixed(1), until: +time.own.until.toFixed(1), spot: plan.own.spot ?? null, placed: !!scene.ownAt } : null, lift: time.lift === Infinity ? null : +time.lift.toFixed(1) },
        // (Never before the clock's own zero: a negative start means "not started yet" and would begin it again.)
        __replaySeek: (to: number) => void (t0.current = Math.max(0.001, replayClock() - to)),
      });
    t0.current = -1;
    // As in the hand-made replays, "reduce motion" keeps the story moving but stops the glow from pulsing.
    calm.current = reducedMotion();
    // You watch from where you arrive, which already frames the machine (or its ghost over the crater). A landing
    // is watched from farther back, looking a little higher, so the lander is in view for more of its way down.
    const [x, y, z] = stop.spawn.pos;
    views.current = { near: { pos: stop.spawn.pos, look: stop.spawn.look }, far: { pos: [x * 1.8, y, z * 1.8], look: [0, Math.max(stop.spawn.look[1], scene.size * 0.45), 0] } };
    live.replayView = plan.kind === "land" ? views.current.far : views.current.near;
    return () => {
      live.replayLook = null;
      live.replayView = null;
      shown.current = "";
      pictured.current = "";
      if (tour.get().replayShot) tour.set({ replayShot: null });
      setCaption("", 0);
    };
  }, [on, stop, plan, scene, time]);

  const v = useMemo(() => ({ p: new THREE.Vector3(), end: new THREE.Vector3(), from: new THREE.Vector3(), hit: new THREE.Vector3(), f: new THREE.Vector3(), o: new THREE.Vector3(), c: new THREE.Vector3() }), []);
  useFrame((state) => {
    const s = tour.get();
    const started = t0.current >= 0;
    const t = started ? replayClock() - t0.current : 0;
    // The real machine (or the see-through one) stays hidden until the replay reaches the present day.
    live.hideMachine = !s.revealed.includes(stop.id) && !(on && started && t >= time.reveal);
    scene.root.visible = on;
    if (!on) return;
    sound(started ? t : -1, s.replayPaused);
    if (s.replayPaused) return; // paused: everything holds still, the sound too
    if (!started) t0.current = replayClock();

    const u = Math.min(1, Math.max(0, (t - START) / arrive));
    const since = t - time.arrived; // seconds since it got here (negative on the way)
    const gh = (x: number, z: number) => (ground ? ground(x, z) : 0);
    // Where it ends up, and where it starts from.
    const { p, end, from, hit } = v;
    end.set(...(spec.at ?? [0, 0, 0]));
    if (spec.at && ground) end.y += Math.max(0, gh(end.x, end.z));
    const reach = Math.max(scene.size, 2);
    const yaw = FRONT[spec.url.replace(/^.*\//, "").replace(/\.gltf\.json$/, "")] ?? 0; // which way a rover faces
    // An impact ends on the ground where its crater will be, not at the see-through model that will hang above it.
    hit.set(0, Math.max(0, gh(0, 0)), 0);
    from.copy(end);
    if (plan.kind === "dive") from.copy(hit).addScaledVector(DIVE_FROM, Math.max(90, reach * 10));
    else if (bounce) from.set(end.x - 26, end.y, end.z - 9);
    else if (plan.kind === "land") from.y += Math.max(16, reach * 5);
    else if (plan.kind === "fly") from.addScaledVector(FLY_FROM, Math.max(60, reach * 12));
    else if (plan.kind === "place") from.y += 0.5;
    else {
      const far = Math.max(14, reach * 4.5);
      from.x -= Math.sin(yaw) * far;
      from.z -= Math.cos(yaw) * far;
    }

    let k = outCubic(u);
    if (plan.kind === "dive") {
      // Faster and faster, all the way into the ground.
      k = u ** 1.7;
      p.lerpVectors(from, hit, k);
      // The moment it hits, the site becomes what it is today: the crater and the wreckage are there (Surface.tsx
      // rebuilds the ground under the flash), and the see-through model fades in above them.
      if (since >= 0 && !s.revealed.includes(stop.id)) tour.set({ revealed: [...s.revealed, stop.id] });
    } else if (bounce) {
      // Across the ground in shrinking bounces (the real first bounce was about 15 m high), then a roll to a stop.
      k = 1 - (1 - u) ** 2;
      p.lerpVectors(from, end, k);
      p.y = end.y + (gh(p.x, p.z) - gh(end.x, end.z)) * (1 - k) + 12 * Math.abs(Math.cos(u * Math.PI * BOUNCES)) * (1 - u) ** 1.5;
    } else if (plan.kind === "drive") {
      // A time-lapse of the drive: a stretch, a pause, another stretch, following the ground it rolls over.
      const hops = 4;
      const i = Math.min(hops - 1, Math.floor(u * hops));
      k = (i + smooth(0, 0.72, u * hops - i)) / hops;
      p.lerpVectors(from, end, k);
      if (ground) p.y = end.y + (ground(p.x, p.z) - ground(end.x, end.z)) * (1 - k);
    } else p.lerpVectors(from, end, k);
    // Surveyor 6's hop: on its line it fires its engines, rises a few metres and comes down 2.4 m to the west,
    // where it stands today. Until then it sits where it first landed.
    let hopping = 0;
    if (plan.own?.kind === "hop") {
      const h = time.own ? Math.min(1, Math.max(0, (t - time.own.at - 0.8) / 2.6)) : 1;
      p.x += HOP * (1 - smooth(0, 1, h));
      p.y += 3.5 * Math.sin(Math.PI * h);
      hopping = h > 0 && h < 0.88 ? 1 : 0;
    }
    // Once a lander is down you move in to where you arrive, close enough to see its parts and its crew; and back
    // out again to watch a lunar module's top half leave.
    if (plan.kind === "land" && views.current) live.replayView = since > 1.2 && !(t > time.lift - 1.5 && t < time.lift + LIFT) ? views.current.near : views.current.far;
    scene.mover.position.copy(p);
    // A discarded backshell comes to rest as it lies today: swinging under its parachute if it has one in the
    // replay, tumbling if not.
    if (scene.chute) scene.mover.rotation.set(0.22 * Math.sin(t * 1.7) * (1 - k), 0, 0.3 * Math.sin(t * 1.3) * (1 - k));
    else if (plan.effect === "tumble") scene.mover.rotation.set((1 - k) * 5.2, 0, (1 - k) * 3.1);

    // The glow: fades in as it appears, pulses while the machine is alive, steadies and dims once it goes quiet,
    // and hands over to the present day.
    const alive = plan.working ? 1 : 1 - smooth(time.quiet - 0.5, time.quiet + 1, t);
    const pulse = calm.current ? 1 : 1 + 0.16 * Math.sin(t * 2.6) * alive;
    let appear = plan.kind === "place" ? smooth(0.75, 1, u) : smooth(0, 1.2, t);
    if (bounce) appear = smooth(0.3, 1.8, since); // the lander shows once its airbags have let the air out
    const handover = plan.kind === "dive" ? (since < 0 ? 1 : 0) : 1 - smooth(time.reveal, time.reveal + 1.2, t);
    const body = appear * pulse * (1 - 0.4 * (1 - alive)) * handover;
    scene.mat.uniforms.uAlpha.value = body;
    scene.mover.visible = plan.kind === "dive" ? since < 0 : t < time.reveal + 1.3;

    if (scene.ascent && scene.ascentMat && scene.liftJet) {
      // The top half fires its own engine and climbs away, leaving the bottom half as its launch pad.
      const up = t - time.lift;
      scene.ascent.position.y = up > 0 ? 0.85 * up * up : 0;
      scene.ascentMat.uniforms.uAlpha.value = appear * pulse * handover * (1 - smooth(LIFT - 2, LIFT, up));
      const burn = smooth(0, 0.25, up) * (1 - smooth(LIFT - 2, LIFT - 0.5, up));
      for (const f of scene.liftJet.flames) {
        f.uniforms.uAlpha.value = burn;
        f.uniforms.uTime.value = t;
      }
      scene.liftJet.group.visible = burn > 0.01;
      scene.ascent.visible = up < LIFT;
    }
    if (scene.airbag) {
      // The ball of airbags carries the lander in, then sags flat and is gone.
      const flat = smooth(0, 1.6, since);
      const r = Math.max(scene.dims.x, scene.dims.z) * 0.62;
      scene.airbag.position.set(p.x + scene.mid.x, p.y + r * (1 - 0.75 * flat), p.z + scene.mid.z);
      scene.airbag.scale.set(r * (1 + 0.25 * flat), r * (1 - 0.75 * flat), r * (1 + 0.25 * flat));
      scene.airbag.material.uniforms.uAlpha.value = smooth(0, 1.2, t) * (1 - smooth(0.6, 2, since));
      scene.airbag.visible = since < 2.1;
    }
    if (scene.plume) {
      // The engines burn all the way down and cut off at touchdown.
      const burn = Math.max(hopping, smooth(0, 0.6, t) * (1 - smooth(-0.25, 0.05, since)));
      for (const f of scene.plume.flames) {
        f.uniforms.uAlpha.value = burn;
        f.uniforms.uTime.value = t;
      }
      scene.plume.group.visible = burn > 0.01;
    }
    if (scene.dust) {
      if (plan.kind === "dive") {
        // Soil thrown out in rays from the impact, racing outward and thinning.
        const reachR = Math.max(stop.setting.crater ?? 4, scene.size * 0.8);
        scene.dust.position.set(hit.x, Math.max(0, gh(hit.x, hit.z)) + 0.08, hit.z);
        scene.dust.scale.setScalar((reachR / 3.2) * (0.4 + 0.6 * smooth(0, 1.2, since)));
        scene.dust.material.uniforms.uAlpha.value = smooth(0, 0.15, since) * (1 - smooth(0.9, 3.4, since));
      } else {
        // Dust blown sideways along the ground in the last few metres, settling just after touchdown.
        scene.dust.position.set(end.x, end.y + 0.06, end.z);
        scene.dust.scale.setScalar(Math.max(0.5, Math.max(scene.dims.x, scene.dims.z) / 9));
        scene.dust.material.uniforms.uAlpha.value = smooth(0.72, 0.93, u) * (1 - smooth(0, 1.3, since));
      }
      scene.dust.material.uniforms.uTime.value = t;
      scene.dust.visible = scene.dust.material.uniforms.uAlpha.value > 0.005;
    }
    if (scene.flash) {
      // A flash that swells and is gone in under a second.
      const f = since / 0.9;
      scene.flash.visible = f >= 0 && f < 1;
      if (scene.flash.visible) {
        const reachR = Math.max(stop.setting.crater ?? 4, scene.size * 0.8);
        scene.flash.position.set(hit.x, Math.max(0, gh(hit.x, hit.z)) + reachR * 0.15, hit.z);
        scene.flash.scale.setScalar(reachR * (1.5 + 5.5 * outCubic(f)));
        scene.flash.material.opacity = (1 - f) ** 1.3;
      }
    }
    // The part that shows what it did lights up blue, and the part that gave out red, each while its line is told.
    let partLook: [number, number, number] | null = null;
    for (const [light, when, red] of [[scene.work, time.work, false], [scene.fault, time.fault, true]] as const) {
      if (!light || !when) continue;
      const into = t - when.at;
      const lit = smooth(0, 0.5, into) * smooth(0, 0.7, when.until - t);
      light.glow.visible = lit > 0.01;
      if (!light.glow.visible) continue;
      const f = v.f.copy(light.at);
      if (light.fixed) f.y += light.onGround ? gh(f.x, f.z) : 0;
      else f.add(plan.kind === "dive" ? end : p); // on the machine (after an impact: on the see-through model)
      light.glow.position.copy(f);
      light.glow.scale.setScalar(Math.min(7, Math.max(0.7, scene.size * (red ? 0.3 : 0.24))) * (calm.current ? 1 : 0.85 + 0.15 * Math.sin(t * (red ? 7 : 3.5))));
      light.glow.material.opacity = lit * (red ? 0.85 : 0.7);
      if (into < 3.4) partLook = [f.x, f.y, f.z];
    }
    if (scene.chute) {
      const down = smooth(-0.2, 1.4, since);
      // (Smaller than the real 21.5 m canopy and closer to the shell, so both stay in view.)
      const r = Math.min(6, scene.size * 0.3);
      scene.chute.position.set(p.x, p.y + r * 1.25 * (1 - down) + 0.2, p.z);
      scene.chute.scale.set(r * (1 + 0.3 * down), r * 0.7 * (1 - 0.85 * down), r * (1 + 0.3 * down));
      scene.chute.material.uniforms.uAlpha.value = smooth(0, 1.2, t) * (1 - smooth(0.4, 1.8, since));
      scene.chute.visible = since < 1.9;
    }
    if (scene.tracks) {
      const px = Math.cos(yaw);
      const pz = -Math.sin(yaw); // across the way it drives
      const across = Math.abs(px) * scene.dims.x + Math.abs(pz) * scene.dims.z;
      const gauge = across * 0.4;
      const rut = Math.max(0.04, across * 0.07);
      const pos = scene.tracks.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i <= SEGS; i++) {
        const cx = from.x + ((end.x - from.x) * i) / SEGS + scene.mid.x;
        const cz = from.z + ((end.z - from.z) * i) / SEGS + scene.mid.z;
        [-gauge - rut, -gauge + rut, gauge - rut, gauge + rut].forEach((off, j) => {
          const x = cx + px * off;
          const z = cz + pz * off;
          pos.setXYZ(i * 4 + j, x, gh(x, z) + 0.025, z);
        });
      }
      pos.needsUpdate = true;
      scene.tracks.geometry.setDrawRange(0, Math.floor(k * SEGS) * 12);
      scene.tracks.material.opacity = 0.36 * appear * handover;
      scene.tracks.visible = scene.tracks.material.opacity > 0.005;
    }
    // The machine's own scene, while its line is told.
    if (plan.own && time.own) {
      const into = t - time.own.at;
      const lit = smooth(0, 0.5, into) * smooth(0, 0.7, time.own.until - t);
      const centre = v.c.copy(plan.kind === "dive" ? end : p).add(scene.mid);
      const focus = v.o;
      if (scene.ownAt) {
        focus.copy(scene.ownAt.at);
        if (scene.ownAt.fixed) focus.y += scene.ownAt.onGround ? gh(focus.x, focus.z) : 0;
        else focus.add(plan.kind === "dive" ? end : p);
      } else focus.set(hit.x, hit.y + 1.5, hit.z - 40); // no hotspot of its own: off toward the horizon
      // Pictures, a laser link and grains come from (or to) the machine itself: a hotspot that floats away from it
      // (a note about its pictures, say) hands the scene to the machine.
      if (scene.ownAt?.fixed && ["pictures", "collect", "laser"].includes(plan.own.kind) && focus.distanceTo(centre) > scene.size * 0.75) focus.copy(centre);
      if (lit > 0.005) {
        scene.own?.update({ into, span: time.own.until - time.own.at, lit, t, focus, centre, hit, ground: gh, camera: state.camera, calm: calm.current });
        const kind = plan.own.kind;
        if (into < 3.4 || kind === "drop" || kind === "crew") {
          // Look where the scene is: up a laser beam or a plume, between an impact and whoever felt it.
          const between = (x: number, y: number, z: number): [number, number, number] => [(x + centre.x) / 2, (y + centre.y) / 2, (z + centre.z) / 2];
          if (kind === "plume") partLook = between(hit.x, hit.y + Math.min(14, Math.max(4, stop.setting.crater ?? 4)) * 1.2, hit.z);
          else if (kind === "quake" && plan.own.out) partLook = [(hit.x + focus.x) / 2, hit.y + 1, (hit.z + focus.z) / 2];
          else if (kind === "aim") partLook = [hit.x, hit.y, hit.z];
          else if (kind === "burn" || kind === "pulses") partLook = [centre.x, centre.y, centre.z];
          else if (kind === "tracks") partLook = [end.x + (from.x - end.x) * 0.1 + scene.mid.x, end.y, end.z + (from.z - end.z) * 0.1 + scene.mid.z]; // the rover, and the tracks behind it
          else if (kind === "crew") partLook = [focus.x * 0.7 + centre.x * 0.3, hit.y + 1.5, focus.z * 0.7 + centre.z * 0.3]; // the astronaut, with the lander still in view
          else if (kind === "drop") partLook = [focus.x + (focus.x - centre.x) * 0.9, hit.y, focus.z + (focus.z - centre.z) * 0.9]; // where the tubes are set down
          // A spot on the ground away from the machine: look between the two, so both are in view.
          else if (kind !== "hop" && kind !== "chute") partLook = scene.ownAt?.fixed ? between(focus.x, focus.y, focus.z) : [focus.x, focus.y, focus.z];
        }
      } else scene.own?.hide();
      if (scene.ownGlow) {
        scene.ownGlow.visible = lit > 0.01;
        if (plan.own.kind === "tracks") {
          // A light running along the tracks, from where the drive began to where it ended.
          const along = (into * 0.3) % 1;
          const x = from.x + (end.x - from.x) * along + scene.mid.x;
          const z = from.z + (end.z - from.z) * along + scene.mid.z;
          scene.ownGlow.position.set(x, gh(x, z) + 0.15, z);
        } else scene.ownGlow.position.copy(focus);
        scene.ownGlow.scale.setScalar(Math.min(7, Math.max(0.7, scene.size * 0.24)));
        scene.ownGlow.material.opacity = lit * 0.7;
      }
    } else scene.own?.hide();
    // A real photo comes up beside the story while its caption is the line being told.
    // (Real footage if the site has it, with its real sound; and a lunar module's real lift-off beside its lift-off.)
    const during = (w: { at: number; until: number } | null) => !!w && t >= w.at && t < w.until - 0.3;
    const shot = during(time.photo) ? plan.photo! : during(time.liftShot) ? plan.liftShot! : null;
    const began = during(time.photo) ? time.photo!.at : (time.liftShot?.at ?? 0);
    const key = shot ? (shot.video ?? shot.src) : "";
    if (key !== pictured.current) {
      pictured.current = key;
      tour.set({ replayShot: shot ? { src: shot.src, alt: shot.alt, credit: shot.credit, video: shot.video, sound: shot.sound, from: shot.from, soundFor: shot.soundFor, since: replayClock() - (t - began) } : null });
    }
    // Radio rings spread from the machine while it is talking to Earth.
    const talking = smooth(0, 0.8, since) * (plan.working ? 1 : alive);
    scene.rings.forEach((ring, i) => {
      const phase = (t * 0.5 + i / RINGS) % 1;
      ring.visible = talking > 0.01;
      if (!ring.visible) return;
      ring.position.set(end.x + scene.mid.x, end.y + scene.mid.y + scene.dims.y * 0.35, end.z + scene.mid.z);
      ring.quaternion.copy(state.camera.quaternion);
      ring.scale.setScalar(scene.size * (0.12 + 0.75 * phase));
      ring.material.opacity = talking * 0.55 * (1 - phase) ** 1.4;
    });

    // Follow it in while it is on its way (a dive from the sky, a spacecraft sailing in, a bouncing ball of airbags),
    // watch the impact, turn to the part that failed, and follow a lunar module's top half as it leaves.
    const follow = (plan.kind === "dive" && since < 0) || (plan.kind === "fly" && u < 0.97) || (bounce && u < 0.97);
    const up = t - time.lift;
    live.replayLook = follow
      ? [p.x + scene.mid.x, p.y + scene.mid.y, p.z + scene.mid.z]
      : plan.kind === "dive" && since < 1.5
        ? [hit.x, hit.y + 1, hit.z]
        : scene.ascent && up > 0 && up < LIFT
          ? [end.x + scene.mid.x, end.y + scene.mid.y + Math.min(9, scene.ascent.position.y * 0.6), end.z + scene.mid.z]
          : partLook;

    const cue = time.cues.findLast((c) => t >= c.at);
    const line = cue?.text ?? "";
    if (line !== shown.current) {
      shown.current = line;
      // The caption's bar shows how long this line stays up.
      setCaption(line, cue ? cue.until - Math.max(cue.at, t) : 0);
    }
    if (t >= time.total) endReplay(stop.id);
  });

  return (
    <>
      <primitive object={scene.root} />
      {plan.own?.kind === "rolloff" && scene.ownAt && time.own && <Rover ramp={scene.ownAt.at} ground={ground} t0={t0} on={on} at={time.own.at + 0.6} reveal={time.reveal} />}
      {plan.own?.kind === "crew" && scene.ownAt && time.own && (
        <Crew spot={scene.ownAt.at} back={!!plan.own.back} jump={!!plan.own.jump} ground={ground} t0={t0} on={on} at={time.own.at + 0.3} span={time.own.until - time.own.at} />
      )}
      {plan.kind === "place" && <Carrier stop={stop} ground={ground} radius={scene.size / 2} t0={t0} on={on} reveal={time.reveal} arrive={arrive} />}
    </>
  );
}

// The astronaut who carried an experiment out from the lander and set it down: a ghost that walks up to the spot,
// stands by it while it starts working, and fades with the rest of the past.
function Carrier({ stop, ground, radius, t0, on, reveal, arrive }: { stop: Stop; ground?: (x: number, z: number) => number; radius: number; t0: React.RefObject<number>; on: boolean; reveal: number; arrive: number }) {
  const suit = useModel("/models/astronaut.gltf.json");
  const who = useMemo(() => {
    const mat = ghostMaterial("#9fd8ff", 0.3, THREE.NormalBlending);
    const parts = suited(suit.scene, mat);
    const root = new THREE.Group();
    root.add(parts.g);
    shell(root);
    return { ...parts, root, mat };
  }, [suit]);
  useEffect(() => () => who.mat.dispose(), [who]);
  // Walks in from beyond the experiment and off to one side, so both stay in view from where you are watching.
  const walk = useMemo(() => {
    const a = Math.atan2(stop.spawn.pos[0], stop.spawn.pos[2]) + 2.1;
    const side = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    return { from: side.clone().multiplyScalar(radius * 0.7 + 7), to: side.clone().multiplyScalar(radius * 0.7 + 0.8), face: Math.atan2(-side.x, -side.z) };
  }, [stop, radius]);
  const p = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    who.root.visible = on;
    if (!on || tour.get().replayPaused) return;
    const t = t0.current >= 0 ? replayClock() - t0.current : 0;
    const u = Math.min(1, Math.max(0, (t - START) / (arrive * 0.85)));
    p.lerpVectors(walk.from, walk.to, smooth(0, 1, u));
    p.y = ground ? ground(p.x, p.z) : 0;
    who.g.position.copy(p);
    who.g.rotation.y = walk.face;
    // A slow, bouncing Moon walk while moving; standing still once there.
    const stride = u < 1 ? Math.sin(u * 26) : 0;
    who.legL.rotation.set(stride * 0.45, 0, 0);
    who.legR.rotation.set(-stride * 0.45, 0, 0);
    who.armL.rotation.set(-0.5 - stride * 0.1, 0, 0.12);
    who.armR.rotation.set(-0.5 + stride * 0.1, 0, -0.12);
    who.g.position.y += u < 1 ? Math.abs(stride) * 0.06 : 0;
    who.mat.uniforms.uAlpha.value = smooth(0, 1.2, t) * (1 - smooth(reveal - 1.5, reveal, t));
  });
  return <primitive object={who.root} />;
}

// Sojourner, the little rover Mars Pathfinder carried: on its line a ghost of it rolls down the ramp and away.
function Rover({ ramp, ground, t0, on, at, reveal }: { ramp: THREE.Vector3; ground?: (x: number, z: number) => number; t0: React.RefObject<number>; on: boolean; at: number; reveal: number }) {
  const gltf = useModel("/models/sojourner.gltf.json");
  const rover = useMemo(() => {
    const mat = ghostMaterial("#9fd8ff", 0.3, THREE.NormalBlending);
    const { object } = prepareModel(gltf.scene, { kind: "gltf", url: "/models/sojourner.gltf.json", span: 0.66, origin: "ground" }, []);
    object.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || m.name === "_root") return;
      m.material = mat;
      m.castShadow = m.receiveShadow = false;
    });
    const root = new THREE.Group();
    root.add(object);
    shell(root);
    return { root, mat };
  }, [gltf]);
  useEffect(() => () => rover.mat.dispose(), [rover]);
  // Straight out from the lander, the way the ramp points.
  const out = useMemo(() => new THREE.Vector3(ramp.x, 0, ramp.z).normalize(), [ramp]);
  useFrame(() => {
    rover.root.visible = on;
    if (!on || tour.get().replayPaused) return;
    const t = t0.current >= 0 ? replayClock() - t0.current : 0;
    const u = Math.min(1, Math.max(0, (t - at) / 4.5));
    const d = Math.hypot(ramp.x, ramp.z) * 0.75 + 3.4 * smooth(0, 1, u);
    const x = out.x * d;
    const z = out.z * d;
    // Down the ramp from the lander's deck to the ground in the first part of the drive.
    rover.root.position.set(x, (ground ? ground(x, z) : 0) + ramp.y * (1 - smooth(0, 0.4, u)), z);
    rover.root.rotation.y = Math.atan2(out.x, out.z);
    rover.mat.uniforms.uAlpha.value = smooth(0, 0.6, t - at + 0.6) * (1 - smooth(reveal, reveal + 1.2, t));
    rover.root.visible = t > at - 0.6 && t < reveal + 1.3;
  });
  return <primitive object={rover.root} />;
}

// One of the crew, at a lander: on the line about something an astronaut did here, a ghost walks from the foot of the
// ladder out to that spot (`back`: from out there back to the ladder, for the last one to climb it), and with `jump`
// jumps half a metre and salutes once there. It is gone again before the top half lifts off.
function Crew({ spot, back, jump, ground, t0, on, at, span }: { spot: THREE.Vector3; back: boolean; jump: boolean; ground?: (x: number, z: number) => number; t0: React.RefObject<number>; on: boolean; at: number; span: number }) {
  const suit = useModel("/models/astronaut.gltf.json");
  const who = useMemo(() => {
    const mat = ghostMaterial("#9fd8ff", 0.3, THREE.NormalBlending);
    const parts = suited(suit.scene, mat);
    const root = new THREE.Group();
    root.add(parts.g);
    shell(root);
    return { ...parts, root, mat };
  }, [suit]);
  useEffect(() => () => who.mat.dispose(), [who]);
  const walk = useMemo(() => {
    const ladder = new THREE.Vector3(0, 0, 4.4); // the foot of the ladder, on the lander's front leg
    const out = new THREE.Vector3(spot.x, 0, spot.z);
    if (out.distanceTo(ladder) < 1.5) out.set(1.6, 0, 8.6); // a spot on the ladder itself: a few steps out from it
    const [from, to] = back ? [out, ladder] : [ladder, out];
    return { from, to, face: Math.atan2(to.x - from.x, to.z - from.z), secs: Math.min(4.5, Math.max(2, span - 1.6)) };
  }, [spot, back, span]);
  const p = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    who.root.visible = on;
    if (!on || tour.get().replayPaused) return;
    const t = (t0.current >= 0 ? replayClock() - t0.current : 0) - at;
    const u = Math.min(1, Math.max(0, t / walk.secs));
    p.lerpVectors(walk.from, walk.to, smooth(0, 1, u));
    p.y = ground ? ground(p.x, p.z) : 0;
    // A slow, bouncing Moon walk; then, for a salute, one jump with an arm up.
    const stride = u > 0 && u < 1 ? Math.sin(u * 22) : 0;
    const air = jump && u >= 1 && t - walk.secs < 1.5 ? Math.sin(((t - walk.secs) / 1.5) * Math.PI) : 0;
    who.g.position.copy(p);
    who.g.position.y += Math.abs(stride) * 0.06 + 0.5 * air;
    who.g.rotation.y = walk.face;
    who.legL.rotation.set(stride * 0.45, 0, 0);
    who.legR.rotation.set(-stride * 0.45, 0, 0);
    who.armL.rotation.set(-stride * 0.35, 0, 0.12);
    who.armR.rotation.set(air > 0 ? -2.5 : stride * 0.35, 0, -0.12);
    who.mat.uniforms.uAlpha.value = smooth(-0.4, 0.4, t) * (1 - smooth(span - 0.6, span + 0.4, t));
    who.root.visible = t > -0.5 && t < span + 0.5;
  });
  return <primitive object={who.root} />;
}
