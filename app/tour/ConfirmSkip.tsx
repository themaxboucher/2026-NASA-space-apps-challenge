"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

// A Skip button that asks first: one click opens a small "Skip this?" with Yes and No, so nobody misses a part
// by accident. `askEvent` lets a key (Esc during a replay) open the same question.
export function ConfirmSkip({
  label = "Skip",
  question,
  yes = "Yes, skip",
  no = "Keep going",
  onConfirm,
  className,
  ariaLabel,
  askEvent,
}: {
  label?: ReactNode;
  question: string;
  yes?: string;
  no?: string;
  onConfirm: () => void;
  className?: string;
  ariaLabel?: string;
  askEvent?: string;
}) {
  const [asking, setAsking] = useState(false);
  const yesBtn = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!askEvent) return;
    const f = () => setAsking((a) => !a); // the key again closes it
    addEventListener(askEvent, f);
    return () => removeEventListener(askEvent, f);
  }, [askEvent]);
  useEffect(() => {
    if (!asking) return;
    yesBtn.current?.focus();
    const out = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setAsking(false);
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !askEvent) {
        e.stopPropagation();
        setAsking(false);
      }
    };
    addEventListener("pointerdown", out, true);
    addEventListener("keydown", key, true);
    return () => {
      removeEventListener("pointerdown", out, true);
      removeEventListener("keydown", key, true);
    };
  }, [asking, askEvent]);
  return (
    <span className="confirm-skip" ref={box}>
      <button type="button" className={className} aria-label={ariaLabel} aria-expanded={asking} onClick={() => setAsking(!asking)}>
        {label}
      </button>
      {asking && (
        <span className="confirm-pop" role="alertdialog" aria-label={question}>
          <span className="confirm-q">{question}</span>
          <span className="confirm-btns">
            <button type="button" className="confirm-no" onClick={() => setAsking(false)}>
              {no}
            </button>
            <button
              type="button"
              ref={yesBtn}
              className="confirm-yes"
              onClick={() => {
                setAsking(false);
                onConfirm();
              }}
            >
              {yes}
            </button>
          </span>
        </span>
      )}
    </span>
  );
}
