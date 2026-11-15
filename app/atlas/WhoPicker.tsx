"use client";

import { useEffect, useRef, useState } from "react";
import { getLevel, hasChosenLevel, LEVELS, matchLevel, setLevel } from "./level.js";

// "Who's exploring?": asked once on the atlas (and any time from the top bar). Typing "4th grader", "teacher" or
// "space nerd" picks the closest reading level; the four buttons pick one directly.
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
  const label = LEVELS.find((l) => l.id === level)?.label ?? "Student";
  return (
    <>
      <button type="button" className="who-chip" onClick={() => dlg.current?.showModal()} aria-label={`Reading level: ${label}. Change`}>
        <span>Reading level</span> {label}
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
          <p className="who-lede">Tell us a little about you and every space object will explain how it worked at the right level.</p>
          <label className="who-search">
            <span className="sr-only">Describe yourself</span>
            <input
              type="search"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. 4th grader, high school, teacher, space nerd"
              autoComplete="off"
              autoFocus
            />
          </label>
          <p className="who-guess" aria-live="polite">
            {text.trim() ? (guess ? <>We&apos;ll write for: <b>{LEVELS.find((l) => l.id === guess)!.label}</b></> : "Not sure yet. Pick one below.") : " "}
          </p>
          <div className="who-levels" role="group" aria-label="Reading levels">
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
