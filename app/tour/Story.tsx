"use client";

import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useStore } from "./lib/store";
import { continueStory, tour } from "./state";
import { STOPS } from "./stops";

// Real footage and the soundtrack, described in public/media/media.json (credits and licences live there too).
type Clip = { file: string; poster?: string; caption: string; credit: string; license: string; source?: string; real?: boolean; audio?: string };
type Media = Record<string, Clip> & { soundtrack?: { file: string; title: string; credit: string; license: string; source?: string } };
let mediaP: Promise<Media> | null = null;
export const loadMedia = (): Promise<Media> => (mediaP ||= fetch("/media/media.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({})) as Promise<Media>);
const safe = (f?: string) => (f && /^media\/[\w.-]+$/.test(f) ? "/" + f : null);

/* ---------- music: starts on the Start click (a user gesture), one piece per chapter, quiet under videos ---------- */
const MUTE_KEY = "gra-music-off";
type Track = { file: string; title: string; credit: string; license: string };
type MusicState = { el: HTMLAudioElement | null; key: string; ducked: boolean; credit: string; on: boolean };
// Kept on window, so a hot reload during development reuses the same player instead of leaving an
// unreachable one playing in the background.
const g = (typeof window !== "undefined" ? window : {}) as { __graMusic?: MusicState };
const music: MusicState = (g.__graMusic ??= { el: null, key: "", ducked: false, credit: "", on: true });
const BASE = 0.3;
const isOff = () => {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
};
// Glide an audio element's volume to `to` over `ms`, then call `done`.
function fadeVol(el: HTMLAudioElement, to: number, ms: number, done?: () => void) {
  const from = el.volume, t0 = performance.now();
  const step = () => {
    const u = Math.min(1, (performance.now() - t0) / ms);
    el.volume = Math.max(0, Math.min(1, from + (to - from) * u));
    if (u < 1) requestAnimationFrame(step);
    else done?.();
  };
  requestAnimationFrame(step);
}
// Crossfade to another piece (media.json key). Missing files keep the current piece playing.
function playTrack(key: string) {
  if (music.key === key) return;
  loadMedia().then((m) => {
    const tr = (m as unknown as Record<string, Track | undefined>)[key];
    const src = safe(tr?.file);
    if (!tr || !src || music.key === key) return;
    const old = music.el;
    const el = new Audio(src);
    el.loop = true;
    el.volume = 0;
    music.el = el;
    music.key = key;
    music.credit = `${tr.title} · ${tr.credit} · ${tr.license}`;
    if (music.on) {
      el.play().catch(() => {});
      fadeVol(el, music.ducked ? 0.05 : BASE, 1800);
    }
    if (old) fadeVol(old, 0, 1800, () => old.pause());
    dispatchEvent(new Event("gra-music"));
  });
}
// Which piece fits where you are in the story: the start screen's, or the chapter's (Moon, Mars, deep space).
const CHAPTER_MUSIC: Record<string, string> = { Moon: "music-moon", Mars: "music-mars", "Deep space": "music-deep" };
function trackFor() {
  const s = tour.get();
  const i = s.interlude ?? (s.phase === "explore" || s.phase === "travel" ? s.stop : -1);
  return CHAPTER_MUSIC[STOPS[i]?.chapter ?? ""] ?? "soundtrack";
}
let following = false;
export function startMusic() {
  music.on = !isOff();
  playTrack("soundtrack");
  if (following) return;
  following = true;
  tour.subscribe(() => {
    if (music.el) playTrack(trackFor());
  });
}
const duck = (on: boolean) => {
  music.ducked = on;
  if (music.el) music.el.volume = on ? 0.05 : BASE;
};

export function MusicToggle() {
  const [, bump] = useState(0);
  useEffect(() => {
    const f = () => bump((n) => n + 1);
    addEventListener("gra-music", f);
    return () => removeEventListener("gra-music", f);
  }, []);
  if (!music.el) return null;
  const off = music.el.paused;
  return (
    <button
      type="button"
      className="music-btn"
      aria-pressed={!off}
      aria-label="Music"
      title={`${off ? "Turn music on" : "Turn music off"} · ${music.credit}`}
      onClick={() => {
        if (!music.el) return;
        music.on = off;
        if (off) {
          music.el.volume = music.ducked ? 0.05 : BASE;
          music.el.play().catch(() => {});
        } else music.el.pause();
        try {
          localStorage.setItem(MUTE_KEY, off ? "0" : "1");
        } catch {
          /* private mode: the choice lasts this visit */
        }
        bump((n) => n + 1);
      }}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M11 5 6 9H3v6h3l5 4V5z" />
        {off ? <path d="m16 9 5 6m0-6-5 6" /> : <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />}
      </svg>
    </button>
  );
}

/* ---------- a part's own footage, full screen (e.g. what Apollo 15's rover camera filmed) ---------- */
export function useMedia() {
  const [media, setMedia] = useState<Media>({});
  useEffect(() => {
    loadMedia().then(setMedia);
  }, []);
  return media;
}
// Real photos of individual parts, shown on their hotspot cards (public/media/spot-photos.json).
export type SpotPhoto = { file: string; w?: number; h?: number; alt: string; caption: string; credit: string; license: string; source?: string };
let photosP: Promise<Record<string, SpotPhoto>> | null = null;
export function useSpotPhotos() {
  const [p, setP] = useState<Record<string, SpotPhoto>>({});
  useEffect(() => {
    (photosP ||= fetch("/media/spot-photos.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({}))).then(setP);
  }, []);
  return p;
}
export const photoSrc = (f?: string) => (f && /^photos\/spots\/[\w.-]+\.(jpe?g|png|webp)$/i.test(f) ? "/" + f : null);

export const playCutscene = (key: string | null) => tour.set({ cutscene: key });

export function Cutscene() {
  const key = useStore(tour, (s) => s.cutscene);
  const media = useMedia();
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!key) return;
    if (document.pointerLockElement) document.exitPointerLock();
    close.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") playCutscene(null);
    };
    addEventListener("keydown", onKey);
    return () => {
      removeEventListener("keydown", onKey);
      duck(false);
    };
  }, [key]);
  const clip = key ? media[key] : null;
  const src = safe(clip?.file);
  if (!key || !clip || !src) return null;
  return (
    <motion.section className="chapter cutscene" role="dialog" aria-modal="true" aria-label={clip.caption} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
      <div className="chapter-card">
        <figure className="chapter-film">
          <video src={src} poster={safe(clip.poster) ?? undefined} controls autoPlay playsInline onPlay={() => duck(true)} onPause={() => duck(false)} onEnded={() => { duck(false); playCutscene(null); }} />
          <figcaption>
            {clip.real === false ? "Animation: " : "Real footage: "}
            {clip.caption}{clip.audio && <span className="chapter-audio">🔊 {clip.audio}</span>} <span className="chapter-credit">{clip.credit} · {clip.license}{clip.source && <> · <a href={clip.source} target="_blank" rel="noopener noreferrer">source ↗</a></>}</span>
          </figcaption>
        </figure>
        <button ref={close} type="button" className="start-btn" onClick={() => playCutscene(null)}>
          Back to the site
        </button>
      </div>
    </motion.section>
  );
}

/* ---------- the story card shown before each trip ---------- */
export function Interlude() {
  const at = useStore(tour, (s) => s.interlude);
  const stop = at == null ? null : STOPS[at];
  const [media, setMedia] = useState<Media>({});
  const go = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    loadMedia().then(setMedia);
  }, []);
  useEffect(() => {
    go.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") continueStory();
    };
    addEventListener("keydown", onKey);
    return () => {
      removeEventListener("keydown", onKey);
      duck(false);
    };
  }, [at]);
  if (!stop?.story) return null;
  const clip = media[stop.id];
  const src = safe(clip?.file);
  return (
    <motion.section
      key={stop.id}
      className="chapter"
      role="dialog"
      aria-modal="true"
      aria-labelledby="chapter-title"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.5 } }}
      transition={{ duration: 0.6 }}
    >
      <motion.div className="chapter-card" initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.15, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}>
        <p className="chapter-kicker">{stop.story.kicker}</p>
        <h2 id="chapter-title">{stop.story.title}</h2>
        {src && (
          <figure className="chapter-film">
            <video
              src={src}
              poster={safe(clip.poster) ?? undefined}
              controls
              autoPlay
              playsInline
              preload="auto"
              onPlay={() => duck(true)}
              onPause={() => duck(false)}
              onEnded={() => duck(false)}
            />
            <figcaption>
              {clip.real === false ? "Animation: " : "Real footage: "}
              {clip.caption}{clip.audio && <span className="chapter-audio">🔊 {clip.audio}</span>} <span className="chapter-credit">{clip.credit} · {clip.license}{clip.source && <> · <a href={clip.source} target="_blank" rel="noopener noreferrer">source ↗</a></>}</span>
            </figcaption>
          </figure>
        )}
        <p className="chapter-text">{stop.story.text}</p>
        <div className="chapter-actions">
          <button ref={go} type="button" className="start-btn" onClick={continueStory}>
            Fly to {stop.name} →
          </button>
        </div>
      </motion.div>
    </motion.section>
  );
}
