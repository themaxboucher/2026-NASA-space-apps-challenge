import type { ReactNode } from "react";

// The explorer figure wears the NASA suit of the timeline's year. Every suit shares one skeleton
// (shoulders 10.9/29.1,22.5 · hips 17/23,37.5) so the engine's ragdoll sway works the same for all.
type Palette = { suit: [string, string, string]; dark: [string, string]; visor: [string, string, string] };

type Suit = Palette & {
  id: string;
  from: number;
  to: number;
  rim?: string;
  armBand?: string;
  legBand?: string;
  pack?: ReactNode;
  chest?: ReactNode;
  helmet: (g: Grads) => ReactNode;
};

type Grads = { suit: string; dark: string; visor: string };

const LIMB_X = { L: { arm: 8.6, leg: 14.4 }, R: { arm: 26.8, leg: 20.4 } } as const;

function Leg({ side, g, band, rim }: { side: "L" | "R"; g: Grads; band?: string; rim?: string }) {
  const x = LIMB_X[side].leg;
  return (
    <g className={`pm-leg${side}`}>
      <rect x={x} y="36" width="5.2" height="18" rx="2.6" fill={g.suit} {...rimProps(rim)} />
      {band && <rect x={x} y="41.5" width="5.2" height="1.6" fill={band} />}
      <rect x={x - 0.4} y="52" width="6" height="4.6" rx="2" fill={g.dark} />
    </g>
  );
}

function Arm({ side, g, band, rim }: { side: "L" | "R"; g: Grads; band?: string; rim?: string }) {
  const x = LIMB_X[side].arm;
  return (
    <g className={`pm-arm${side}`}>
      <rect x={x} y="20.5" width="4.6" height="14" rx="2.3" fill={g.suit} {...rimProps(rim)} />
      {band && <rect x={x} y="25" width="4.6" height="1.5" fill={band} />}
      <circle cx={x + 2.3} cy="35" r="2.5" fill={g.dark} />
    </g>
  );
}

const rimProps = (rim?: string) => (rim ? { stroke: rim, strokeOpacity: 0.5, strokeWidth: 0.6 } : {});

// Shared visor shapes.
const roundVisor = (fill: string) => (
  <path d="M12.6 10.2c0-3.3 3.3-5.3 7.4-5.3s7.4 2 7.4 5.3c0 2.9-3.1 4.6-7.4 4.6s-7.4-1.7-7.4-4.6z" fill={fill} />
);
const bigVisor = (fill: string) => (
  <path d="M12.2 10.4c0-3.6 3.5-6 7.8-6s7.8 2.4 7.8 6c0 3.1-3.3 5.1-7.8 5.1s-7.8-2-7.8-5.1z" fill={fill} />
);
const glint = (
  <>
    <path d="M14.8 8.4c1.4-1.3 3.2-1.9 5.4-1.9" stroke="#ffffff" strokeOpacity=".75" strokeWidth="1.1" fill="none" strokeLinecap="round" />
    <circle cx="25.1" cy="11.6" r=".7" fill="#ffffff" fillOpacity=".45" />
  </>
);

const GOLD: [string, string, string] = ["#ffe39a", "#d39a2c", "#6e4511"];

export const SUITS: Suit[] = [
  {
    // Mercury: Navy Mark IV-derived silver pressure suit, small helmet with a faceplate, no backpack.
    id: "mercury", from: 1959, to: 1963,
    suit: ["#f4f6f9", "#c3c9d1", "#7f8894"], dark: ["#8d96a2", "#4b525c"], visor: ["#4a6a86", "#13202c", "#2c4258"],
    chest: (
      <>
        <rect x="19.6" y="21" width=".8" height="15" rx=".4" fill="#8d96a2" />
        <circle cx="16.2" cy="28.5" r="1.3" fill="#2a2f37" />
        <circle cx="16.2" cy="31.8" r="1.3" fill="#2a2f37" />
      </>
    ),
    helmet: g => (
      <>
        <circle cx="20" cy="11" r="8.2" fill={g.suit} />
        <rect x="14.2" y="6.6" width="11.6" height="8.8" rx="3.2" fill={g.visor} />
        <path d="M15.8 8.6c1.1-.9 2.4-1.3 3.9-1.3" stroke="#ffffff" strokeOpacity=".7" strokeWidth="1" fill="none" strokeLinecap="round" />
      </>
    ),
  },
  {
    // Gemini G4C: off-white EVA cover, tall helmet with a central ridge, chest-mounted life support.
    id: "gemini", from: 1964, to: 1966,
    suit: ["#fbf9f4", "#e5e1d8", "#aaa59b"], dark: ["#7a7f87", "#3d4148"], visor: ["#3b5269", "#0c121a", "#24364a"],
    chest: (
      <>
        <rect x="15" y="23" width="10" height="7.2" rx="1.6" fill="#a4abb4" />
        <rect x="16.4" y="24.4" width="3" height="1.6" rx=".5" fill="#5d646e" />
        <circle cx="22.6" cy="25.2" r=".9" fill="#5d646e" />
        <rect x="13.4" y="21.2" width="2.2" height="1.4" fill="#c8102e" />
      </>
    ),
    helmet: g => (
      <>
        <ellipse cx="20" cy="10.6" rx="8.5" ry="9.4" fill={g.suit} />
        <rect x="19.3" y="1.2" width="1.4" height="5" rx=".7" fill="#c9c4ba" />
        <rect x="13.4" y="6" width="13.2" height="10" rx="4.6" fill={g.visor} />
        <path d="M15.4 8.4c1.3-1.1 2.9-1.6 4.7-1.6" stroke="#ffffff" strokeOpacity=".7" strokeWidth="1" fill="none" strokeLinecap="round" />
      </>
    ),
  },
  {
    // Apollo A7L: bubble helmet under a gold sun visor, big PLSS backpack, commander's red bands.
    id: "apollo", from: 1967, to: 1980,
    suit: ["#ffffff", "#e8eaee", "#aeb4bd"], dark: ["#6f7680", "#353a42"], visor: GOLD,
    armBand: "#c8102e", legBand: "#c8102e",
    pack: (
      <>
        <rect x="9.4" y="14.8" width="21.2" height="22.4" rx="2.6" fill="#cfd4db" />
        <rect x="11.4" y="13" width="17.2" height="3" rx="1.2" fill="#b5bbc4" />
      </>
    ),
    chest: (
      <>
        <rect x="15.4" y="22.6" width="9.2" height="5" rx="1.2" fill="#9097a1" />
        <circle cx="16.4" cy="32" r="1.1" fill="#c8102e" />
        <circle cx="23.6" cy="32" r="1.1" fill="#1f5fd1" />
      </>
    ),
    helmet: g => (
      <>
        <circle cx="20" cy="10.6" r="9.6" fill={g.suit} />
        {bigVisor(g.visor)}
        {glint}
      </>
    ),
  },
  {
    // Shuttle/ISS EMU: hard upper torso with a display-and-control module, boxy backpack, helmet lamps.
    id: "emu", from: 1981, to: 2021,
    suit: ["#ffffff", "#e6e9ee", "#a7aeb8"], dark: ["#5d646e", "#2b2f36"], visor: GOLD,
    legBand: "#c8102e",
    pack: <rect x="8.8" y="15.8" width="22.4" height="20.6" rx="1.6" fill="#c4c9d1" />,
    chest: (
      <>
        <rect x="14.4" y="23.6" width="11.2" height="5.8" rx="1" fill="#6d747e" />
        <rect x="16" y="25" width="5" height="1.4" rx=".4" fill="#7fd3ff" />
        <circle cx="23.4" cy="25.7" r=".8" fill="#c9ced5" />
        <rect x="13.6" y="33.6" width="12.8" height="1.4" rx=".6" fill="#9aa1ab" />
      </>
    ),
    helmet: g => (
      <>
        <circle cx="20" cy="10.6" r="9.2" fill={g.suit} />
        {bigVisor(g.visor)}
        <rect x="9.4" y="4.2" width="3.2" height="4.6" rx="1" fill="#4a5059" />
        <rect x="27.4" y="4.2" width="3.2" height="4.6" rx="1" fill="#4a5059" />
        <rect x="10" y="4.8" width="2" height="1.4" rx=".4" fill="#fff6d6" />
        <rect x="28" y="4.8" width="2" height="1.4" rx=".4" fill="#fff6d6" />
        {glint}
      </>
    ),
  },
  {
    // Artemis AxEMU (reveal cover): charcoal suit with orange and blue trim, helmet light halo.
    id: "axemu", from: 2022, to: 9999,
    suit: ["#6a717b", "#454a52", "#2a2e34"], dark: ["#33373e", "#16181c"], visor: ["#34425a", "#07090d", "#1b2638"],
    rim: "#d3dae3", armBand: "#ff7a1a", legBand: "#2f7fff",
    pack: <rect x="9.4" y="15.6" width="21.2" height="21" rx="3.4" fill="#2c3036" stroke="#d3dae3" strokeOpacity=".35" strokeWidth=".6" />,
    chest: (
      <>
        <path d="M14.2 22.6h11.6" stroke="#ff7a1a" strokeWidth="1.3" strokeLinecap="round" />
        <rect x="16.6" y="25.6" width="6.8" height="4.4" rx="1" fill="#2a2e34" />
        <rect x="17.6" y="26.8" width="3.2" height="1.1" rx=".4" fill="#2f7fff" />
      </>
    ),
    helmet: g => (
      <>
        <circle cx="20" cy="10.6" r="9.4" fill={g.suit} stroke="#d3dae3" strokeOpacity=".5" strokeWidth=".6" />
        {roundVisor(g.visor)}
        <path d="M13.4 4.4c3.9-3 9.3-3 13.2 0" stroke="#bfe3ff" strokeWidth="1.1" fill="none" strokeLinecap="round" strokeDasharray=".9 1.3" />
        {glint}
      </>
    ),
  },
];

export const suitFor = (year: number) => SUITS.find(s => year >= s.from && year <= s.to) ?? SUITS[SUITS.length - 1];

function SuitSvg({ s, on }: { s: Suit; on: boolean }) {
  const ids = { suit: `pm-${s.id}-s`, dark: `pm-${s.id}-d`, visor: `pm-${s.id}-v` };
  const g: Grads = { suit: `url(#${ids.suit})`, dark: `url(#${ids.dark})`, visor: `url(#${ids.visor})` };
  return (
    <svg viewBox="-6 -2 52 72" aria-hidden="true" className={on ? "on" : undefined} data-suit={s.id} data-from={s.from} data-to={s.to}>
      <defs>
        <linearGradient id={ids.suit} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={s.suit[0]} /><stop offset=".55" stopColor={s.suit[1]} /><stop offset="1" stopColor={s.suit[2]} />
        </linearGradient>
        <linearGradient id={ids.dark} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={s.dark[0]} /><stop offset="1" stopColor={s.dark[1]} />
        </linearGradient>
        <linearGradient id={ids.visor} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={s.visor[0]} /><stop offset=".55" stopColor={s.visor[1]} /><stop offset="1" stopColor={s.visor[2]} />
        </linearGradient>
      </defs>
      {s.pack}
      <Leg side="L" g={g} band={s.legBand} rim={s.rim} />
      <Leg side="R" g={g} band={s.legBand} rim={s.rim} />
      <Arm side="L" g={g} band={s.armBand} rim={s.rim} />
      <Arm side="R" g={g} band={s.armBand} rim={s.rim} />
      <rect x="12.5" y="19" width="15" height="20" rx={s.id === "emu" ? 3.4 : 5.5} fill={g.suit} {...rimProps(s.rim)} />
      {s.chest}
      <rect x="15.2" y="18" width="9.6" height="2.4" rx="1.2" fill={g.dark} />
      {s.helmet(g)}
    </svg>
  );
}

// Defaults to the timeline's starting year (2026); the engine switches suits as the year changes.
export function ExplorerSuits({ year = 2026 }: { year?: number }) {
  const current = suitFor(year);
  return (
    <span className="pm-hop">
      <span className="pm-rig">
        {SUITS.map(s => <SuitSvg key={s.id} s={s} on={s === current} />)}
      </span>
    </span>
  );
}
