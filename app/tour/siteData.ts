// The shared format for every machine's explorable site (all 79 in public/data/{moon,mars,deepspace}.json).
// One file per machine: public/data/sites/<atlas id>.json. Media goes in public/media/sites/ and photos in
// public/photos/sites/. The six story stops keep their hand-tuned data in stops.ts; their site files are optional.
//
// Coordinates: metres, the machine at the origin, +y up, +x east, -z north (surface); for space, the machine at
// the origin. A hotspot anchor is either a named part of the 3D model (mesh, its parent node, or material name, as
// in stops.ts: { part, at: [fx, fy, fz] } fractions of that part's bounding box) or a position.

export type SitePhoto = {
  file: string; // "photos/sites/<id>--<spot>.jpg"
  w: number;
  h: number;
  alt: string;
  caption: string; // one kid-friendly sentence; say if it's a spare/replica/test unit on Earth
  credit: string;
  // "Educational use with credit": LROC images (NASA/GSFC/Arizona State University) only; the team approved these for
  // this educational NASA Space Apps site.
  license: "Public domain" | "CC0" | "CC BY 4.0" | "CC BY-SA 4.0" | "CC BY 3.0" | "CC BY-SA 3.0" | "CC BY 2.0" | "CC BY-SA 2.0" | "Educational use with credit";
  source: string; // page URL
  licenseEvidence: string; // short quote/note from the source page
};

export type SiteVideo = {
  file: string; // "media/sites/<id>--<spot>.mp4", H.264, <= 3 MB, 8–25 s
  poster: string; // "media/sites/<id>--<spot>.jpg"
  caption: string;
  credit: string;
  license: SitePhoto["license"];
  source: string;
  licenseEvidence: string;
  real: boolean; // false = animation
  audio?: string; // what you hear, if it has sound (real mission audio only, no music)
};

export type SiteHotspot = {
  id: string; // kebab-case, unique in the site
  title: string; // 1–4 words
  text: string; // 1–3 short sentences, narrator's voice, curly quotes, accurate
  broken?: boolean; // true = the part that failed / ended the mission (glows red)
  tag?: string; // label instead of "Broken part", e.g. "Why it stopped"
  glow?: string[]; // broken spots placed by position: model parts (mesh or material names) that glow
  glowRadius?: number; // broken spots: glow only this many metres around the spot (0 = the whole part); see stops.ts
  anchor: { part: string; at: [number, number, number]; offset?: [number, number, number] } | { pos: [number, number, number]; ground?: boolean };
  source: { label: string; url: string };
  photo?: SitePhoto;
  video?: SiteVideo;
};

// The real crater an impact left, drawn at true size in the tour (a bowl cut into the ground, its rim, and the
// thrown-out soil coloured around it). Where nobody has photographed it, the numbers are the best published estimate.
export type SiteCrater = {
  diameterM: number; // rim to rim
  depthM: number; // rim crest to floor
  ejecta: "bright" | "dark" | "rays" | "none"; // fresh light soil, dark (often spacecraft material), long streaks, or nothing seen
  source: { label: string; url: string };
  seen: boolean; // true if LRO (or another orbiter) has actually imaged the crater
};

export type SiteFile = {
  id: string; // the atlas id
  // How the site is shown: an intact machine on the ground, a machine in space, or an impact/crash site
  // (a crater or scattered pieces; there is no intact machine to walk around).
  setting: "surface" | "space" | "impact";
  model: string | null; // key in public/models/models.json, or null (impact sites, or no honest model)
  name: string; // short display name, e.g. "Surveyor 3"
  intro: string; // 2–3 sentences: what it is, why it's here, what state it's in now
  status: string; // short status line, e.g. "Silent since 1967"
  hotspots: SiteHotspot[]; // 3–6 discoverable parts
  funFact: string;
  stats?: { label: string; value: string }[]; // 2–4 numbers worth knowing
  // The investigation: the player is a salvage scout working out why each machine was left and whether it
  // could be put back to use. Both are short (1–2 sentences), honest and specific.
  whyLeft: string; // e.g. "It was never meant to come home: the top half needed this bottom half as a launch pad."
  repurpose: string; // a realistic idea, e.g. "Its mirror still works, so future Moon bases could use it to check their position."
  crater?: SiteCrater; // impact sites only
  // Optional staging, where the defaults don't fit:
  modelTilt?: [number, number, number]; // how the machine lies: degrees about x, y, z (e.g. NEAR resting on its panel tips)
  modelCut?: { min: [number, number, number]; max: [number, number, number] }[]; // parts taken away (placed metres)
  sun?: { az: number; el: number }; // e.g. a crater floor the Sun never reaches
  fill?: number; // soft light from all around, so things in permanent shadow can still be seen
  bounds?: number; // how far you can walk from the machine, in metres
  spawn?: { pos: [number, number, number]; look: [number, number, number] }; // where you appear and what you face
};
