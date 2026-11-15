"use client";

import { useCallback } from "react";
import { useStore } from "./lib/store";
import { arrowEls, openHotspot, spotEls, spotKey, tour } from "./state";
import { STOPS, type Hotspot } from "./stops";
import { photoSrc, playCutscene, useMedia, useSpotPhotos, type SpotPhoto } from "./Story";

// One clickable marker per hotspot. The 3D scene positions each marker every frame (see scene/Hotspots.tsx).
function Spot({ stopId, spot, film, photo }: { stopId: string; spot: Hotspot; film: boolean; photo?: SpotPhoto }) {
  const key = spotKey(stopId, spot.id);
  const open = useStore(tour, (s) => s.openSpot === spot.id);
  const found = useStore(tour, (s) => (s.found[stopId] ?? []).includes(spot.id));
  const register = useCallback(
    (el: HTMLDivElement | null) => {
      if (el) spotEls.set(key, el);
      else spotEls.delete(key);
    },
    [key],
  );
  const registerArrow = useCallback(
    (el: HTMLDivElement | null) => {
      if (el) arrowEls.set(key, el);
      else arrowEls.delete(key);
    },
    [key],
  );
  return (
    <>
      {!found && <div ref={registerArrow} className={`spot-arrow${spot.broken ? " broken" : ""}`} aria-hidden="true" style={{ visibility: "hidden" }} />}
      <div ref={register} className={`spot-wrap${open ? " is-open" : ""}`} style={{ opacity: 0, visibility: "hidden" }}>
        <button
          type="button"
          className={`spot${spot.broken ? " broken" : ""}${found ? " found" : ""}${open ? " open" : ""}`}
          aria-expanded={open}
          aria-label={`${spot.title}${spot.broken ? " (broken part)" : ""}${found ? ", found" : ""}`}
          onClick={() => {
            // A part with its own footage plays it the first time you find it (e.g. Apollo 15's TV camera).
            if (film && !found) playCutscene(key);
            openHotspot(stopId, open ? null : spot.id);
          }}
        >
          <span className="spot-ring" aria-hidden="true" />
          <span className="spot-dot" aria-hidden="true" />
          <span className="spot-label" aria-hidden="true">
            {spot.title}
          </span>
        </button>
        {open && (
          <div className={`spot-card${spot.broken ? " broken" : ""}`} role="dialog" aria-label={spot.title}>
            <button type="button" className="spot-close" aria-label="Close" onClick={() => openHotspot(stopId, null)}>
              ×
            </button>
            {spot.broken && <p className="spot-tag">{spot.tag ?? "Broken part"}</p>}
            <h3>{spot.title}</h3>
            {photo && photoSrc(photo.file) && (
              <figure className="spot-photo">
                {/* eslint-disable-next-line @next/next/no-img-element -- static file with its own credit line */}
                <img src={photoSrc(photo.file)!} alt={photo.alt} width={photo.w} height={photo.h} loading="lazy" />
                <figcaption>
                  {photo.caption}{" "}
                  <span>
                    {photo.credit} · {photo.license}
                    {photo.source && (
                      <>
                        {" "}
                        · <a href={photo.source} target="_blank" rel="noopener noreferrer">source ↗</a>
                      </>
                    )}
                  </span>
                </figcaption>
              </figure>
            )}
            <p>{spot.text}</p>
            {film && (
              <button type="button" className="spot-film" onClick={() => playCutscene(key)}>
                ▶ Watch what it saw
              </button>
            )}
            <a href={spot.source.url} target="_blank" rel="noopener noreferrer">
              {spot.source.label} ↗
            </a>
          </div>
        )}
      </div>
    </>
  );
}

export function Spots() {
  const stop = useStore(tour, (s) => s.stop);
  const exploring = useStore(tour, (s) => s.phase === "explore" && !s.replay);
  const media = useMedia();
  const photos = useSpotPhotos();
  const s = STOPS[stop];
  if (!s || !exploring) return null;
  return (
    <div className="spots" key={s.id}>
      {s.hotspots.map((h) => (
        <Spot key={h.id} stopId={s.id} spot={h} film={!!media[spotKey(s.id, h.id)]} photo={photos[spotKey(s.id, h.id)]} />
      ))}
    </div>
  );
}
