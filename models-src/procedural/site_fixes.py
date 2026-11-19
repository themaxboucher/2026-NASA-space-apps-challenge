"""One-off: corrections to the new part hotspots after checking each claim against its cited page (Nov 2026).
Only wording the source supports is kept. Safe to run again."""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SITES = os.path.join(ROOT, "public", "data", "sites")
NSSDCA = "https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id="

FIX = {
    # site: {hotspot title: {fields to replace}}
    "ranger7": {
        "Six cameras": {"text": "Six TV cameras shared this one opening, some with wide-angle lenses and some with close-up lenses. Two took whole pictures, and four took smaller, quicker ones."},
    },
    "ranger8": {
        "TV dish": {"text": "Two 60-watt TV transmitters sent the cameras’ pictures to Earth through this dish, right up to the crash."},
    },
    "ranger9": {
        "Camera batteries": {"text": "The TV cameras didn’t depend on sunlight. The two sets of cameras ran on their own big silver-zinc batteries, with enough charge for about nine hours."},
    },
    "lunar-prospector": {
        "Element mapper": {"title": "Rock mapper", "text": "This instrument measured gamma rays coming up from the ground below. From orbit, it mapped where the Moon’s main kinds of rock are."},
    },
    "grail-ebb": {
        "Ranging horn": {"text": "This horn traded radio signals with Flow. As the twins drifted slightly toward and away from each other, the signals measured the tiny changes in their speed."},
        "Solar arrays": {"text": "Two fixed solar panels, one on each side, made all of Ebb’s electricity.", "source": {"label": "NASA: GRAIL", "url": "https://science.nasa.gov/mission/grail/"}},
    },
    "grail-flow": {
        "Star tracker": {"text": "This little telescope read the stars to tell Flow which way it was pointing, so its radio horn could stay aimed at Ebb.", "source": {"label": "NASA: GRAIL", "url": "https://science.nasa.gov/mission/grail/"}},
        "The slow road": {"text": "Its solar panels kept Flow powered through a long, fuel-saving trip. It left Earth on 10 September 2011 and slipped into orbit around the Moon at New Year, about 25 hours after Ebb.", "source": {"label": "NASA: GRAIL", "url": "https://science.nasa.gov/mission/grail/"}},
    },
    "mars-polar-lander": {
        "The digging arm": {"text": "This robotic arm, with a camera of its own, was built to dig a trench in the frozen ground and bring up soil to test for water ice."},
        "Two camera eyes": {"text": "Two lenses side by side on a mast would have taken 3D pictures of the polar plains.", "source": {"label": "NASA NSSDCA: Mars Polar Lander", "url": NSSDCA + "1999-001A"}},
        "Twelve landing engines": {
            "text": "Twelve small rocket engines, in three groups of four, were to fire in quick pulses and slow the lander to less than 2.4 meters a second for touchdown. Investigators think a false signal made the computer switch them off while it was still in the air.",
            "source": {"label": "NASA: Mars Polar Lander failure report release (2000)", "url": "https://nssdc.gsfc.nasa.gov/planetary/text/nasa_pr_20000328.txt"},
        },
    },
    "deep-space-2": {
        "A shell made to shatter": {"text": "Each probe rode inside a shell 35 centimeters across, a little bigger than a basketball. Its shape kept it falling nose-first, and the shell was made to shatter when it hit the ground."},
        "Tough batteries": {"text": "The probes’ batteries were specially made to live through the crash. In a test of an early version, they survived a jolt 45,000 times stronger than gravity."},
    },
    "mars-climate-orbiter": {
        "The braking engine": {"text": "This engine was to burn for about 16 minutes to slow the orbiter so Mars’s gravity could catch it. It lit on time, and about five minutes later the orbiter slipped behind Mars for the last time."},
    },
    "lcross-ssc": {
        "One solar panel": {"title": "Solar panel", "text": "LCROSS made its electricity with this panel of solar cells, which could supply up to 600 watts, with a battery for backup."},
    },
    "lcross-centaur": {
        "One engine": {
            "text": "The Centaur’s single engine fired to send LCROSS and its travelling partner, the Lunar Reconnaissance Orbiter, toward the Moon on 18 June 2009. After that its work as a rocket was done.",
            "source": {"label": "NASA NSSDCA: LCROSS", "url": NSSDCA + "2009-031B"},
        },
        "A coat of white paint": {
            "title": "A 113-day last trip",
            "text": "Rocket stages like this usually finish their job in a few hours. This one stayed with LCROSS for 113 days, from launch on 18 June 2009 until the crash on 9 October.",
            "source": {"label": "NASA NSSDCA: LCROSS", "url": NSSDCA + "2009-031B"},
        },
    },
}

for site, fixes in FIX.items():
    path = os.path.join(SITES, f"{site}.json")
    raw = open(path, encoding="utf-8", newline="").read()
    nl = "\r\n" if "\r\n" in raw else "\n"
    d = json.loads(raw)
    renamed = {v.get("title"): k for k, v in fixes.items() if "title" in v}  # already applied on an earlier run
    for h in d["hotspots"]:
        key = h["title"] if h["title"] in fixes else renamed.get(h["title"])
        if key:
            h.update(fixes[key])
            fixes[key]["_done"] = True
    missing = [k for k, v in fixes.items() if not v.pop("_done", False)]
    assert not missing, (site, missing)
    for h in d["hotspots"]:
        h.pop("_done", None)
    out = json.dumps(d, indent=2, ensure_ascii=False) + ("\n" if raw.endswith("\n") else "")
    open(path, "w", encoding="utf-8", newline="").write(out.replace("\n", nl) if nl != "\n" else out)
print("ok")
