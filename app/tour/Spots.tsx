"use client";

import { useCallback } from "react";
import { useStore } from "./lib/store";
import { arrowEls, openHotspot, spotEls, spotKey, tour } from "./state";
import { STOPS, type Hotspot } from "./stops";

// One clickable marker per hotspot. The 3D scene positions each marker every frame (see scene/Hotspots.tsx).
// Its story (with any photo and footage) shows at the bottom left of the screen (Story in Tour.tsx).
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
          data-spot={spot.id}
          aria-expanded={open}
          aria-label={`${spot.title}${spot.broken ? " (broken part)" : ""}${found ? ", found" : ""}`}
          onClick={() => openHotspot(stopId, open ? null : spot.id)}
        >
          <span className="spot-ring" aria-hidden="true" />
          <span className="spot-dot" aria-hidden="true" />
          <span className="spot-label" aria-hidden="true">
            {spot.title}
          </span>
        </button>
      </div>
    </>
  );
}

export function Spots() {
  const stop = useStore(tour, (s) => s.stop);
  const exploring = useStore(tour, (s) => s.phase === "explore" && !s.replay);
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
