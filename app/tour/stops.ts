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
  tag?: string;
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
      // Where the model's origin goes: "ground" stands it on y = 0, "center" centers it (for spacecraft).
      origin: "ground" | "center";
      // Optional names of parts that define the center (spacecraft have very long booms).
      centerOn?: string[];
    }
  | { kind: "lrv" };

export type Setting = {
  kind: "moon" | "mars" | "space";
  // Surface terrain style.
  terrain?: "mare" | "highlands" | "slope" | "sand";
  sun: { az: number; el: number };
  // Earth's position in the lunar sky (azimuth from north, elevation), from the site's latitude and longitude.
  earth?: { az: number; el: number };
  backdrop?: "saturn" | "sun-far";
  // How big the Sun's glow looks from here (it shrinks with distance). Defaults by backdrop.
  sunSize?: number;
  flatRadius?: number;
};

export type Stop = {
  id: string; // matches the atlas data id, so /explore#<id> opens the same machine
  chapter: "Moon" | "Mars" | "Deep space";
  body: "moon" | "mars" | "saturn" | "deep";
  name: string;
  mission: string;
  when: string;
  status: string;
  intro: string;
  site?: { lat: number; lon: number };
  // How far this place is from Earth, for the travel counter.
  distanceKm: number;
  distanceLabel: string;
  model: ModelSpec;
  setting: Setting;
  // Where you appear, and what you face, when you arrive.
  spawn: { pos: Vec3; look: Vec3 };
  colliders: { pos: Vec3; r: number }[];
  bounds: number;
  hotspots: Hotspot[];
  credit: string;
  // The "mission file" panel beside the scene: a few key numbers and how long it worked against the plan.
  info?: {
    stats: { label: string; value: string }[];
    // Planned versus actual, drawn as a bar (log scale when it lasted far longer than planned).
    plan?: { label: string; planned: number; actual: number; unit: string; note: string };
  };
  // Extra objects placed in the scene, like Falcon next to the Apollo 15 rover.
  extras?: { kind: "lm-descent" | "blade-piece"; pos: Vec3; rotationY: number }[];
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
    distanceLabel: "Average distance from Earth",
    model: { kind: "gltf", url: "/models/apollo-lm.gltf.json", scale: 1.43, hideAbove: 2.95, origin: "ground" },
    setting: { kind: "moon", terrain: "mare", sun: { az: 95, el: 16 }, earth: { az: 268, el: 66.5 }, flatRadius: 7 },
    spawn: { pos: [3.2, 0, 11.5], look: [0, 1.6, 0] },
    colliders: [{ pos: [0, 0, 0], r: 3 }],
    bounds: 55,
    credit: "Apollo Lunar Module model: NASA/Michael D. Carbajal (NASA 3D Resources)",
    info: {
      stats: [
        { label: "Landed", value: "20 July 1969" },
        { label: "Time on the Moon", value: "21 h 36 min" },
        { label: "Moonwalk", value: "2 h 31 min" },
        { label: "Rocks brought home", value: "21.5 kg" },
      ],
    },
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
    distanceLabel: "Average distance from Earth",
    // Team Blender model at real size (front faces -Z in the file), turned so it faces west like the parked rover.
    model: { kind: "gltf", url: "/models/lrv-team.gltf.json", scale: 1, rotationY: Math.PI / 2, origin: "ground", centerOn: ["chassis"] },
    setting: { kind: "moon", terrain: "highlands", sun: { az: 100, el: 22 }, earth: { az: 187, el: 63.6 }, flatRadius: 4 },
    spawn: { pos: [4.5, 0, 5.5], look: [0, 0.8, 0] },
    colliders: [
      { pos: [0, 0, 0], r: 1.6 },
      { pos: [-129, 0, -20], r: 3 },
    ],
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
    },
    // Falcon is 129 m west and 20 m north of where the rover was parked (LROC-measured site coordinates).
    extras: [{ kind: "lm-descent", pos: [-129, 0, -20], rotationY: Math.PI / 2 }],
    hotspots: [
      {
        id: "tv-camera",
        title: "The TV camera",
        text: "Engineers in Houston steered this camera by remote control. On 2 August 1971 it filmed Falcon’s top half blasting off, the first liftoff from the Moon ever shown on TV.",
        source: SRC.apollo15home,
        anchor: { pos: [-1.8, 1.3, -0.16] },
        face: [-1, 0, 0],
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
        anchor: { pos: [1.15, 0.82, 1.06] },
        face: [0, 0, 1],
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
    distanceLabel: "Average distance from Earth",
    // Centered on the solar deck: the model's robotic arm reaches far out in front.
    model: { kind: "gltf", url: "/models/mer.gltf.json", height: 1.5, origin: "ground", centerOn: ["tex_panels_n", "tex_panels2_n"] },
    setting: { kind: "mars", terrain: "slope", sun: { az: 120, el: 38 }, flatRadius: 3.5 },
    spawn: { pos: [3.4, 0, 4.6], look: [0, 0.7, 0] },
    colliders: [{ pos: [0, 0, 0], r: 1.3 }],
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
    },
    hotspots: [
      {
        id: "solar-panels",
        title: "Solar panels",
        text: "Opportunity ran on sunlight caught by these panels. In June 2018 a dust storm covered the whole planet, the sky went dark, and the rover ran out of power.",
        source: SRC.mer,
        anchor: { part: "tex_panels_n", at: [0.82, 1, 0.5] },
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
        anchor: { part: "tex_instruments", at: [0.5, 1, 0.5] },
        face: null,
      },
    ],
  },
  {
    id: "ingenuity",
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
    distanceLabel: "Average distance from Earth",
    model: { kind: "gltf", url: "/models/ingenuity.gltf.json", scale: 1, origin: "ground" },
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
    },
    extras: [{ kind: "blade-piece", pos: [-15, 0, 0.6], rotationY: 0.7 }],
    hotspots: [
      {
        id: "blades",
        title: "Broken rotor blades",
        text: "On its 72nd flight, on 18 January 2024, Ingenuity landed hard on a sand ripple. All four blades snapped about a third of the way from the tip, and the shaking tore one blade off completely.",
        source: SRC.ingenuityCrash,
        anchor: { pos: [0, 0.44, -0.4] },
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
        anchor: { part: "solar_panel", at: [0.5, 1, 0.5] },
        face: null,
      },
      {
        id: "flights",
        title: "Planned 5, flew 72",
        text: "Ingenuity was designed for up to five test flights over 30 days. It flew 72 times and spent more than two hours in the air.",
        source: SRC.ingenuityCrash,
        anchor: { part: "bus", at: [0, 0.5, 0.5] },
        face: [-1, 0, 0],
      },
    ],
  },
  {
    id: "cassini",
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
    },
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
    },
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
        anchor: { pos: [0, -0.1, 3.4] },
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

export const STOP_INDEX: Record<string, number> = Object.fromEntries(STOPS.map((s, i) => [s.id, i]));

export const CHAPTERS = ["Moon", "Mars", "Deep space"] as const;

export const CREDITS = [
  "Earth: NASA Earth Observatory: Blue Marble: Next Generation (November 2004), Blue Marble clouds (Terra MODIS, 2001) and Earth at Night / Black Marble 2016 (Suomi NPP VIIRS). Public domain.",
  "Moon map and relief: NASA Scientific Visualization Studio CGI Moon Kit (LRO LROC WAC colour mosaic: NASA/GSFC/Arizona State University; LOLA elevation: NASA/GSFC). Public domain.",
  "Mars map and relief: USGS Astrogeology Science Center / NASA: Viking MDIM 2.1 colourised global mosaic and MGS MOLA elevation (MOLA Science Team, NASA/GSFC). Public domain.",
  "3D spacecraft: NASA 3D Resources (Apollo Lunar Module and Voyager: NASA/Michael D. Carbajal; Mars Exploration Rover: NASA/Ames Research Center; Ingenuity: NASA/JPL-Caltech; Cassini-Huygens: NASA/Brian E. Kumanchik).",
  "The Apollo 15 rover was built for this site from NASA NSSDCA measurements. Saturn and its rings are drawn in code from their real sizes.",
  "Facts: NASA, NASA JPL and the NSSDCA catalog. Every hotspot links the page it came from.",
];
