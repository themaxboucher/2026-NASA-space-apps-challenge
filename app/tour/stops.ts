import type { SitePhoto, SiteVideo } from "./siteData";
import type { BodyKey } from "./state";

// The guided tour: six machines, two per world, in travel order (outward from Earth).
// Hotspot text is written in a narrator's voice for kids; every hotspot links the NASA page it came from.
// Positions are in meters in the machine's own space: y is up, and a landed machine stands on y = 0.

export type Vec3 = [number, number, number];

export type Anchor =
  // `ground: true` measures y from the terrain under that point instead of from y = 0.
  | { pos: Vec3; ground?: boolean }
  // A point inside a named part's bounding box (mesh or material name), as fractions of that box.
  | { part: string; at: Vec3; offset?: Vec3 };

export type Hotspot = {
  id: string;
  title: string;
  text: string;
  source: { label: string; url: string };
  anchor: Anchor;
  // Which way the hotspot faces, so it hides when you walk behind the machine. null = always visible.
  face?: Vec3 | null;
  // Marks the part that failed: its dot turns red and, if the model has that part as a named piece, the part glows.
  broken?: boolean;
  // Extra named parts to glow (when the anchor is a fixed position), and the card's label instead of "Broken part".
  glow?: string[];
  // Only glow within this many metres of the spot (for a broken part that is one big piece of the model). 0 = the whole
  // part. Left out, a part bigger than a third of the machine glows only near the spot.
  glowRadius?: number;
  tag?: string;
  // From a site file (public/data/sites/<id>.json): a real photo for the card and a clip to play.
  photo?: SitePhoto;
  video?: SiteVideo;
};

export type ModelSpec =
  | {
      kind: "gltf";
      url: string;
      // Scale the model so its bounding box has this height in meters (real size)...
      height?: number;
      // ...or use a fixed scale.
      scale?: number;
      // ...or say how long its longest side really is. If the file is already close to that (within 2.5x) it is
      // trusted as true scale; otherwise it is resized to this.
      span?: number;
      rotationY?: number;
      // Hide parts whose top is above this height in model units (used to remove Eagle's departed top half).
      hideAbove?: number;
      // Resize named parts (mesh or material name) in their own space, e.g. Ingenuity's snapped blades.
      partScale?: [string, Vec3][];
      // Where the model's origin goes: "ground" stands it on y = 0, "center" centers it (for spacecraft).
      origin: "ground" | "center";
      // Optional names of parts that define the center (spacecraft have very long booms).
      centerOn?: string[];
      // How it lies, as rotations about x, y, z in radians (applied before it is stood on the ground).
      tilt?: Vec3;
      // Pieces no longer there: triangles whose middle is inside one of these boxes (placed metres) are cut away.
      cut?: { min: Vec3; max: Vec3 }[];
    }
  | { kind: "lrv" }
  // No model: an impact site (a crater and scattered pieces) or a machine with no honest 3D model.
  | { kind: "none" };

export type Setting = {
  kind: "moon" | "mars" | "space";
  // Surface terrain style.
  terrain?: "mare" | "highlands" | "slope" | "sand";
  sun: { az: number; el: number };
  // Extra soft light from all around, for a place the Sun never reaches (light bounced off far sunlit crater rims).
  fill?: number;
  // Earth's position in the lunar sky (azimuth from north, elevation), from the site's latitude and longitude.
  earth?: { az: number; el: number };
  // What hangs in the sky behind a machine in space: the body it orbits (or hit), or just a far, small Sun.
  backdrop?: BodyKey | "sun-far";
  // Impact sites: the crater's radius in metres, with the machine's pieces scattered around it.
  crater?: number;
  // How big the Sun's glow looks from here (it shrinks with distance). Defaults by backdrop.
  sunSize?: number;
  flatRadius?: number;
};

export type Mark = { kind: "boots" | "tracks"; path: [number, number][]; gauge?: number; width?: number };

export type Ladder = { from: Vec3; to: Vec3; out: Vec3 };

export type Stop = {
  id: string; // matches the atlas data id, so /explore#<id> opens the same machine
  chapter: "Moon" | "Mars" | "Deep space";
  body: "moon" | "mars" | "saturn" | "deep";
  name: string;
  mission: string;
  when: string;
  status: string;
  intro: string;
  // The chapter of the story told before flying here: why this machine mattered.
  story?: { kicker: string; title: string; text: string };
  site?: { lat: number; lon: number };
  // How far this place is from Earth, for the travel counter.
  distanceKm: number;
  distanceLabel: string;
  model: ModelSpec;
  setting: Setting;
  // Where you appear, and what you face, when you arrive.
  spawn: { pos: Vec3; look: Vec3 };
  colliders: { pos: Vec3; r: number }[];
  // A ladder you can climb with W/S: bottom and top rungs, and which way is out (where you stand).
  ladder?: Ladder;
  // Where you stand to watch the replay of what happened here (scene/Ghost.tsx).
  replayView?: { pos: Vec3; look: Vec3 };
  bounds: number;
  hotspots: Hotspot[];
  credit: string;
  // The "mission file" panel beside the scene: a few key numbers and how long it worked against the plan.
  info?: {
    stats: { label: string; value: string }[];
    // Planned versus actual, drawn as a bar (log scale when it lasted far longer than planned).
    plan?: { label: string; planned: number; actual: number; unit: string; note: string };
    // Overrides the atlas record when it has no fate (deep space) or its fun fact repeats a hotspot.
    fate?: { category: string; label: string };
    fun?: string;
  };
  // Extra objects placed in the scene, like Falcon next to the Apollo 15 rover.
  extras?: { kind: "lm-descent" | "blade-piece" | "flag"; pos: Vec3; rotationY: number }[];
  // Boot prints and wheel tracks on the ground (x, z paths in metres around the machine).
  marks?: Mark[];
  // The salvage scout's case: why this machine was left here, and whether it could be put back to use.
  whyLeft?: string;
  repurpose?: string;
};

const LIGHT_KM_PER_HOUR = 299_792.458 * 3600;

const SRC = {
  apollo11: { label: "NASA: Apollo 11", url: "https://www.nasa.gov/mission/apollo-11/" },
  apollo11lm: { label: "NASA NSSDCA: Apollo 11 Lunar Module", url: "https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1969-059C" },
  apollo11landing: { label: "Apollo Lunar Surface Journal: The Landing", url: "https://apollojournals.org/alsj/a11/a11.landing.html" },
  apollo15: { label: "NASA: Apollo 15", url: "https://www.nasa.gov/mission/apollo-15/" },
  apollo15home: { label: "NASA: Apollo 15 heads home", url: "https://www.nasa.gov/history/50-years-ago-apollo-15-heads-home-to-earth/" },
  lrv: { label: "NASA NSSDCA: The Apollo Lunar Roving Vehicle", url: "https://nssdc.gsfc.nasa.gov/planetary/lunar/apollo_lrv.html" },
  mer: { label: "NASA: Spirit and Opportunity", url: "https://science.nasa.gov/mission/mars-exploration-rovers-spirit-and-opportunity/" },
  oppEnd: { label: "NASA: Opportunity's mission comes to an end", url: "https://www.nasa.gov/news-release/nasas-record-setting-opportunity-rover-mission-on-mars-comes-to-end/" },
  ingenuityCrash: { label: "NASA JPL: Ingenuity's accident investigation", url: "https://www.jpl.nasa.gov/news/nasa-performs-first-aircraft-accident-investigation-on-another-world/" },
  ingenuity: { label: "NASA: Ingenuity Mars Helicopter", url: "https://science.nasa.gov/mission/mars-2020-perseverance/ingenuity-mars-helicopter/" },
  wright: { label: "NASA JPL Photojournal: Wright Flyer fabric on Ingenuity", url: "https://photojournal.jpl.nasa.gov/catalog/PIA24438" },
  cassini: { label: "NASA: Cassini", url: "https://science.nasa.gov/mission/cassini/" },
  finale: { label: "NASA: Cassini's Grand Finale", url: "https://science.nasa.gov/mission/cassini/grand-finale/" },
  voyager1: { label: "NASA: Voyager 1", url: "https://science.nasa.gov/mission/voyager/voyager-1/" },
  voyagerCraft: { label: "NASA: The Voyager spacecraft", url: "https://science.nasa.gov/mission/voyager/spacecraft/" },
  record: { label: "NASA: What's on the Golden Record", url: "https://science.nasa.gov/mission/voyager/golden-record-contents/" },
  paleBlueDot: { label: "NASA: Voyager 1's Pale Blue Dot", url: "https://science.nasa.gov/resource/voyager-1s-pale-blue-dot/" },
  lecp: { label: "NASA: Voyager 1 instrument switched off (2026)", url: "https://science.nasa.gov/blogs/voyager/2026/04/17/nasa-shuts-off-instrument-on-voyager-1-to-keep-spacecraft-operating/" },
};

export const STOPS: Stop[] = [
  {
    id: "apollo11-lm",
    story: {
      kicker: "The Moon · Apollo 11 · 20 July 1969",
      title: "One Small Step, One Giant Leap",
      text: "Armstrong and Aldrin landed, and hours later 600 million people watched on TV as they stepped out: the first people to visit another world. They flew home in the top half of their lander. The bottom half is still there.",
    },
    chapter: "Moon",
    body: "moon",
    name: "Eagle",
    mission: "Apollo 11",
    when: "Landed 20 July 1969",
    status: "Parked forever at Tranquility Base",
    intro:
      "This is the bottom half of Eagle, the lander that carried Neil Armstrong and Buzz Aldrin to the first Moon landing. With no wind or rain here, it has stood untouched for 57 years.",
    site: { lat: 0.67416, lon: 23.47314 },
    distanceKm: 384_400,
    distanceLabel: "Distance from Earth",
    model: { kind: "gltf", url: "/models/apollo-lm.gltf.json", scale: 1.43, hideAbove: 2.95, origin: "ground" },
    setting: { kind: "moon", terrain: "mare", sun: { az: 95, el: 16 }, earth: { az: 268, el: 66.5 }, flatRadius: 7 },
    spawn: { pos: [3.2, 0, 11.5], look: [0, 1.6, 0] },
    colliders: [{ pos: [0, 0, 0], r: 3 }],
    ladder: { from: [0, 0.35, 4.05], to: [0, 2.85, 2.55], out: [0, 0, 1] },
    replayView: { pos: [8.5, 0, 15.5], look: [-1.4, 2.2, 4.5] },
    extras: [{ kind: "flag", pos: [-3.4, 0, 8.4], rotationY: 0.6 }],
    marks: [
      { kind: "boots", path: [[0, 4.7], [-1.1, 6], [-1.6, 7.1], [-0.6, 7.3], [0.3, 5]] },
      { kind: "boots", path: [[0.5, 4.8], [3, 7.2], [6, 10], [9, 12.8], [11.5, 15], [9.5, 15.8], [6.5, 12.6], [3.2, 9.3], [0.9, 5.4]] },
      { kind: "boots", path: [[-0.6, 4.8], [-4, 3.6], [-4.8, 0.6], [-4, -3], [-0.4, -4.6], [3.6, -3.4], [4.6, 0.4], [3.4, 3.6], [1, 4.9]] },
      { kind: "boots", path: [[1.2, 5], [-0.4, 10.4], [-0.4, 14.5], [2.4, 13.8], [1.6, 8.6]] },
    ],
    bounds: 32,
    credit: "Apollo Lunar Module model: NASA/Michael D. Carbajal (NASA 3D Resources)",
    info: {
      stats: [
        { label: "Landed", value: "20 July 1969" },
        { label: "Time on the Moon", value: "21 h 36 min" },
        { label: "Moonwalk", value: "2 h 31 min" },
        { label: "Rocks brought home", value: "21.5 kg" },
      ],
      fun: "The computer that helped land Eagle had about 4 kilobytes of working memory. A single photo on a phone today takes up about a thousand times more.",
    },
    whyLeft: "It was never meant to come home. The crew’s cabin blasted off from this bottom half, using it as a launch pad, and the rest stayed behind.",
    repurpose: "It is protected history, so the best use is as a museum on the Moon. Studying it from a distance would show what 57 years of sunlight and cold do to metal.",
    hotspots: [
      {
        id: "first-step",
        title: "The first footstep",
        text: "Neil Armstrong climbed down the ladder, hopped onto this footpad, and stepped onto the Moon at 10:56 p.m. EDT on 20 July 1969. Buzz Aldrin followed him about 19 minutes later.",
        source: SRC.apollo11,
        anchor: { pos: [0, 0.4, 4.3] },
        face: [0, 0, 1],
      },
      {
        id: "bootprint",
        title: "Bootprints",
        text: "There is no wind or rain on the Moon, so these bootprints could last for millions of years. The dust is so fine and sharp that it holds the shape of every ridge on the sole. Buzz Aldrin photographed one of his own prints to study how the soil behaved.",
        source: SRC.apollo11,
        anchor: { pos: [2.95, 0.12, 7.2], ground: true },
        face: null,
      },
      {
        id: "flag",
        title: "The flag",
        text: "Armstrong and Aldrin planted a US flag a few steps from Eagle. When they blasted off, Aldrin saw the engine’s blast knock it over, so it most likely lies in the dust. More than 50 years of strong sunlight have probably faded its colours a lot.",
        source: SRC.apollo11,
        anchor: { pos: [-2.7, 0.15, 9.1], ground: true },
        face: null,
      },
      {
        id: "plaque",
        title: "The plaque",
        text: "A metal plaque on this leg reads: “Here men from the planet Earth first set foot upon the Moon, July 1969, A.D. We came in peace for all mankind.”",
        source: SRC.apollo11lm,
        anchor: { pos: [0, 1.6, 3.4] },
        face: [0, 0, 1],
      },
      {
        id: "top-half",
        title: "The missing top half",
        text: "The crew’s cabin, called the ascent stage, sat right here. On 21 July 1969 it fired its engine and flew back to orbit, using this bottom half as its launch pad.",
        source: SRC.apollo11lm,
        anchor: { pos: [0, 3.75, 0] },
        face: null,
      },
      {
        id: "engine",
        title: "The landing engine",
        text: "This rocket engine slowed Eagle down so it could land gently. Armstrong steered past a field of boulders and touched down with less than a minute of landing fuel left.",
        source: SRC.apollo11landing,
        anchor: { pos: [0.55, 0.85, 0.55] },
        face: [1, 0, 1],
      },
    ],
  },
  {
    id: "apollo15-lrv",
    story: {
      kicker: "The Moon · Apollo 15 · July 1971",
      title: "Man must explore",
      text: "This time the astronauts brought a car. The Lunar Roving Vehicle carried Dave Scott and Jim Irwin almost 28 km, to mountains no walker could reach. When they flew home, it stayed behind.",
    },
    chapter: "Moon",
    body: "moon",
    name: "Lunar Roving Vehicle",
    mission: "Apollo 15",
    when: "Driven 31 July – 2 August 1971",
    status: "Parked forever where it filmed liftoff",
    intro:
      "This is the first car people ever drove on another world. Dave Scott and Jim Irwin drove it about 28 km on three moonwalks, then parked it here to film their own liftoff.",
    site: { lat: 26.13174, lon: 3.63803 },
    distanceKm: 384_400,
    distanceLabel: "Distance from Earth",
    // Team Blender model at real size (front faces -Z in the file), turned so it faces west like the parked rover.
    model: { kind: "gltf", url: "/models/lrv-team.gltf.json", scale: 1, rotationY: Math.PI / 2, origin: "ground", centerOn: ["chassis"] },
    setting: { kind: "moon", terrain: "highlands", sun: { az: 100, el: 22 }, earth: { az: 187, el: 63.6 }, flatRadius: 4 },
    spawn: { pos: [4.5, 0, 5.5], look: [0, 0.8, 0] },
    colliders: [
      { pos: [0, 0, 0], r: 1.6 },
      { pos: [-129, 0, -20], r: 3 },
    ],
    replayView: { pos: [9, 0, -4.5], look: [0, 1, 0] },
    bounds: 160,
    credit: "Rover modelled in Blender by the team from Apollo 15/17 photos and NASA NSSDCA measurements (CC BY 4.0); Falcon: NASA/Michael D. Carbajal (NASA 3D Resources)",
    info: {
      stats: [
        { label: "Driven", value: "27.8 km on 3 moonwalks" },
        { label: "Rover mass", value: "210 kg" },
        { label: "Power", value: "2 non-rechargeable 36 V batteries" },
        { label: "Parked", value: "2 August 1971" },
      ],
      plan: { label: "Battery range used", planned: 92, actual: 27.8, unit: "km", note: "It was built to drive up to 92 km before its batteries ran out." },
      fun: "The rover weighs 210 kg, but in the Moon’s weak gravity it would feel about as heavy as 35 kg does on Earth.",
    },
    // Falcon is 129 m west and 20 m north of where the rover was parked (LROC-measured site coordinates).
    extras: [{ kind: "lm-descent", pos: [-129, 0, -20], rotationY: Math.PI / 2 }],
    // Falcon's ladder: Eagle's ladder turned with the lander (a quarter turn, so it faces +X). Heights are above the
    // ground at its foot.
    ladder: { from: [-124.95, 0.35, -20], to: [-126.45, 2.85, -20], out: [1, 0, 0] },
    marks: [
      { kind: "tracks", gauge: 1.83, width: 0.23, path: [[1.7, 0], [6, 0.8], [10, 4.8], [9, 11], [2, 15], [-15, 18], [-40, 16], [-80, 6], [-122, -14]] },
      { kind: "boots", path: [[-0.6, 1.6], [-3, 3.4], [-6, 4.4], [-9, 3.6], [-6.5, 1.8], [-2.5, -1.6], [0.6, -1.8], [2.2, -0.6]] },
      { kind: "boots", path: [[-128, -15], [-126, -9], [-121, -12], [-124, -18]] },
    ],
    whyLeft: "There was no room to take a car home: the lander’s top half could only lift the two astronauts and their rocks, so the plan was always to park it here.",
    repurpose: "New batteries could make it drive again, but Apollo sites are protected. Photos of its woven wire wheels could help design tyres for new Moon rovers.",
    hotspots: [
      {
        id: "tv-camera",
        title: "The TV camera",
        text: "Engineers in Houston steered this camera by remote control. On 2 August 1971 it filmed Falcon’s top half blasting off, the first liftoff from the Moon ever shown on TV.",
        source: SRC.apollo15home,
        anchor: { pos: [-1.8, 1.3, -0.16] },
        face: null, // it sits on the rover's nose, so keep it findable from behind too
      },
      {
        id: "antenna",
        title: "The umbrella antenna",
        text: "This mesh dish beamed TV pictures from the Moon straight to Earth. Look up and to the south: Earth hangs right where the dish is pointing.",
        source: SRC.lrv,
        anchor: { pos: [-1.58, 2.02, 0.16] },
        face: null,
      },
      {
        id: "wheels",
        title: "Wire wheels",
        text: "These tires have no air inside. They are woven from steel wire, with titanium treads that gripped the dusty ground.",
        source: SRC.lrv,
        anchor: { pos: [1.12, 0.42, 1.1] }, // the rear wheel's hub (it sat on the fender top)
        // Always shown, like the rover's other dots: facing +z it hid from the whole -z side, where the replay
        // leaves you standing, until you walked right round the rover.
        face: null,
      },
      {
        id: "batteries",
        title: "The batteries",
        text: "Two 36-volt batteries powered the rover, and they could not be recharged. Once they ran down, the rover went quiet for good.",
        source: SRC.lrv,
        anchor: { pos: [-1.02, 0.8, 0] },
        face: [0, 1, 0],
        broken: true,
        glow: ["batteries"],
        tag: "Why it can't drive again",
      },
      {
        id: "falcon",
        title: "Falcon",
        text: "This is the bottom half of Falcon, the lander that brought Scott and Irwin here. Its top half blasted off from this spot while the rover’s camera watched.",
        source: SRC.apollo15,
        anchor: { pos: [-129, 3.6, -20], ground: true },
        face: null,
      },
    ],
  },
  {
    id: "opportunity",
    story: {
      kicker: "Mars · Opportunity · 2004–2018",
      title: "I’ll be seeing you",
      text: "Opportunity was built to last 90 days on Mars. It drove for 14 years and proved water once soaked the ground, until a dust storm blotted out the Sun. Its farewell song: “I’ll Be Seeing You”.",
    },
    chapter: "Mars",
    body: "mars",
    name: "Opportunity",
    mission: "Mars Exploration Rover",
    when: "Landed 25 January 2004",
    status: "Silent since 2018",
    intro:
      "Opportunity was built to explore for 90 Martian days. It kept going for more than 14 years, until a dust storm blotted out the Sun in 2018.",
    site: { lat: -2.3288, lon: -5.3503 },
    distanceKm: 225_000_000,
    distanceLabel: "Distance from Earth",
    // Centered on the solar deck: the model's robotic arm reaches far out in front.
    model: { kind: "gltf", url: "/models/mer.gltf.json", height: 1.5, origin: "ground", centerOn: ["tex_panels_n", "tex_panels2_n"] },
    marks: [{ kind: "tracks", gauge: 1.1, width: 0.16, path: [[0, -1], [0.3, -4], [1.5, -10], [4, -18], [8, -28], [10.5, -40]] }],
    setting: { kind: "mars", terrain: "slope", sun: { az: 120, el: 38 }, flatRadius: 3.5 },
    spawn: { pos: [3.4, 0, 4.6], look: [0, 0.7, 0] },
    colliders: [{ pos: [0, 0, 0], r: 1.3 }],
    replayView: { pos: [4.5, 0, 5], look: [0, 0.8, 0] },
    bounds: 55,
    credit: "Spirit and Opportunity rover model: NASA/JPL-Caltech (NASA 3D Resources)",
    info: {
      stats: [
        { label: "Landed", value: "25 January 2004" },
        { label: "Last heard", value: "10 June 2018" },
        { label: "Driven", value: "45.16 km, a marathon" },
        { label: "Power", value: "Sunlight on its solar panels" },
      ],
      plan: { label: "Mission length", planned: 90, actual: 5111, unit: "Mars days", note: "Planned for 90 Mars days. It kept going for 5,111." },
      fun: "You may have heard Opportunity’s last words were “My battery is low and it’s getting dark.” It never said that. A journalist turned its last data, very low power and a very dark sky, into words. The rover only ever sent numbers.",
    },
    whyLeft: "A planet-wide dust storm in 2018 blocked the sunlight its solar panels needed. With no power through the freezing nights, it never woke up.",
    repurpose: "A gust of wind or a robot with a brush might clean its panels, but its battery has probably died in the cold. Newer rovers use nuclear power so dust can’t stop them.",
    hotspots: [
      {
        id: "solar-panels",
        title: "Solar panels",
        text: "Opportunity ran on sunlight caught by these panels. In June 2018 a dust storm covered the whole planet, the sky went dark, and the rover ran out of power.",
        source: SRC.mer,
        anchor: { part: "tex_panels_n", at: [0.97, 1, 0.5] },
        glow: ["tex_panels2_n"],
        face: null,
        broken: true,
        tag: "What gave out",
      },
      {
        id: "mast",
        title: "The camera mast",
        text: "Opportunity’s cameras sit on top of this mast, about 1.5 meters off the ground. They sent home more than 217,000 pictures of Mars.",
        source: SRC.oppEnd,
        anchor: { part: "tex_mast", at: [0.5, 1, 0.5] },
        face: null,
      },
      {
        id: "wheels",
        title: "Six wheels",
        text: "Opportunity drove more than 45 km, farther than a marathon. In 2015 it became the first robot to finish a marathon on another world.",
        source: SRC.oppEnd,
        anchor: { part: "tex_suspension_n", at: [1, 0.3, 0.92] },
        face: [1, 0, 0],
      },
      {
        id: "last-message",
        title: "The last message",
        text: "Opportunity’s last message reached Earth on 10 June 2018. For eight months NASA sent more than a thousand commands to wake it up, but it never answered.",
        source: SRC.oppEnd,
        // The high-gain dish (the dark disc on the deck) that talked straight to Earth, just past its silver mount.
        anchor: { part: "Silver", at: [0.5, 1, 0.5], offset: [0.24, -0.03, -0.18] },
        face: null,
      },
    ],
  },
  {
    id: "ingenuity",
    story: {
      kicker: "Mars · Ingenuity · 2021–2024",
      title: "A Wright brothers moment on Mars",
      text: "Mars air is 100 times thinner than Earth’s, so few thought anything could fly there. Carrying a scrap of the Wright brothers’ first airplane, Ingenuity flew 72 times before a hard landing.",
    },
    chapter: "Mars",
    body: "mars",
    name: "Ingenuity",
    mission: "Mars Helicopter",
    when: "First flight 19 April 2021",
    status: "Grounded since 2024",
    intro:
      "Ingenuity was the first aircraft to make a powered, controlled flight on another planet. It is only 49 cm tall, so look down!",
    site: { lat: 18.4973, lon: 77.3225 },
    distanceKm: 225_000_000,
    distanceLabel: "Distance from Earth",
    // All four blades snapped about a third of the way from the tip, so they are drawn two-thirds long.
    model: { kind: "gltf", url: "/models/ingenuity.gltf.json", scale: 1, origin: "ground", partScale: [["blades", [1, 1, 0.66]]] },
    setting: { kind: "mars", terrain: "sand", sun: { az: 200, el: 42 }, flatRadius: 1.6 },
    spawn: { pos: [1.6, 0, 2.3], look: [0, 0.25, 0] },
    colliders: [{ pos: [0, 0, 0], r: 0.75 }],
    bounds: 45,
    credit: "Ingenuity model: NASA/JPL-Caltech (NASA 3D Resources)",
    info: {
      stats: [
        { label: "First flight", value: "19 April 2021" },
        { label: "Last flight", value: "18 January 2024" },
        { label: "Time in the air", value: "More than 2 hours" },
        { label: "Mass", value: "1.8 kg" },
      ],
      plan: { label: "Flights", planned: 5, actual: 72, unit: "flights", note: "It was meant to try just 5 test flights. It flew 72." },
      fun: "The air on Mars is about 100 times thinner than on Earth, so Ingenuity’s blades had to spin about 2,400 times a minute just to lift it off the ground.",
    },
    extras: [{ kind: "blade-piece", pos: [-15, 0, 0.6], rotationY: 0.7 }],
    whyLeft: "Its rotor blades snapped in a hard landing on its 72nd flight. It can still switch on, but it can never fly again.",
    repurpose: "NASA turned it into a test station that stays on the ground and keeps recording data. Spare blades fitted by a robot arm could make a helicopter fly again, and its crash taught engineers how to build the next one.",
    hotspots: [
      {
        id: "blades",
        title: "Broken rotor blades",
        text: "On its 72nd flight, on 18 January 2024, Ingenuity landed hard on a sand ripple. All four blades snapped about a third of the way from the tip, and the shaking tore one blade off completely.",
        source: SRC.ingenuityCrash,
        // The snapped, glowing tip of a lower blade (the old spot hung in the air past the shortened blades).
        anchor: { pos: [-0.25, 0.36, 0.21] },
        face: null,
        broken: true,
      },
      {
        id: "blade-piece",
        title: "A piece of blade",
        text: "Perseverance photographed this piece of one of Ingenuity’s blades lying on the sand, about 15 meters west of the helicopter.",
        source: SRC.ingenuityCrash,
        anchor: { pos: [-15, 0.14, 0.6], ground: true },
        face: null,
        broken: true,
      },
      {
        id: "nav-camera",
        title: "The navigation camera",
        text: "This camera watched the ground to work out how fast Ingenuity was moving. Over this smooth, featureless sand it could not find enough landmarks, which led to the hard landing.",
        source: SRC.ingenuityCrash,
        anchor: { part: "cams", at: [1, 0, 0.5] },
        face: [1, 0, 0],
      },
      {
        id: "solar-panel",
        title: "Solar panel",
        text: "This panel charged Ingenuity’s batteries. Tucked underneath it is a stamp-sized piece of fabric from the Wright brothers’ 1903 Flyer, the first airplane on Earth.",
        source: SRC.wright,
        anchor: { part: "chopper_sp", at: [0.5, 1, 0.5] },
        face: null,
      },
      {
        id: "flights",
        title: "Planned 5, flew 72",
        text: "Ingenuity was designed for up to five test flights over 30 days. It flew 72 times and spent more than two hours in the air.",
        source: SRC.ingenuityCrash,
        // The foot of a landing leg (it touched down 72 times), so it doesn't sit on the body beside the camera's spot.
        anchor: { part: "leg_03", at: [0.9, 0.08, 0.9] },
        face: null,
      },
    ],
  },
  {
    id: "cassini",
    story: {
      kicker: "Saturn · Cassini · 2004–2017",
      title: "The Grand Finale",
      text: "Cassini circled Saturn 294 times and found a hidden ocean on the moon Enceladus. Low on fuel, it was steered into Saturn on purpose, so it could never crash into a moon that might hold life.",
    },
    chapter: "Deep space",
    body: "saturn",
    name: "Cassini",
    mission: "Cassini–Huygens",
    when: "Arrived at Saturn 30 June 2004",
    status: "Plunged into Saturn in 2017",
    intro:
      "Cassini spent 13 years exploring Saturn and its moons. Low on fuel, it was steered into Saturn on 15 September 2017, sending back science until the very end.",
    distanceKm: 1.2 * LIGHT_KM_PER_HOUR,
    distanceLabel: "Saturn’s distance from Earth this month",
    model: { kind: "gltf", url: "/models/cassini.gltf.json", scale: 1, origin: "center", centerOn: ["dish", "plastic_dark", "black_krinkle"] },
    setting: { kind: "space", sun: { az: 150, el: 25 }, backdrop: "saturn" },
    spawn: { pos: [9, 1.5, 9], look: [0, 0, 0] },
    colliders: [{ pos: [0, 0, 0], r: 3.4 }],
    bounds: 60,
    credit: "Cassini-Huygens model: NASA/Brian E. Kumanchik (NASA 3D Resources)",
    info: {
      stats: [
        { label: "Launched", value: "15 October 1997" },
        { label: "Orbits of Saturn", value: "294" },
        { label: "Pictures sent home", value: "More than 450,000" },
        { label: "Final plunge", value: "15 September 2017" },
      ],
      plan: { label: "Years at Saturn", planned: 4, actual: 13, unit: "years", note: "The main mission was 4 years at Saturn. Cassini stayed for 13." },
      fate: { category: "crash-planned", label: "Steered into Saturn on 15 September 2017, where it burned up in the clouds. Nothing of it is left: NASA chose this ending so it could never crash into a moon that might hold life." },
      fun: "Cassini flew right through the icy spray shooting out of the moon Enceladus and “tasted” it: it is salty water from an ocean hidden under the ice.",
    },
    whyLeft: "It was running out of fuel. NASA steered it into Saturn on purpose, so it could never crash into a moon that might have life.",
    repurpose: "Nothing is left to reuse: it burned up in Saturn’s clouds. What lives on is its data, which scientists are still studying.",
    hotspots: [
      {
        id: "dish",
        title: "The big dish",
        text: "This 4-meter dish was Cassini’s radio link to Earth. Over 13 years it sent home more than 450,000 pictures.",
        source: SRC.cassini,
        anchor: { part: "dish", at: [0.5, 1, 0.5] },
        face: null,
      },
      {
        id: "huygens",
        title: "Where Huygens rode",
        text: "Europe’s Huygens probe rode here, on Cassini’s side. It landed on Saturn’s moon Titan on 14 January 2005, the farthest landing anyone has ever made.",
        source: SRC.cassini,
        anchor: { part: "tex_01_h", at: [1, 0.5, 0.5] },
        face: [1, 0, 0],
      },
      {
        id: "engines",
        title: "Engines and fuel",
        text: "Cassini’s engines steered it on 294 orbits of Saturn. When the fuel ran low, NASA sent it into Saturn so it could never crash into Enceladus or Titan, moons that might be able to support life.",
        source: SRC.finale,
        anchor: { part: "plastic_dark", at: [0.5, 0, 0.5] },
        face: null,
      },
      {
        id: "boom",
        title: "The long boom",
        text: "This 11-meter boom held a sensor far from the spacecraft’s own electronics, so it could measure Saturn’s magnetic field.",
        source: SRC.cassini,
        anchor: { part: "aluminum", at: [0.5, 0.75, 0.08] },
        face: null,
      },
    ],
  },
  {
    id: "voyager1",
    story: {
      kicker: "Deep space · Voyager 1 · since 1977",
      title: "The Pale Blue Dot",
      text: "In 1990, Voyager 1 looked back and photographed Earth as a speck: a pale blue dot. Now 25 billion km away, it is the farthest thing people have ever built. Its power is fading, but it still phones home.",
    },
    chapter: "Deep space",
    body: "deep",
    name: "Voyager 1",
    mission: "Voyager",
    when: "Launched 5 September 1977",
    status: "Still whispering home",
    intro:
      "Voyager 1 is the farthest human-made object. This month it reaches one light-day from Earth: its radio messages take a whole day to get home.",
    distanceKm: 24 * LIGHT_KM_PER_HOUR,
    distanceLabel: "Distance from Earth this month",
    model: { kind: "gltf", url: "/models/voyager.gltf.json", scale: 1, origin: "center", centerOn: ["tex_02_AO", "tex_02_AO_dark"] },
    setting: { kind: "space", sun: { az: 0, el: 90 }, backdrop: "sun-far" },
    spawn: { pos: [7, 1, 8], look: [0, 0, 0] },
    colliders: [{ pos: [0, 0, 0], r: 2.4 }],
    bounds: 60,
    credit: "Voyager model: NASA/Michael D. Carbajal (NASA 3D Resources)",
    info: {
      stats: [
        { label: "Launched", value: "5 September 1977" },
        { label: "Distance from the Sun", value: "About 172 AU" },
        { label: "Radio time to Earth", value: "About one day" },
        { label: "Instruments still on", value: "2" },
      ],
      plan: { label: "Mission length", planned: 5, actual: 49, unit: "years", note: "Built for a 5-year trip past Jupiter and Saturn. It is still working 49 years later." },
      fate: { category: "operational", label: "Still working, but its power fades a little every year. Engineers switch off one instrument at a time so it can keep calling home." },
      fun: "Voyager 1 calls home with a radio of about 23 watts, roughly as strong as a fridge light bulb. It takes dishes 70 meters wide on Earth to hear it.",
    },
    whyLeft: "It was never left: it is still working, 25 billion km away. It just can’t come back, because nothing could catch it and bring it home.",
    repurpose: "It is already being reused: built for Jupiter and Saturn, it now measures interstellar space. Engineers fix it by radio, with every message taking almost a day.",
    hotspots: [
      {
        id: "dish",
        title: "Pointing home",
        text: "This 3.7-meter dish always points back at Earth. The bright star it aims at is the Sun; Earth is far too small and faint to see from here.",
        source: SRC.voyagerCraft,
        anchor: { part: "tex_02_AO", at: [0.5, 1, 0.5] },
        face: null,
      },
      {
        id: "record",
        title: "The Golden Record",
        text: "A gold-plated record on Voyager’s side carries 115 pictures, sounds of Earth, music, and greetings in 55 languages, in case anyone out there ever finds it.",
        source: SRC.record,
        anchor: { part: "tex_02_AO_dark", at: [0.85, 0.4, 0.88] },
        face: [0.66, 0, 0.75],
      },
      {
        id: "power",
        title: "Nuclear power",
        text: "Voyager runs on three nuclear power generators that get a little weaker every year. To save power, engineers have switched off most of its instruments, the latest in April 2026.",
        source: SRC.lecp,
        // The three power generators sit end to end on the boom that runs along +z.
        anchor: { pos: [0, -1.6, 3.6] },
        face: null,
      },
      {
        id: "cameras",
        title: "The cameras",
        text: "Voyager’s cameras were switched off for good on 14 February 1990, just after they took a “Family Portrait” of the planets, including the Pale Blue Dot picture of Earth.",
        source: SRC.paleBlueDot,
        // The scan platform with the cameras, at the end of the science boom (-z).
        anchor: { pos: [0, -0.45, -3.7] },
        face: null,
      },
      {
        id: "boom",
        title: "Feeling interstellar space",
        text: "This 13-meter boom carries a magnetometer that still measures the magnetic field of interstellar space, which Voyager 1 entered in 2012.",
        source: SRC.voyager1,
        // About a third of the way out along the magnetometer boom, which angles up and back.
        anchor: { pos: [0, 4.2, 8.2] },
        face: null,
      },
    ],
  },
];

// The six story stops come first. Any other machine opened at runtime (sites.ts) is appended after them, so
// everything that means "the story" (trail, Next, the end screen) counts only these.
export const STORY_COUNT = STOPS.length;

export const STOP_INDEX: Record<string, number> = Object.fromEntries(STOPS.map((s, i) => [s.id, i]));

export const CHAPTERS = ["Moon", "Mars", "Deep space"] as const;

export const CREDITS = [
  "Earth: NASA Earth Observatory: Blue Marble: Next Generation (November 2004), Blue Marble clouds (Terra MODIS, 2001) and Earth at Night / Black Marble 2016 (Suomi NPP VIIRS). Public domain.",
  "Moon map and relief: NASA Scientific Visualization Studio CGI Moon Kit (LRO LROC WAC colour mosaic: NASA/GSFC/Arizona State University, educational use with credit; LOLA elevation: NASA/GSFC, public domain).",
  "Mars map and relief: USGS Astrogeology Science Center / NASA: Viking MDIM 2.1 colourised global mosaic and MGS MOLA elevation (MOLA Science Team, NASA/GSFC). Public domain.",
  "3D spacecraft: NASA 3D Resources (Apollo Lunar Module and Voyager: NASA/Michael D. Carbajal; Mars Exploration Rover: NASA/JPL-Caltech; Ingenuity: NASA/JPL-Caltech; Cassini-Huygens: NASA/Brian E. Kumanchik).",
  "The Apollo 15 rover was built for this site from NASA NSSDCA measurements. Saturn and its rings are drawn in code from their real sizes.",
  "Facts: NASA, NASA JPL and the NSSDCA catalog. Every hotspot links the page it came from.",
  "Film, photos and radio: NASA, NASA JPL and the Apollo Lunar Surface Journal (NASA). Public domain except where marked (LROC images from NASA/GSFC/Arizona State University are used for education with credit). Each clip and photo names its source and licence.",
  "Uranus, Neptune, Pluto, Jupiter, Venus, Mercury and the heliopause are drawn in code from their real colours and features (NASA Voyager, New Horizons and Juno images as reference).",
  "Space debris around Earth: the swarm is illustrative, its shells follow real orbits (low Earth orbit, GPS, geostationary). Its numbers: ESA Space Debris Office, “Space debris by the numbers” (see the Earth’s orbit card on the start screen).",
  "Other sites: hotspots, photos and clips from public/data/sites, each with its own source and licence; salvage grades from the atlas salvage file.",
  "Music: Satie, Gymnopédie No. 1 (Robin Alciatore, Musopen, public domain) · Debussy, Clair de lune (Laurens Goedhart, CC BY 3.0, https://creativecommons.org/licenses/by/3.0/, excerpt) · Grieg, Morning Mood (Musopen Symphony, public domain) · Dvořák, Symphony No. 9, Largo (Musopen, public domain).",
];
