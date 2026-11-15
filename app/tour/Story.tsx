"use client";

import { ArrowRight, ArrowUpRight, AudioLines, Settings, Volume2, VolumeX, X } from "lucide-react";
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
// The music's level right now: the slider times the base level (down to 5% while a clip or radio plays).
const musicLevel = () => (music.ducked ? 0.05 : BASE) * vol.music;
// Sounds playing outside the video players (the ghost replays' radio), so the slider can reach them.
const sounds = new Set<HTMLMediaElement>();
export function mediaSound(el: HTMLAudioElement) {
  el.volume = vol.media;
  sounds.add(el);
  el.addEventListener("play", () => duck(true));
  el.addEventListener("pause", () => (sounds.delete(el), duck(false)));
  el.addEventListener("ended", () => (sounds.delete(el), duck(false)));
  return el;
}
// Applied to each <video> as it loads.
export const videoVolume = (el: HTMLVideoElement | null) => {
  if (el) el.volume = vol.media;
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
    music.el = el;
    music.key = key;
    music.credit = `${tr.title} · ${tr.credit}`;
    music.license = tr.license;
    music.source = tr.source;
    if (music.on) {
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

export function MusicToggle() {
  const [, bump] = useState(0);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const f = () => bump((n) => n + 1);
    addEventListener("gra-music", f);
    return () => removeEventListener("gra-music", f);
  }, []);
  if (!music.el) return null;
  const off = music.el.paused;
  const toggleMusic = () => {
    if (!music.el) return;
    music.on = off;
    if (off) {
      music.el.volume = musicLevel();
      music.el.play().catch(() => {});
    } else music.el.pause();
    try {
      localStorage.setItem(MUTE_KEY, off ? "0" : "1");
    } catch {
      /* private mode: the choice lasts this visit */
    }
    bump((n) => n + 1);
  };
  return (
    <div className="sound">
      {/* The speaker turns music on or off in one click; the gear opens the volume settings. */}
      <button type="button" className="music-btn" aria-pressed={!off} aria-label={off ? "Turn music on" : "Turn music off"} title={`${off ? "Turn music on" : "Turn music off"} · ${music.credit}`} onClick={toggleMusic}>
        {off ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
      </button>
      <button type="button" className="music-btn settings-btn" aria-expanded={open} aria-label="Sound settings" title="Sound settings" onClick={() => setOpen(!open)}>
        <Settings aria-hidden="true" />
      </button>
      {open && (
        <div className="sound-panel" role="group" aria-label="Sound">
          <label className="sound-row">
            <span>Music</span>
            <input type="range" min={0} max={1} step={0.05} defaultValue={vol.music} disabled={off} onChange={(e) => setVolume("music", +e.target.value)} aria-label="Music volume" />
          </label>
          <label className="sound-row">
            <span>Videos and radio</span>
            <input type="range" min={0} max={1} step={0.05} defaultValue={vol.media} onChange={(e) => setVolume("media", +e.target.value)} aria-label="Videos and mission radio volume" />
          </label>
          <p className="sound-credit">
            {music.credit} ·{" "}
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
