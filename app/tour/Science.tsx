"use client";

import { useEffect, useState } from "react";
import { getLevel } from "../atlas/level.js";
import { loadScience, scienceHTML } from "../atlas/science.js";
import "../atlas/science.css";

// "How it worked" in the mission file, at the reader's chosen level (see app/atlas/science.js for the format).
export function Science({ id }: { id: string }) {
  const [html, setHtml] = useState<{ id: string; html: string } | null>(null);
  useEffect(() => {
    let off = false;
    const draw = () =>
      loadScience().then((d: Record<string, unknown>) => !off && setHtml({ id, html: scienceHTML(d[id], getLevel()) }));
    draw();
    addEventListener("gra-level", draw);
    return () => {
      off = true;
      removeEventListener("gra-level", draw);
    };
  }, [id]);
  if (!html || html.id !== id || !html.html) return null;
  // Our own data, escaped in scienceHTML.
  return <div className="sci-wrap" dangerouslySetInnerHTML={{ __html: html.html }} />;
}
