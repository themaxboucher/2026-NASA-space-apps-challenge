"""One-off: give the impact sites that use existing models (S-IVB, lunar module top half, LADEE, MESSENGER,
Deep Impact) their model key and hotspots anchored to the ghost model's parts. Safe to run again.
Facts checked against the NSSDCA / NASA pages cited in each hotspot (Nov 2026)."""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SITES = os.path.join(ROOT, "public", "data", "sites")
NSSDCA = "https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id="


def load(i):
    raw = open(os.path.join(SITES, f"{i}.json"), encoding="utf-8", newline="").read()
    return json.loads(raw), ("\r\n" if "\r\n" in raw else "\n"), raw


def save(i, data, nl, raw):
    out = json.dumps(data, indent=2, ensure_ascii=False) + "\n"
    out = out.replace("\n", nl) if nl != "\n" else out
    if out != raw:
        open(os.path.join(SITES, f"{i}.json"), "w", encoding="utf-8", newline="").write(out)


def roundtrips(i):
    d, nl, raw = load(i)
    out = json.dumps(d, indent=2, ensure_ascii=False) + "\n"
    return (out.replace("\n", nl) if nl != "\n" else out) == raw


def put(site, spots, after=None):
    """Add or replace hotspots by id (new ones go after the hotspot `after`, else at the end)."""
    hs = site["hotspots"]
    for s in spots:
        k = next((n for n, h in enumerate(hs) if h["id"] == s["id"]), None)
        if k is not None:
            hs[k] = {**hs[k], **s}
        elif after and any(h["id"] == after for h in hs):
            hs.insert(next(n for n, h in enumerate(hs) if h["id"] == after) + 1, s)
            after = s["id"]
        else:
            hs.append(s)


def anchor(site, spot_id, part, at):
    for h in site["hotspots"]:
        if h["id"] == spot_id:
            h["anchor"] = {"part": part, "at": at}


def ghost_line(site, line):
    """One sentence at the end of the intro saying what the see-through model is."""
    if "see-through" not in site["intro"]:
        site["intro"] = site["intro"].rstrip() + " " + line


# ---------- Saturn V third stages ----------
SIVB = {
    # id: (name in text, NSSDCA id, degrees from horizontal it came in at)
    "apollo13-sivb": ("Apollo 13", "1970-029B", 76),
    "apollo14-sivb": ("Apollo 14", "1971-008B", 69),
    "apollo15-sivb": ("Apollo 15", "1971-063B", 62),
    "apollo16-sivb": ("Apollo 16", "1972-031B", 79),
    "apollo17-sivb": ("Apollo 17", "1972-096B", 55),
}
for i, (name, nid, angle) in SIVB.items():
    d, nl, raw = load(i)
    d["model"] = "sivb"
    d["modelTilt"] = [0, 0, 90 - angle]  # leaning along its path: it came in at `angle` degrees above the horizon
    src = {"label": f"NASA NSSDCA: {name} S-IVB", "url": NSSDCA + nid}
    ghost_line(d, "Look up: the see-through rocket stage over the crater shows how it looked a moment before it hit.")
    spots = [
        {
            "id": "j2-engine",
            "title": "One big engine",
            "text": "This is the stage’s single J-2 engine. It burned liquid hydrogen and liquid oxygen to push the Apollo ships out of Earth orbit and onto the road to the Moon.",
            "anchor": {"part": "engine", "at": [0.5, 0.35, 0.5]},
            "source": src,
        },
        {
            "id": "tanks",
            "title": "Mostly fuel tank",
            "text": "Nearly all of the stage is fuel tank: 17.8 meters tall and 6.6 meters across, about as tall as a six-storey building. By the time it reached the Moon its fuel was used up.",
            "anchor": {"part": "hydrogen_tank", "at": [0.5, 0.45, 0.5]},
            "source": src,
        },
    ]
    if i == "apollo13-sivb":
        spots.append({
            "id": "steering-pods",
            "title": "Steering rockets",
            "text": "The pods on the sides hold small steering rockets. After the Apollo 13 ships pulled away, these rockets fired for 217 seconds to aim the empty stage at the Moon.",
            "anchor": {"part": "aps_pods", "at": [0.97, 0.5, 0.5]},
            "source": {"label": "NASA NSSDCA: Apollo 13 Command and Service Module", "url": NSSDCA + "1970-029A"},
        })
    else:
        spots.append({
            "id": "top-ring",
            "title": "Open at the top",
            "text": "The lunar module rode to space folded up inside the top of this stage, with the command ship above it. Once the crew had pulled the lander out and flown on, the top was left open.",
            "anchor": {"part": "instrument_unit", "at": [0.5, 0.9, 0.5]},
            "source": src,
        })
    if i == "apollo17-sivb":
        spots = [s for s in spots if s["id"] != "top-ring"]  # its own "The stage in space" spot already tells this
        anchor(d, "stage", "instrument_unit", [0.5, 0.9, 0.5])
        spots.append({
            "id": "steering-pods",
            "title": "Steering rockets",
            "text": "The pods on the sides hold the stage’s small steering rockets, which kept it pointing the right way on its long fall to the Moon.",
            "anchor": {"part": "aps_pods", "at": [0.97, 0.5, 0.5]},
            "source": src,
        })
    put(d, spots, after="crater")
    save(i, d, nl, raw)

# ---------- lunar module ascent stages (the top half of NASA's lunar module model) ----------
LM = {
    "apollo12-lm-ascent": ("Intrepid", "Apollo 12", "1969-099C"),
    "apollo14-lm-ascent": ("Antares", "Apollo 14", "1971-008C"),
    "apollo15-lm-ascent": ("Falcon", "Apollo 15", "1971-063C"),
    "apollo17-lm-ascent": ("Challenger", "Apollo 17", "1972-096C"),
}
for i, (ship, name, nid) in LM.items():
    d, nl, raw = load(i)
    d["model"] = "apollo-lm-ascent"
    src = {"label": f"NASA NSSDCA: {name} Lunar Module", "url": NSSDCA + nid}
    ghost_line(d, f"The see-through cabin hanging here shows how {ship}’s top half looked before it hit.")
    # "ascent" names no part of NASA's model, so these land on fractions of the whole cabin's box.
    spots = [
        {
            "id": "ascent-engine",
            "title": "The ride home",
            "text": "Under the cabin sat one small rocket engine with about 15,000 newtons of push. It had no throttle, only on and off, and it had to work the first time to lift the crew off the Moon.",
            "anchor": {"part": "ascent", "at": [0.5, 0.04, 0.5]},
            "source": src,
        },
        {
            "id": "top-half",
            "title": "Only the top half",
            "text": "This is just the top half of the lander: about 2.8 meters tall and a little over 4 meters wide. The bottom half served as its launch pad and is still standing at the landing site.",
            "anchor": {"part": "ascent", "at": [0.12, 0.6, 0.5]},
            "source": src,
        },
    ]
    if any(h["id"] == "cabin" for h in d["hotspots"]):
        anchor(d, "cabin", "ascent", [0.5, 0.62, 0.92])
    else:
        spots.append({
            "id": "cabin",
            "title": "Standing room only",
            "text": f"Two astronauts lived in this cabin while they were on the Moon. It had 6.65 cubic meters of room inside and no seats: they flew it standing up.",
            "anchor": {"part": "ascent", "at": [0.5, 0.62, 0.92]},
            "source": src,
        })
    put(d, spots)
    save(i, d, nl, raw)

# ---------- LADEE (NASA model) ----------
d, nl, raw = load("ladee")
d["model"] = "ladee"
src = {"label": "NASA NSSDCA: LADEE", "url": NSSDCA + "2013-047A"}
ghost_line(d, "The see-through spacecraft hanging over the crater shows how LADEE looked just before it hit.")
anchor(d, "laser", "body", [0.5, 0.82, 0.5])
put(d, [
    {
        "id": "solar-skin",
        "title": "Solar-panel skin",
        "text": "LADEE had no solar wings. Its whole outside was covered in solar panels instead, making about 295 watts in full sunlight.",
        "anchor": {"part": "body", "at": [0.5, 0.45, 0.95]},
        "source": src,
    },
    {
        "id": "size",
        "title": "Small-car size",
        "text": "LADEE was a cylinder 2.37 meters tall and 1.85 meters across. With its fuel on board it weighed about 383 kilograms.",
        "anchor": {"part": "body", "at": [0.08, 0.3, 0.5]},
        "source": src,
    },
    {
        "id": "dust-counter",
        "title": "Dust and gas sniffers",
        "text": "Three instruments rode on board. One counted Moon dust grains as small as 0.3 microns, far thinner than a hair, and two measured the thin gases around the Moon.",
        "anchor": {"part": "body", "at": [0.5, 0.98, 0.5]},
        "source": {"label": "NASA: LADEE science and instruments", "url": "https://science.nasa.gov/mission/ladee/ladee-science-and-instruments/"},
    },
])
save("ladee", d, nl, raw)

# ---------- MESSENGER (NASA model) ----------
d, nl, raw = load("messenger")
d["model"] = "messenger"
ghost_line(d, "The see-through spacecraft hanging over the crater shows how MESSENGER looked just before it hit.")
anchor(d, "sunshade", "AO_heatshield", [0.5, 0.5, 0.5])
anchor(d, "helium", "Foil_gold", [0.5, 0.5, 0.5])
put(d, [
    {
        "id": "instruments",
        "title": "Tools in the shade",
        "text": "MESSENGER’s science tools sat on the shaded side: cameras, a laser that measured the height of mountains and craters, and a magnetometer that mapped Mercury’s magnetic field.",
        "anchor": {"part": "Tex_01", "at": [0.5, 0.5, 0.5]},
        "source": {"label": "NASA: MESSENGER", "url": "https://science.nasa.gov/mission/messenger/"},
    },
])
save("messenger", d, nl, raw)

# ---------- Deep Impact's impactor (NASA's model is the whole spacecraft: flyby craft + impactor) ----------
d, nl, raw = load("deep_impact_impactor")
d["model"] = "deep-impact"
src = {"label": "NASA NSSDCA: Deep Impact Impactor", "url": NSSDCA + "2005-001D"}
ghost_line(d, "The see-through spacecraft hanging by the rim is the whole Deep Impact craft as it flew: the impactor was the small part that split off to hit the comet.")
anchor(d, "copper", "body", [0.5, 0.12, 0.5])
anchor(d, "camera", "body", [0.5, 0.02, 0.5])
put(d, [
    {
        "id": "mothership",
        "title": "The one that watched",
        "text": "Most of what you see here is the flyby spacecraft. It carried the impactor to the comet, let it go, then watched the crash from a safe distance with its telescopes.",
        "anchor": {"part": "body", "at": [0.5, 0.7, 0.5]},
        "source": {"label": "NASA: Deep Impact (EPOXI)", "url": "https://science.nasa.gov/mission/deep-impact-epoxi/"},
    },
    {
        "id": "weight",
        "title": "A 370-kilogram bullet",
        "text": "The impactor weighed about 370 kilograms, as much as a grand piano. Small thrusters and its own computer steered it into the comet’s path.",
        "anchor": {"part": "body", "at": [0.85, 0.1, 0.5]},
        "source": src,
    },
])
save("deep_impact_impactor", d, nl, raw)

print("ok")
