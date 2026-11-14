"use client";

import { useCallback } from "react";
import { useStore } from "./lib/store";
import { openHotspot, spotEls, spotKey, tour } from "./state";
import { STOPS, type Hotspot } from "./stops";

// One clickable marker per hotspot. The 3D scene positions each marker every frame (see scene/Hotspots.tsx).
function Spot({ stopId, spot }: { stopId: string; spot: Hotspot }) {
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
  return (
    <div ref={register} className={`spot-wrap${open ? " is-open" : ""}`} style={{ opacity: 0, visibility: "hidden" }}>
      <button
        type="button"
        className={`spot${spot.broken ? " broken" : ""}${found ? " found" : ""}${open ? " open" : ""}`}
        aria-expanded={open}
        aria-label={`${spot.title}${spot.broken ? " (broken part)" : ""}`}
        onClick={() => openHotspot(stopId, open ? null : spot.id)}
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
          <p>{spot.text}</p>
          <a href={spot.source.url} target="_blank" rel="noopener noreferrer">
            {spot.source.label} ↗
          </a>
        </div>
      )}
    </div>
  );
}

export function Spots() {
  const stop = useStore(tour, (s) => s.stop);
  const exploring = useStore(tour, (s) => s.phase === "explore");
  const s = STOPS[stop];
  if (!s || !exploring) return null;
  return (
    <div className="spots" key={s.id}>
      {s.hotspots.map((h) => (
        <Spot key={h.id} stopId={s.id} spot={h} />
      ))}
    </div>
  );
}
