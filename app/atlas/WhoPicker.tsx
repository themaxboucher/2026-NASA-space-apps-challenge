"use client";

import { useEffect, useRef, useState } from "react";
import { getLevel, hasChosenLevel, setLevel } from "./level.js";

// "Who's exploring?": asked once on the atlas (and any time from the top bar), unless the tour already asked.
// The two choices, as in the tour's briefing: Explorer (the simplest writing) or Expert (full technical detail).
// The tour's settings panel still offers all four reading levels for anything in between.
const EXPERTISE = [
  { id: "explorer", label: "Explorer", sub: "Beginner", covers: ["explorer", "student"] },
  { id: "enthusiast", label: "Expert", sub: "Advanced", covers: ["curious", "enthusiast"] },
];
const groupOf = (level: string) => EXPERTISE.find((x) => x.covers.includes(level)) ?? EXPERTISE[0];

export function WhoPicker() {
  const dlg = useRef<HTMLDialogElement>(null);
  const [level, setLvl] = useState("student");
  useEffect(() => {
    // Read the saved level after mount (localStorage), then ask once if nobody has chosen yet.
    const t = setTimeout(() => {
      setLvl(getLevel());
      if (!hasChosenLevel()) dlg.current?.showModal();
    }, 0);
    const f = () => setLvl(getLevel());
    addEventListener("gra-level", f);
    return () => {
      clearTimeout(t);
      removeEventListener("gra-level", f);
    };
  }, []);
  const choose = (id: string) => {
    setLevel(id);
    dlg.current?.close();
  };
  const label = groupOf(level).label;
  return (
    <>
      <button type="button" className="who-chip" onClick={() => dlg.current?.showModal()} aria-label={`Reading level: ${label}. Change`}>
        <span>Reading level</span> {label}
      </button>
      <dialog ref={dlg} className="who" aria-labelledby="who-title" onCancel={() => !hasChosenLevel() && setLevel("explorer")}>
        <p className="eyebrow">Before you explore</p>
        <h2 id="who-title">Who&apos;s exploring?</h2>
        <p className="who-lede">Pick how you&apos;d like things explained. Every space object will explain how it worked at that level.</p>
        <div className="who-levels who-two" role="radiogroup" aria-labelledby="who-title">
          {EXPERTISE.map((x) => {
            const on = x.covers.includes(level);
            return (
              <button key={x.id} type="button" role="radio" aria-checked={on} className={on ? "on" : ""} onClick={() => choose(x.id)}>
                <b>{x.label}</b>
                <span>{x.sub}</span>
              </button>
            );
          })}
        </div>
      </dialog>
    </>
  );
}
