"use client";

import { useEffect, useRef, useState } from "react";
import { getLevel, hasChosenLevel, LEVELS, matchLevel, setLevel } from "./level.js";

// "Who's exploring?": asked once on the atlas (and any time from the top bar). Typing "new to space", "I know the
// basics" or "space nerd" picks the closest level; the four buttons pick one directly. Levels go by space know-how, not age.
export function WhoPicker() {
  const dlg = useRef<HTMLDialogElement>(null);
  const [level, setLvl] = useState("student");
  const [text, setText] = useState("");
  const guess = matchLevel(text);
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
    setText("");
    dlg.current?.close();
  };
  const label = LEVELS.find((l) => l.id === level)?.label ?? LEVELS[1].label;
  return (
    <>
      <button type="button" className="who-chip" onClick={() => dlg.current?.showModal()} aria-label={`Space level: ${label}. Change`}>
        <span>Space level</span> {label}
      </button>
      <dialog ref={dlg} className="who" aria-labelledby="who-title" onCancel={() => !hasChosenLevel() && setLevel("student")}>
        <form
          method="dialog"
          onSubmit={(e) => {
            e.preventDefault();
            choose(guess ?? level);
          }}
        >
          <p className="eyebrow">Before you explore</p>
          <h2 id="who-title">Who&apos;s exploring?</h2>
          <p className="who-lede">How much do you know about space? Any age can be any level. Every space object will explain how it worked to match.</p>
          <label className="who-search">
            <span className="sr-only">Describe yourself</span>
            <input
              type="search"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. new to space, I know the basics, space nerd, engineer"
              autoComplete="off"
              autoFocus
            />
          </label>
          <p className="who-guess" aria-live="polite">
            {text.trim() ? (guess ? <>We&apos;ll write for: <b>{LEVELS.find((l) => l.id === guess)!.label}</b></> : "Not sure yet. Pick one below.") : " "}
          </p>
          <div className="who-levels" role="group" aria-label="Space levels">
            {LEVELS.map((l) => (
              <button
                key={l.id}
                type="button"
                className={(guess ?? (text.trim() ? null : level)) === l.id ? "on" : ""}
                onClick={() => choose(l.id)}
              >
                <b>{l.label}</b>
                <span>{l.who}</span>
              </button>
            ))}
          </div>
          <div className="who-actions">
            <button type="submit" className="who-go" disabled={!!text.trim() && !guess}>
              Start exploring
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
