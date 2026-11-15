"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";

const ease = [0.22, 1, 0.36, 1] as const;
const FOCUSABLE = 'a[href], button:not(:disabled), [tabindex]:not([tabindex="-1"])';

// A full-screen reading layer over the tour (the mission file, what went wrong). Esc or × closes it, Tab stays
// inside it, and focus goes back to whatever opened it.
export function Overlay({ open, onClose, label, className, children }: { open: boolean; onClose: () => void; label: string; className?: string; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    closeBtn.current?.focus();
    // Capture phase, so Esc closes only this layer and not the hotspot story underneath.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close.current();
        return;
      }
      if (e.key !== "Tab" || !box.current) return;
      const items = [...box.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const at = document.activeElement;
      if (e.shiftKey && (at === first || at === box.current || !box.current.contains(at))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (at === last || !box.current.contains(at))) {
        e.preventDefault();
        first.focus();
      }
    };
    addEventListener("keydown", onKey, true);
    return () => {
      removeEventListener("keydown", onKey, true);
      opener?.focus?.();
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={box}
          className={`overlay${className ? ` ${className}` : ""}`}
          role="dialog"
          aria-modal="true"
          aria-label={label}
          tabIndex={-1}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35, ease }}
        >
          <button ref={closeBtn} type="button" className="overlay-close" aria-label={`Close ${label.toLowerCase()}`} onClick={() => close.current()}>
            ×
          </button>
          <div className="overlay-scroll">
            <motion.div className="overlay-inner" initial={{ y: 18 }} animate={{ y: 0 }} exit={{ y: 10 }} transition={{ duration: 0.5, ease }}>
              {children}
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
