"use client";

import { motion } from "motion/react";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { videoVolume } from "./Story";

// The tour's closing tribute: after a trip past hardware that stayed where it stopped, the first rocket stage to be
// caught by its tower after a trip to orbit (SpaceX Starship Flight 15, 14 November 2026), and how catching and
// reusing rockets became possible. Media: openly licensed only (credits below each item); no SpaceX-owned footage.
const SRC = {
  f15: { label: "SpaceX: Starship Flight 15", url: "https://www.spacex.com/launches/starship-flight-15" },
  f15ap: { label: "AP via PBS NewsHour", url: "https://www.pbs.org/newshour/science/spacexs-starship-soars-into-orbit-after-booster-malfunction-thwarts-double-catch-attempt" },
  f5: { label: "SpaceX: Starship Flight 5", url: "https://www.spacex.com/launches/starship-flight-5" },
  f5sfn: { label: "Spaceflight Now: Flight 5", url: "https://spaceflightnow.com/2024/10/13/live-coverage-spacex-to-launch-5th-flight-test-of-starship-from-starbase-in-southern-texas/" },
  f7: { label: "SpaceX: Starship Flight 7", url: "https://www.spacex.com/launches/starship-flight-7" },
  f9: { label: "SpaceX: Starship Flight 9", url: "https://www.spacex.com/launches/starship-flight-9" },
  falcon: { label: "Falcon 9 Flight 20", url: "https://en.wikipedia.org/wiki/Falcon_9_flight_20" },
  v3: { label: "Payload: Starship V3", url: "https://payloadspace.com/spacex-launches-starship-v3-for-the-first-time/" },
};
type Src = (typeof SRC)[keyof typeof SRC];
const Cite = ({ s }: { s: Src }) => (
  <a className="trib-src" href={s.url} target="_blank" rel="noopener noreferrer">
    {s.label} <ArrowUpRight aria-hidden="true" />
  </a>
);

const TIMELINE: { when: string; what: string; s: Src }[] = [
  { when: "21 Dec 2015", what: "A Falcon 9 first stage lands upright back on Earth after launching to orbit: the first time an orbital rocket’s first stage came home this way.", s: SRC.falcon },
  { when: "13 Oct 2024", what: "Starship Flight 5: the giant Super Heavy booster flies back to its launch tower and two huge arms catch it in mid-air, on the very first try.", s: SRC.f5 },
  { when: "2025", what: "Two more booster catches (Flights 7 and 8). On Flight 9 a caught booster flies a second time: the first reflight in the Starship program.", s: SRC.f9 },
  { when: "14 Nov 2026", what: "Starship Flight 15: the upper stage, Ship 42, circles the Earth about 14 times, flies home and is caught by the tower arms. The first time a Starship was caught after a trip to orbit.", s: SRC.f15 },
];

const HOW: { title: string; text: string; s: Src }[] = [
  { title: "Turning around in the sky", text: "Seconds after the booster separates, it relights some of its Raptor engines for a “boostback burn”: it cancels its forward speed and points itself back toward the launch site.", s: SRC.f5sfn },
  { title: "Steering with grid fins", text: "Lattice-shaped grid fins near the top of the booster act like rudders as it falls back through the air, nudging it onto exactly the right path. The newest boosters have bigger fins with catch points built in.", s: SRC.v3 },
  { title: "Slowing down on rocket power", text: "Just before reaching the tower, the booster relights its centre engines for a landing burn, then keeps only the middle three running for fine control as it slows to a near hover.", s: SRC.f7 },
  { title: "The tower’s arms close", text: "Two enormous arms on the launch tower, nicknamed the “chopsticks”, swing closed around the booster and catch it by strong points near its top. The booster doesn’t need landing legs at all.", s: SRC.f5sfn },
  { title: "Thousands of safety checks", text: "A catch is only tried if thousands of checks on the rocket and the tower all pass and the Flight Director gives the go. If anything is wrong, the default is a safe splashdown in the sea instead.", s: SRC.f5sfn },
];

const PHOTOS = [
  { file: "/media/tribute/catch.jpg", alt: "The tall steel Super Heavy booster held between the two arms of its launch tower at dusk", caption: "Caught: the Flight 5 booster in the tower’s arms, 13 October 2024.", credit: "Steve Jurvetson", license: "CC BY 2.0", licUrl: "https://creativecommons.org/licenses/by/2.0/", src: "https://commons.wikimedia.org/wiki/File:Starship_Booster_Landing_on_Mechzilla_(54064036815).jpg" },
  { file: "/media/tribute/approach.jpg", alt: "The booster descending toward the launch tower on its engines", caption: "Final approach: the booster flies back toward the tower that launched it.", credit: "Steve Jurvetson", license: "CC BY 2.0", licUrl: "https://creativecommons.org/licenses/by/2.0/", src: "https://commons.wikimedia.org/wiki/File:Starship_Booster_Return_on_Final_Approach_(54063904149).jpg" },
  { file: "/media/tribute/burn.jpg", alt: "Engines firing beneath the booster as it slows down above the tower", caption: "The landing burn: engines firing to slow the booster for the catch.", credit: "Steve Jurvetson", license: "CC BY 2.0", licUrl: "https://creativecommons.org/licenses/by/2.0/", src: "https://commons.wikimedia.org/wiki/File:SpaceX_Starship_landing_burn_IFT-5.jpg" },
  { file: "/media/tribute/windtunnel.jpg", alt: "A small scale model of the Super Heavy booster mounted in a NASA wind tunnel", caption: "Testing first: NASA Ames tested a 1.2% model of the newest booster in a wind tunnel to study the forces on its way back down.", credit: "NASA/Brandon Torres", license: "Public domain", licUrl: "", src: "https://images.nasa.gov/details/ACD25-0156-012" },
];

export function Tribute({ onDone }: { onDone: () => void }) {
  return (
    <motion.section
      className="chapter trib"
      role="dialog"
      aria-modal="true"
      aria-labelledby="trib-title"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8 }}
    >
      <div className="trib-card">
        <p className="chapter-kicker">A tribute · SpaceX Starship · 14 November 2026</p>
        <h2 id="trib-title">The rocket that came home</h2>
        <p className="trib-lead">
          Every space object on this tour stayed where its journey ended: on the Moon, on Mars, or drifting out among the stars. On 14 November 2026,
          something new happened. A Starship flew around the Earth about 14 times, came back, and was caught by the arms of the tower that launched it.
          It was the first time a Starship was caught after a trip to orbit. <Cite s={SRC.f15} />
        </p>
        <figure className="chapter-film">
          <video ref={videoVolume} src="/media/tribute/launch-catch-ccby.mp4" poster="/media/tribute/launch-catch-ccby.jpg" controls playsInline preload="metadata" />
          <figcaption>
            Where catching began: Starship Flight 5 launches, and about seven minutes later its Super Heavy booster flies back and is caught by the tower,
            13 October 2024.{" "}
            <span className="chapter-credit">
              Anne Toal ·{" "}
              <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noopener noreferrer">CC BY 3.0</a> · converted for the web, sound removed ·{" "}
              <a href="https://commons.wikimedia.org/wiki/File:SpaceX_Starship_integrated_flight_test_-5_-_launch_and_catch_-_13_October_2024.webm" target="_blank" rel="noopener noreferrer">source</a>
            </span>
          </figcaption>
        </figure>

        <h3 className="trib-h">Why it matters</h3>
        <p className="trib-p">
          For almost all of space history, rockets flew once and were thrown away. Their stages fell into the ocean or burned up, and the machines we
          sent further stayed where they stopped, like Eagle’s descent stage and Voyager 1. A rocket that can be caught can be checked and flown again,
          the way an airplane flies many times. That could make space cheaper to reach and leave less hardware behind: a new frontier in how we
          explore.
        </p>
        <p className="trib-p trib-honest">
          It isn’t easy, and it doesn’t always work. On the same flight, the booster’s own computers called off its catch and it was lost at sea, which
          is exactly what the safety rules are for. <Cite s={SRC.f15ap} />
        </p>

        <h3 className="trib-h">The road to the catch</h3>
        <ol className="trib-time">
          {TIMELINE.map((t) => (
            <li key={t.when}>
              <b>{t.when}</b>
              <span>
                {t.what} <Cite s={t.s} />
              </span>
            </li>
          ))}
        </ol>

        <h3 className="trib-h">How they made it possible</h3>
        <ol className="sci-tech trib-how">
          {HOW.map((h) => (
            <li key={h.title}>
              <h3>{h.title}</h3>
              <p>{h.text}</p>
              <Cite s={h.s} />
            </li>
          ))}
        </ol>

        <div className="trib-photos">
          {PHOTOS.map((p) => (
            <figure key={p.file}>
              {/* eslint-disable-next-line @next/next/no-img-element -- small static photos, already sized */}
              <img src={p.file} alt={p.alt} loading="lazy" />
              <figcaption>
                {p.caption}{" "}
                <span className="chapter-credit">
                  {p.credit} · {p.licUrl ? <a href={p.licUrl} target="_blank" rel="noopener noreferrer">{p.license}</a> : p.license} ·{" "}
                  <a href={p.src} target="_blank" rel="noopener noreferrer">source</a>
                </span>
              </figcaption>
            </figure>
          ))}
        </div>

        <blockquote className="trib-close">
          <p>The explorers on this tour stayed where they stopped. Their echoes taught us how to go further.</p>
          <p>The next ones might come home, and fly again. Maybe you’ll be the engineer who builds them.</p>
        </blockquote>

        <div className="chapter-actions">
          <button type="button" className="start-btn" onClick={onDone}>
            See your case files <ArrowRight aria-hidden="true" />
          </button>
        </div>
      </div>
    </motion.section>
  );
}
