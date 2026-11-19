"use client";

import { useEffect, useRef } from "react";
import { mediaSound } from "../../Story";

// Sound effects for the replays, made here in code: there are no recordings of these machines to play, so each
// replay gets one short effects track built from its own timeline. It is sound design, not mission audio (the two
// Apollo crew replays play the real radio): an engine's rumble on the way down, the thud of an impact, a rover's
// motor, and the chirp of data going home, which stops on the line where the machine went quiet.
// Levels are balanced so the loudest moment (an impact) peaks at about two thirds of full scale and nothing clips.
// Nothing is downloaded and there is nothing to license. It plays through the same volume and mute as the mission
// radio (Story.tsx mediaSound).

const RATE = 22050;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const ramp = (a: number, b: number, t: number) => clamp01((t - a) / (b - a));

// A small repeatable noise source (the same replay always sounds the same).
function noise(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) / 4294967295) * 2 - 1;
  };
}

// A blank track `total` seconds long, and the sounds that can be laid on it (times in seconds from its start).
export function mix(total: number, seed = 7) {
  const n = Math.ceil(total * RATE);
  const out = new Float32Array(n);
  const rnd = noise(seed);
  const span = (from: number, to: number) => [Math.max(0, Math.floor(from * RATE)), Math.min(n, Math.ceil(to * RATE))] as const;
  const m = {
    // Low rumble (engines, wind, rushing in): soft deep noise with a hum under it. `level` gets 0..1 along it.
    rumble(from: number, to: number, level: (u: number) => number, hum = 52) {
      let low = 0;
      const [a, b] = span(from, to);
      for (let i = a; i < b; i++) {
        const t = i / RATE;
        low += (rnd() - low) * 0.035;
        out[i] += (low * 2.4 + 0.25 * Math.sin(2 * Math.PI * hum * t)) * level((t - from) / (to - from));
      }
      return m;
    },
    // A thud: a low tone falling in pitch, with a short burst of noise on top.
    thud(at: number, level: number, length = 0.9, pitch = 68) {
      let low = 0;
      let phase = 0;
      const [a, b] = span(at, at + length);
      for (let i = a; i < b; i++) {
        const t = i / RATE - at;
        phase += (2 * Math.PI * pitch * Math.exp(-t * 2.2)) / RATE;
        low += (rnd() - low) * 0.12;
        out[i] += level * (Math.sin(phase) * Math.exp(-t * 4.5) + low * 1.6 * Math.exp(-t * 11));
      }
      return m;
    },
    // A soft beep, gliding from f0 to f1.
    tone(at: number, length: number, f0: number, f1: number, level: number) {
      let phase = 0;
      const [a, b] = span(at, at + length);
      for (let i = a; i < b; i++) {
        const u = (i / RATE - at) / length;
        phase += (2 * Math.PI * (f0 + (f1 - f0) * u)) / RATE;
        out[i] += Math.sin(phase) * level * Math.sin(Math.PI * clamp01(u)) ** 0.6;
      }
      return m;
    },
    // A motor or a rotor: a buzzing note with overtones, swelling in and out, gliding from f0 to f1.
    motor(from: number, to: number, f0: number, f1 = f0, level = 0.11) {
      let phase = 0;
      const [a, b] = span(from, to);
      for (let i = a; i < b; i++) {
        const t = i / RATE;
        const u = (t - from) / (to - from);
        phase += (2 * Math.PI * (f0 + (f1 - f0) * u)) / RATE;
        out[i] += level * Math.min(1, Math.sin(Math.PI * clamp01(u)) * 4) ** 0.5 * (Math.sin(phase) + 0.5 * Math.sin(2 * phase + 0.6) + 0.25 * Math.sin(3 * phase)) * (0.85 + 0.15 * Math.sin(2 * Math.PI * 7 * t));
      }
      return m;
    },
    // Data going home: three quick notes every `every` seconds from `from` until `until`; with `lost`, the signal
    // then drops away in one falling note.
    chirps(from: number, until: number, lost = false, every = 2, level = 0.09) {
      const notes = [1180, 1560, 1320];
      for (let t = from; t < until - 0.3; t += every) notes.forEach((f, j) => m.tone(t + j * 0.085, 0.07, f, f, level));
      if (lost) m.tone(until, 0.9, 760, 190, level * 1.5);
      return m;
    },
    // Turns everything laid so far right down between two moments (a real recording is playing then).
    hush(from: number, until: number, to = 0.15) {
      const [a, b] = span(from - 0.4, until + 0.4);
      for (let i = a; i < b; i++) {
        const t = i / RATE;
        out[i] *= 1 - (1 - to) * ramp(from - 0.4, from, t) * (1 - ramp(until, until + 0.4, t));
      }
      return m;
    },
    // The finished track as a playable address (16-bit mono WAV). Free it with URL.revokeObjectURL.
    url() {
      const bytes = new DataView(new ArrayBuffer(44 + n * 2));
      const text = (at: number, s: string) => [...s].forEach((c, i) => bytes.setUint8(at + i, c.charCodeAt(0)));
      text(0, "RIFF");
      bytes.setUint32(4, 36 + n * 2, true);
      text(8, "WAVEfmt ");
      bytes.setUint32(16, 16, true);
      bytes.setUint16(20, 1, true);
      bytes.setUint16(22, 1, true);
      bytes.setUint32(24, RATE, true);
      bytes.setUint32(28, RATE * 2, true);
      bytes.setUint16(32, 2, true);
      bytes.setUint16(34, 16, true);
      text(36, "data");
      bytes.setUint32(40, n * 2, true);
      for (let i = 0; i < n; i++) bytes.setInt16(44 + i * 2, Math.max(-1, Math.min(1, out[i])) * 32767, true);
      return URL.createObjectURL(new Blob([bytes.buffer], { type: "audio/wav" }));
    },
  };
  return m;
}

// The effects track of a shared replay (generic.tsx), from its timeline.
export type Soundtrack = {
  total: number; // seconds
  kind: "dive" | "land" | "drive" | "place" | "fly";
  effect?: "plume" | "bounce" | "tumble";
  start: number; // when the machine starts moving
  arrived: number; // when it gets here
  bounces?: number; // airbag bounces on the way in
  // Data chirps from `from` until `until` (the day it went quiet, or the end if it still works).
  signal?: { from: number; until: number; lost: boolean };
  fault?: number; // when the part that gave out lights up: a low warning tone
  work?: number; // when the part that shows what it did lights up: a soft rising chime
  liftoff?: number; // when a lunar module's top half fires its engine and leaves
  own?: { at: number; span: number; kind: string }; // the machine's own scene (own.ts): its sound
  hush?: [number, number][]; // while real footage plays its own real sound: these effects drop right down
  handover?: number; // when the last line begins (the present day): two soft notes
};
export function buildSoundtrack(plan: Soundtrack): string {
  const m = mix(plan.total, Math.round(plan.total * 1000) + plan.kind.length * 97);
  const { start, arrived } = plan;
  const span = Math.max(0.5, arrived - start);
  if (plan.kind === "dive") {
    // Rushing in, louder and louder, then the hit.
    m.rumble(start, arrived, (u) => 0.34 * u * u, 40).thud(arrived, 0.6, 1.6, 62).thud(arrived + 0.08, 0.3, 1.2, 38);
  } else if (plan.effect === "plume") {
    // Engines all the way down, cut at touchdown, and the lander settling on its legs.
    m.rumble(start, arrived + 0.2, (u) => 0.3 * ramp(0, 0.08, u) * (1 - ramp(0.94, 1, u)), 58).thud(arrived, 0.3, 0.5, 80);
  } else if (plan.effect === "bounce") {
    // Each bounce of the airbags, softer every time.
    const k = plan.bounces ?? 5.5;
    for (let b = 0; b + 0.5 < k; b++) {
      const u = (b + 0.5) / k;
      m.thud(start + span * u, 0.4 * (1 - u) + 0.08, 0.6, 74);
    }
  } else if (plan.effect === "tumble") m.rumble(start, arrived, (u) => 0.2 * u, 36).thud(arrived, 0.45, 1, 60);
  else if (plan.kind === "land") m.thud(arrived - 0.05, 0.25, 0.5, 80);
  else if (plan.kind === "drive") {
    // An electric motor for each stretch of the drive (four stretches, with a pause after each).
    for (let h = 0; h < 4; h++) m.motor(start + (span * h) / 4, start + (span * (h + 0.72)) / 4, 96);
  } else if (plan.kind === "place") {
    // The astronaut's steps on the way in, and the experiment set down.
    for (let t = start + 0.4; t < start + span * 0.85 - 0.2; t += 0.5) m.thud(t, 0.07, 0.12, 110);
    m.thud(arrived - 0.3, 0.2, 0.4, 90);
  }
  else m.rumble(start, arrived, (u) => 0.17 * Math.sin(Math.PI * u), 46); // a spacecraft sailing in
  if (plan.signal) m.chirps(plan.signal.from, plan.signal.until, plan.signal.lost);
  if (plan.work !== undefined) m.tone(plan.work, 0.28, 660, 880, 0.07).tone(plan.work + 0.2, 0.4, 880, 990, 0.06);
  if (plan.fault !== undefined) m.tone(plan.fault, 0.32, 230, 205, 0.12).tone(plan.fault + 0.42, 0.45, 205, 150, 0.12);
  if (plan.liftoff !== undefined) m.rumble(plan.liftoff, plan.liftoff + 4.5, (u) => 0.3 * ramp(0, 0.06, u) * (1 - u) ** 1.2, 64);
  if (plan.own) {
    const { at, kind } = plan.own;
    const span = Math.max(1, Math.min(plan.own.span, plan.total - at - 0.2));
    const every = (step: number, until: number, lay: (t: number, i: number) => void) => {
      for (let i = 0; at + i * step < at + until - 0.05; i++) lay(at + i * step, i);
    };
    if (kind === "quake") {
      // The ground shaking: a deep rumble, with a thump as each wave passes.
      m.rumble(at, at + Math.min(span, 6.5), (u) => 0.2 * Math.sin(Math.PI * u), 30);
      every(1.1, Math.min(span, 6.5), (t) => m.thud(t, 0.13, 0.7, 44));
    } else if (kind === "aim") every(0.55, 1.7, (t, i) => m.tone(t, 0.14, 620 + i * 140, 620 + i * 140, 0.09));
    else if (kind === "laser") {
      // Each round: a falling note as the pulse comes down, a rising one as it goes back.
      every(2.5, span - 0.4, (t) => m.tone(t, 0.95, 1700, 880, 0.09).tone(t + 1, 0.95, 880, 1700, 0.09));
    } else if (kind === "pictures") every(0.55, span - 0.4, (t) => m.tone(t, 0.045, 2300, 1300, 0.1)); // a shutter for each picture
    else if (kind === "collect") every(0.2, span - 0.4, (t, i) => m.tone(t, 0.03, 2700 + ((i * 37) % 5) * 90, 2700, 0.075)); // a counter ticking
    else if (kind === "dig") m.motor(at + 0.2, at + Math.min(span, 4.2), 72, 54, 0.08).rumble(at + 0.2, at + Math.min(span, 4.2), (u) => 0.1 * Math.sin(Math.PI * u), 38);
    else if (kind === "drop") every(0.3, Math.min(span, 3.1), (t) => m.thud(t + 0.1, 0.11, 0.16, 150));
    else if (kind === "plume") m.rumble(at, at + Math.min(span, 5.5), (u) => 0.17 * (1 - u) ** 0.8 * ramp(0, 0.05, u), 34);
    else if (kind === "twin") m.thud(at + 0.7, 0.4, 1.4, 58);
    else if (kind === "burn") m.rumble(at, at + span, (u) => 0.24 * Math.sin(Math.PI * u) ** 0.5, 72);
    else if (kind === "pulses") every(0.2, span * 0.55, (t) => m.thud(t, 0.11, 0.09, 120)); // engine pulses, then silence
    else if (kind === "hop") m.rumble(at + 0.8, at + 3.4, (u) => 0.28 * ramp(0, 0.08, u) * (1 - ramp(0.82, 1, u)), 58).thud(at + 3.4, 0.25, 0.5, 80);
    else if (kind === "crew") every(0.5, Math.min(span - 1, 4.5), (t) => m.thud(t + 0.3, 0.07, 0.12, 110)); // footsteps
    else if (kind === "rolloff") m.motor(at + 0.6, at + Math.min(span, 5), 118, 118, 0.07);
    else m.tone(at, 0.28, 520, 700, 0.06).tone(at + 0.2, 0.4, 700, 780, 0.05);
  }
  // The present day: two soft notes as the last line begins.
  if (plan.handover !== undefined) m.tone(plan.handover, 0.5, 523, 523, 0.055).tone(plan.handover + 0.32, 0.8, 784, 784, 0.055);
  // A very quiet low bed under the whole replay, so the story is never told over dead silence (a machine that
  // has gone quiet sends no more chirps, and that can be half the replay).
  m.rumble(start, plan.total, (u) => 0.05 * ramp(0, 0.04, u) * (1 - ramp(0.93, 1, u)), 44);
  for (const [from, until] of plan.hush ?? []) m.hush(from, until);
  return m.url();
}

// Plays a replay's effects track in step with its picture. `build` makes the track when the replay starts; call
// the returned function every frame with the replay's time in real seconds (negative before it has started) and
// whether it is paused. The sound holds when the replay is paused and stops when it ends.
export function useSoundtrack(on: boolean, build: () => string, total: number) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const sounding = useRef(false);
  const make = useRef(build);
  useEffect(() => {
    make.current = build;
  });
  useEffect(() => {
    if (!on) return;
    const url = make.current();
    const sound = mediaSound(new Audio(url));
    audio.current = sound;
    sounding.current = false;
    if (process.env.NODE_ENV !== "production") Object.assign(window, { __replayAudio: sound }); // for checking while developing
    return () => {
      sound.pause();
      audio.current = null;
      URL.revokeObjectURL(url);
    };
  }, [on]);
  return (t: number, paused: boolean) => {
    const sound = audio.current;
    if (!sound) return;
    if (paused) {
      if (sounding.current) {
        sound.pause();
        sounding.current = false;
      }
    } else if (!sounding.current && t >= 0 && t < total - 0.5) {
      // Start (or carry on after a pause) in step with the picture. A browser that won't play it stays silent.
      sounding.current = true;
      sound.currentTime = t;
      sound.play().catch(() => {});
    }
  };
}

// Plays a real recording (a clip's own sound track) over one stretch of a replay, in step with it: call the returned
// function every frame, like useSoundtrack's. It holds when the replay is paused and stops when the stretch ends.
// `gain` (0..1) turns a loud recording down to sit with the rest, on top of the app's own volume.
export function useRecording(on: boolean, url: string, from: number, until: number, gain = 1) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const refused = useRef(false);
  const level = useRef({ base: 1, set: -1 });
  useEffect(() => {
    if (!on) return;
    const sound = mediaSound(new Audio(url));
    sound.preload = "auto";
    audio.current = sound;
    refused.current = false;
    level.current = { base: sound.volume, set: -1 };
    if (process.env.NODE_ENV !== "production") Object.assign(window, { __replayReal: sound }); // for checking while developing
    return () => {
      sound.pause();
      audio.current = null;
    };
  }, [on, url]);
  return (t: number, paused: boolean) => {
    const sound = audio.current;
    if (!sound || refused.current) return;
    // (The volume slider sets the element's volume directly: a value that isn't the one put here is the new setting.)
    if (Math.abs(sound.volume - level.current.set) > 1e-3) level.current.base = sound.volume;
    level.current.set = level.current.base * gain;
    sound.volume = level.current.set;
    const playing = !paused && t >= from && t < until;
    if (playing && sound.paused) {
      if (Math.abs(sound.currentTime - (t - from)) > 0.4) sound.currentTime = t - from;
      sound.play().catch(() => {
        refused.current = true; // a browser that will not play it stays silent
      });
    } else if (!playing && !sound.paused) sound.pause();
  };
}
