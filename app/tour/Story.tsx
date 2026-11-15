"use client";

import { ArrowRight, ArrowUpRight, AudioLines, Settings, Volume2, VolumeX, X } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import { getLevel, LEVELS, setLevel } from "../atlas/level.js";
import { useStore } from "./lib/store";
import { continueStory, tour } from "./state";
import { STOPS } from "./stops";

// Real footage and the soundtrack, described in public/media/media.json (credits and licences live there too).
type Clip = { file: string; poster?: string; caption: string; credit: string; license: string; source?: string; real?: boolean; audio?: string };
type Media = Record<string, Clip> & { soundtrack?: { file: string; title: string; credit: string; license: string; source?: string } };
let mediaP: Promise<Media> | null = null;
export const loadMedia = (): Promise<Media> => (mediaP ||= fetch("/media/media.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({})) as Promise<Media>);
const safe = (f?: string) => (f && /^media\/(sites\/)?[\w.-]+$/.test(f) ? "/" + f : null);

/* ---------- music: starts on the Start click (a user gesture), one piece per chapter, quiet under videos ---------- */
const MUTE_KEY = "gra-music-off";
// Licence deeds, linked wherever a CC licence is shown (CC BY requires the link).
const LICENSE_URL: Record<string, string> = {
  "CC BY 3.0": "https://creativecommons.org/licenses/by/3.0/",
  "CC BY 4.0": "https://creativecommons.org/licenses/by/4.0/",
  "CC BY-SA 3.0": "https://creativecommons.org/licenses/by-sa/3.0/",
  "CC BY-SA 4.0": "https://creativecommons.org/licenses/by-sa/4.0/",
};
type Track = { file: string; title: string; credit: string; license: string; source?: string };
type MusicState = { el: HTMLAudioElement | null; key: string; ducked: boolean; credit: string; on: boolean; source?: string; license?: string };
// Kept on window, so a hot reload during development reuses the same player instead of leaving an
// unreachable one playing in the background.
const g = (typeof window !== "undefined" ? window : {}) as { __graMusic?: MusicState };
const music: MusicState = (g.__graMusic ??= { el: null, key: "", ducked: false, credit: "", on: true });
const BASE = 0.3;
// Volume sliders (0..1), remembered in this browser: music, and everything with real sound (clips, mission radio).
const VOL_KEY = "gra-volume";
export const vol: { music: number; media: number } = (() => {
  try {
    const v = JSON.parse(localStorage.getItem(VOL_KEY) || "null");
    if (v && typeof v.music === "number" && typeof v.media === "number") return v;
  } catch {
    /* fall through to defaults */
  }
  return { music: 1, media: 1 };
})();
const saveVol = () => {
  try {
    localStorage.setItem(VOL_KEY, JSON.stringify(vol));
  } catch {
    /* private mode: lasts this visit */
  }
};
// The music's level right now: the slider times the base level. Each piece plays out for its first 10 seconds,
// then settles to a fifth of that, quietly in the background; it is silent while a video or the radio plays.
const QUIET_AFTER = 10_000;
const QUIET = 0.2;
let quiet = false;
const musicLevel = () => (music.ducked ? 0 : BASE * (quiet ? QUIET : 1)) * vol.music;
let quietTimer: ReturnType<typeof setTimeout> | undefined;
function settleLater() {
  quiet = false;
  clearTimeout(quietTimer);
  quietTimer = setTimeout(() => {
    quiet = true;
    if (music.el && !music.ducked) fadeVol(music.el, musicLevel(), 2500);
  }, QUIET_AFTER);
}
// "Mute all sound": silences the music, videos and mission radio at once, remembered in this browser.
const MUTED_KEY = "gra-muted";
let muted = (() => {
  try {
    return localStorage.getItem(MUTED_KEY) === "1";
  } catch {
    return false;
  }
})();
function setMuted(on: boolean) {
  muted = on;
  try {
    localStorage.setItem(MUTED_KEY, on ? "1" : "0");
  } catch {
    /* private mode: lasts this visit */
  }
  if (music.el) music.el.muted = on;
  sounds.forEach((e) => (e.muted = on));
  document.querySelectorAll("video").forEach((e) => (e.muted = on));
  dispatchEvent(new Event("gra-music"));
}
// Sounds playing outside the video players (the ghost replays' radio), so the slider can reach them.
const sounds = new Set<HTMLMediaElement>();
export function mediaSound(el: HTMLAudioElement) {
  el.volume = vol.media;
  el.muted = muted;
  sounds.add(el);
  el.addEventListener("play", () => duck(true));
  el.addEventListener("pause", () => (sounds.delete(el), duck(false)));
  el.addEventListener("ended", () => (sounds.delete(el), duck(false)));
  return el;
}
// Applied to each <video> as it loads: its volume, the mute, and silencing the music while it plays.
export const videoVolume = (el: HTMLVideoElement | null) => {
  if (!el) return;
  el.volume = vol.media;
  el.muted = muted;
  if (el.dataset.ducks) return;
  el.dataset.ducks = "1";
  el.addEventListener("play", () => duck(true));
  el.addEventListener("pause", () => duck(false));
  el.addEventListener("ended", () => duck(false));
};
function setVolume(kind: "music" | "media", v: number) {
  vol[kind] = v;
  saveVol();
  if (kind === "music" && music.el) music.el.volume = musicLevel();
  if (kind === "media") {
    document.querySelectorAll("video").forEach((e) => (e.volume = v));
    sounds.forEach((e) => (e.volume = v));
  }
}
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
    el.muted = muted;
    music.el = el;
    music.key = key;
    music.credit = `${tr.title} · ${tr.credit}`;
    music.license = tr.license;
    music.source = tr.source;
    if (music.on) {
      settleLater();
      el.play().catch(() => {});
      fadeVol(el, musicLevel(), 1800);
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
  if (music.el) music.el.volume = musicLevel();
};

// The sound controls, top right on every screen of the tour: a mute button (also the M key) and a settings
// panel with sound and music on/off, the two volumes and the reading level.
export function MusicToggle() {
  const [, bump] = useState(0);
  const [open, setOpen] = useState(false);
  const [level, setLvl] = useState("student");
  const gear = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const panelId = useId();
  useEffect(() => {
    const f = () => bump((n) => n + 1);
    const lv = () => setLvl(getLevel());
    const t = setTimeout(lv, 0); // read the saved level after mount (localStorage)
    const key = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "m" || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if ((e.target as HTMLElement | null)?.closest?.("input, textarea, select, [contenteditable]")) return;
      setMuted(!muted);
    };
    addEventListener("gra-music", f);
    addEventListener("gra-level", lv);
    addEventListener("keydown", key);
    return () => {
      clearTimeout(t);
      removeEventListener("gra-music", f);
      removeEventListener("gra-level", lv);
      removeEventListener("keydown", key);
    };
  }, []);
  useEffect(() => {
    if (!open) return;
    box.current?.querySelector<HTMLElement>(".sound-panel input")?.focus();
    const out = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
      gear.current?.focus();
    };
    addEventListener("pointerdown", out, true);
    addEventListener("keydown", esc, true);
    return () => {
      removeEventListener("pointerdown", out, true);
      removeEventListener("keydown", esc, true);
    };
  }, [open]);
  const musicOn = music.el ? !music.el.paused : !isOff();
  const toggleMusic = () => {
    const on = !musicOn;
    music.on = on;
    if (music.el) {
      if (on) {
        music.el.volume = musicLevel();
        music.el.play().catch(() => {});
      } else music.el.pause();
    }
    try {
      localStorage.setItem(MUTE_KEY, on ? "0" : "1");
    } catch {
      /* private mode: the choice lasts this visit */
    }
    bump((n) => n + 1);
  };
  return (
    <div className="sound" ref={box}>
      <button
        type="button"
        className="music-btn"
        aria-pressed={muted}
        aria-label="Mute all sound"
        title={muted ? "Sound is off: unmute (M)" : "Mute all sound (M)"}
        onClick={() => setMuted(!muted)}
      >
        {muted ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
      </button>
      <button
        type="button"
        ref={gear}
        className="music-btn settings-btn"
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="dialog"
        aria-label="Settings"
        title="Settings"
        onClick={() => setOpen(!open)}
      >
        <Settings aria-hidden="true" />
      </button>
      {open && (
        <div className="sound-panel" id={panelId} role="dialog" aria-label="Settings">
          <p className="sound-title">Settings</p>
          <label className="sound-check">
            <input type="checkbox" checked={!muted} onChange={() => setMuted(!muted)} />
            <span>Sound on</span>
            <kbd>M</kbd>
          </label>
          <label className="sound-check">
            <input type="checkbox" checked={musicOn} disabled={muted} onChange={toggleMusic} />
            <span>Background music</span>
          </label>
          <label className="sound-row">
            <span>Music volume</span>
            <input type="range" min={0} max={1} step={0.05} defaultValue={vol.music} disabled={muted || !musicOn} onChange={(e) => setVolume("music", +e.target.value)} />
          </label>
          <label className="sound-row">
            <span>Videos and mission radio volume</span>
            <input type="range" min={0} max={1} step={0.05} defaultValue={vol.media} disabled={muted} onChange={(e) => setVolume("media", +e.target.value)} />
          </label>
          <p className="sound-note">The music plays quietly in the background and stops while a video or the radio plays.</p>
          <label className="sound-row">
            <span>Reading level</span>
            <select value={level} onChange={(e) => setLevel(e.target.value)}>
              {LEVELS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          {music.credit && (
            <p className="sound-credit">
              Music: {music.credit} ·{" "}
              {LICENSE_URL[music.license ?? ""] ? (
                <a href={LICENSE_URL[music.license!]} target="_blank" rel="noopener noreferrer">{music.license}</a>
              ) : (
                music.license
              )}
              {music.source && (
                <>
                  {" "}·{" "}
                  <a href={music.source} target="_blank" rel="noopener noreferrer">source</a>
                </>
              )}
            </p>
          )}
        </div>
      )}
    </div>
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
export const photoSrc = (f?: string) => (f && /^photos\/(spots|sites)\/[\w.-]+\.(jpe?g|png|webp)$/i.test(f) ? "/" + f : null);
// A clip from a site file (public/data/sites), keyed "<stop>/<spot>" like media.json.
const siteClip = (key: string): Clip | undefined => {
  const [stop, spot] = key.split("/");
  return STOPS.find((s) => s.id === stop)?.hotspots.find((h) => h.id === spot)?.video;
};

export const playCutscene = (key: string | null) => tour.set({ cutscene: key });

export function Cutscene() {
  const key = useStore(tour, (s) => s.cutscene);
  const media = useMedia();
  useEffect(() => {
    if (!key) return;
    if (document.pointerLockElement) document.exitPointerLock();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") playCutscene(null);
    };
    addEventListener("keydown", onKey);
    return () => {
      removeEventListener("keydown", onKey);
      duck(false);
    };
  }, [key]);
  const clip = key ? media[key] ?? siteClip(key) : null;
  const src = safe(clip?.file);
  if (!key || !clip || !src) return null;
  return (
    <motion.section className="chapter cutscene" role="dialog" aria-modal="true" aria-label={clip.caption} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
      <button type="button" className="overlay-close" aria-label="Close video" autoFocus onClick={() => playCutscene(null)}>
        <X aria-hidden="true" />
      </button>
      <div className="chapter-card">
        <figure className="chapter-film">
          <video ref={videoVolume} src={src} poster={safe(clip.poster) ?? undefined} controls autoPlay playsInline onPlay={() => duck(true)} onPause={() => duck(false)} onEnded={() => { duck(false); playCutscene(null); }} />
          <figcaption>
            {clip.real === false ? "Animation: " : "Real footage: "}
            {clip.caption}{clip.audio && <span className="chapter-audio"><AudioLines aria-hidden="true" /> {clip.audio}</span>} <span className="chapter-credit">{clip.credit} · {clip.license}{clip.source && <> · <a href={clip.source} target="_blank" rel="noopener noreferrer">source <ArrowUpRight aria-hidden="true" /></a></>}</span>
          </figcaption>
        </figure>
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
      className="chapter story-chapter"
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
        <p className="chapter-text">{stop.story.text}</p>
        {src && (
          <figure className="chapter-film">
            <video
              src={src}
              poster={safe(clip.poster) ?? undefined}
              controls
              autoPlay
              playsInline
              preload="auto"
              ref={videoVolume}
              onPlay={() => duck(true)}
              onPause={() => duck(false)}
              onEnded={() => duck(false)}
            />
            <figcaption>
              {clip.real === false ? "Animation: " : "Real footage: "}
              {clip.caption}{clip.audio && <span className="chapter-audio"><AudioLines aria-hidden="true" /> {clip.audio}</span>} <span className="chapter-credit">{clip.credit} · {clip.license}{clip.source && <> · <a href={clip.source} target="_blank" rel="noopener noreferrer">source <ArrowUpRight aria-hidden="true" /></a></>}</span>
            </figcaption>
          </figure>
        )}
        <div className="chapter-actions story-actions">
          <button ref={go} type="button" className="start-btn" onClick={continueStory}>
            Fly to {stop.name} <ArrowRight aria-hidden="true" />
          </button>
        </div>
      </motion.div>
    </motion.section>
  );
}
