"""Build abandoned/data/mars.json. Paths: PDS MER traverse CSVs + NASA MMGIS waypoint JSONs (downloaded to dl/)."""
import csv, json, math, os, re, sys

DL = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dl")
OUT = r"C:/Users/jonat/Desktop/NASA_SPACE_APPS/abandoned/data/mars.json"
R = 3396190.0  # Mars IAU sphere radius, m
D = 180 / math.pi


def sample(pts, n):
    """Pick n points evenly spaced by along-track distance (pts in a metric frame)."""
    cum = [0.0]
    for a, b in zip(pts, pts[1:]):
        cum.append(cum[-1] + math.dist(a, b))
    return [pts[min(range(len(cum)), key=lambda k: abs(cum[k] - cum[-1] * i / (n - 1)))] for i in range(n)]


def mer(fname):
    return [(float(r["CORRECTED_X"]), float(r["CORRECTED_Y"])) for r in csv.DictReader(open(os.path.join(DL, fname)))]


# Spirit: equirectangular centred on 175.5E, 0N (per MERA_traverse.lbl)
spirit = [[round(y / R * D, 4), round(175.5 + x / R * D, 4)] for x, y in sample(mer("MERA_traverse.csv"), 12)]
# Opportunity: metres east/north of landing site 1.946S 354.473E (NSSDCA)
opp = []
for x, y in sample(mer("MERB_traverse_5130.csv"), 16):
    lat = -1.946 + y / R * D
    opp.append([round(lat, 4), round(354.473 + x / (R * math.cos(math.radians(lat))) * D - 360, 4)])


def mmgis(fname, n=16):
    fs = [f["properties"] for f in json.load(open(os.path.join(DL, fname)))["features"]]
    fs = [p for p in fs if p["dist_total_m"] > 0 or p is fs[0]]  # drop site-increment rows with zeroed odometry
    tot = fs[-1]["dist_total_m"]  # sample at evenly spaced odometer readings
    picks = [min(fs, key=lambda p: abs(p["dist_total_m"] - tot * i / (n - 1))) for i in range(n)]
    return [[round(p["lat"], 4), round(p["lon"], 4)] for p in picks], fs[-1]


curi_path, curi_last = mmgis("msl.json")
perse_path, perse_last = mmgis("m20.json")

NSSDC = "https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id="

data = [
    {
        "id": "viking1", "name": "Viking 1 Lander", "body": "mars", "type": "lander", "mission": "Viking 1",
        "lat": 22.27, "lon": -47.95, "arrived": "1976-07-20", "lastContact": "1982-11-11",
        "status": "Silent since 1982", "mass_kg": 572,
        "why": "The first NASA spacecraft to land safely on Mars and send back pictures from the surface.",
        "science": "It took the first color photos from the Martian surface, reported the weather for more than six years, and tested the soil for signs of life. The life tests gave puzzling results that most scientists now think came from unusual soil chemistry, not living things.",
        "story": "I landed on the plains of Chryse Planitia on 20 July 1976, exactly seven years after astronauts first walked on the Moon. For more than six years I watched the Martian seasons change and radioed home what I saw. Then a command sent from Earth went wrong, and I could no longer hear my team.",
        "funFact": "In 1982 it was renamed the Thomas Mutch Memorial Station, after the leader of the Viking camera team.",
        "lastWords": "In November 1982 a faulty command sent from Earth cut off communications, and every attempt to reconnect failed.",
        "distance_km": None, "source": NSSDC + "1975-075C",
    },
    {
        "id": "viking2", "name": "Viking 2 Lander", "body": "mars", "type": "lander", "mission": "Viking 2",
        "lat": 47.67, "lon": 134.28, "arrived": "1976-09-03", "lastContact": "1980-04-11",
        "status": "Silent since 1980", "mass_kg": 572,
        "why": "Viking 1's twin, sent much farther north to see a different part of Mars.",
        "science": "It landed on the rocky plain of Utopia Planitia and searched the soil for signs of life, just like its twin. In 1979 it photographed a thin layer of water frost on the ground during the Martian winter.",
        "story": "I landed far to the north of my twin, on a plain covered in rocks. One winter my camera caught the ground around me turning white with frost. After 1,281 Mars days of work my batteries failed, and my team switched me off.",
        "funFact": "Its winter photos showed frost on the ground of Mars, something nobody had seen up close before.",
        "lastWords": "Turned off on 11 April 1980 when its batteries failed.",
        "distance_km": None, "source": NSSDC + "1975-083C",
    },
    {
        "id": "pathfinder", "name": "Mars Pathfinder Lander (Carl Sagan Memorial Station)", "body": "mars", "type": "lander",
        "mission": "Mars Pathfinder", "lat": 19.33, "lon": -33.55, "arrived": "1997-07-04", "lastContact": "1997-09-27",
        "status": "Silent since 1997", "mass_kg": 264,
        "why": "It tested a cheaper way to land, bouncing onto Mars inside giant airbags, and it carried the first Mars rover.",
        "science": "It sent back more than 16,500 pictures and daily weather reports from Ares Vallis, an old channel that scientists think was carved by giant floods.",
        "story": "I bounced onto Mars wrapped in airbags on the Fourth of July, 1997, then opened my petals to let my little rover roll out. For almost three months I sent Sojourner's pictures and my own weather reports to Earth. My last transmission arrived on 27 September 1997, and nobody knows exactly why I went quiet.",
        "funFact": "The lander was renamed the Carl Sagan Memorial Station to honor the astronomer, who had died the year before.",
        "lastWords": "Final data transmission received 27 September 1997; contact was lost for unknown reasons.",
        "distance_km": None, "source": "https://science.nasa.gov/mission/mars-pathfinder/",
    },
    {
        "id": "sojourner", "name": "Sojourner Rover", "body": "mars", "type": "rover", "mission": "Mars Pathfinder",
        "lat": 19.33, "lon": -33.55, "arrived": "1997-07-04", "lastContact": "1997-09-27",
        "status": "Silent since 1997", "mass_kg": 10.6,
        "why": "The first wheeled robot ever to drive on another planet.",
        "science": "It drove up to rocks nicknamed Barnacle Bill and Yogi and used its X-ray instrument to find out what they were made of. It proved that a small, careful rover could explore Mars on its own.",
        "story": "I'm about the size of a microwave oven and I roll on six little wheels. I never went more than about 12 meters from my lander, because it was my only radio link to Earth. When my lander fell silent, I had no way left to call home.",
        "funFact": "Sojourner is named after civil-rights hero Sojourner Truth; the name won an essay contest entered by a 12-year-old student.",
        "lastWords": "It could only talk to Earth through the lander, so it went silent when the lander did on 27 September 1997. Its exact final spot is not known, but it was always within about 12 m of the lander.",
        "distance_km": 0.1, "source": "https://science.nasa.gov/mission/mars-pathfinder/",
    },
    {
        "id": "spirit", "name": "Spirit Rover", "body": "mars", "type": "rover", "mission": "Mars Exploration Rover (MER-A)",
        "lat": spirit[-1][0], "lon": spirit[-1][1], "arrived": "2004-01-04", "lastContact": "2010-03-22",
        "status": "Silent since 2010", "mass_kg": 185,
        "why": "It was planned to work for 90 Mars days, but it explored Gusev crater for more than six years.",
        "science": "Spirit found rocks and soils that formed with water. Near a volcanic plateau called Home Plate it found soil that is almost pure silica, a sign of ancient hot springs or steam vents.",
        "story": "I landed in Gusev crater in January 2004 and climbed hills nobody expected me to reach. In 2009 my wheels broke through a crust into soft sand at a place called Troy, and I could not get out. I couldn't tilt my solar panels toward the winter Sun, and after March 2010 I fell silent.",
        "funFact": "Spirit made one of its biggest discoveries by accident: its broken front wheel, dragging behind it, scraped up the bright white silica soil.",
        "lastWords": "Last signal received 22 March 2010. NASA ended its efforts to contact Spirit on 25 May 2011.",
        "path": spirit, "distance_km": 7.73, "source": NSSDC + "2003-027A",
    },
    {
        "id": "opportunity", "name": "Opportunity Rover", "body": "mars", "type": "rover", "mission": "Mars Exploration Rover (MER-B)",
        "lat": opp[-1][0], "lon": opp[-1][1], "arrived": "2004-01-25", "lastContact": "2018-06-10",
        "status": "Silent since 2018", "mass_kg": 185,
        "why": "Built for a 90-day mission, it worked for more than 14 years and drove farther than a marathon.",
        "science": "Opportunity found strong evidence that liquid water once soaked the ground at Meridiani Planum, including tiny round 'blueberries' made of the mineral hematite. At Endeavour crater it found veins of gypsum that formed when water flowed through cracks in the rock.",
        "story": "I rolled to a stop inside a little crater called Eagle in January 2004 and went on to drive more than 45 kilometers. In June 2018 a dust storm covered the whole planet and blocked out my sunlight. My last data showed my power was almost gone and the sky was darker than ever. A reporter later summed that up as 'My battery is low and it's getting dark', but those were his words, not mine.",
        "funFact": "In 2015 it became the first robot to drive a full marathon distance (42.2 km) on another world.",
        "lastWords": "Last data received 10 June 2018 during a planet-wide dust storm, showing very low power and a very dark, dusty sky. The famous line 'My battery is low and it's getting dark' is a journalist's paraphrase of that data, not a real message. NASA sent its final wake-up commands on 12 February 2019 and declared the mission over on 13 February 2019.",
        "path": opp, "distance_km": 45.16, "source": NSSDC + "2003-032A",
    },
    {
        "id": "phoenix", "name": "Phoenix Lander", "body": "mars", "type": "lander", "mission": "Phoenix",
        "lat": 68.2188, "lon": -125.7492, "arrived": "2008-05-25", "lastContact": "2008-11-02",
        "status": "Silent since 2008", "mass_kg": 350,
        "why": "It landed in the Martian arctic to dig for ice and check whether the area could ever have supported life.",
        "science": "Phoenix scraped down to water ice just under the soil and watched bits of it vanish into the thin air. It found perchlorate, a salt that matters for possible life and for future astronauts, and it saw snow falling from clouds, though the snow evaporated before reaching the ground.",
        "story": "I landed near the north pole of Mars in May 2008 and used my robotic arm to dig trenches that uncovered bright ice. As autumn came, the Sun sank lower and my solar panels made less and less power. My last message reached Earth on 2 November 2008; that winter I was buried in carbon-dioxide frost, and later orbiter photos suggest my solar panels broke under the weight.",
        "funFact": "Phoenix carries a DVD of Mars stories, art and messages, meant as a library for future human visitors.",
        "lastWords": "Final transmission received 2 November 2008, just before its power ran out in the fading autumn sunlight.",
        "distance_km": None, "source": "https://www.planetary.org/articles/1472",
    },
    {
        "id": "insight", "name": "InSight Lander", "body": "mars", "type": "lander", "mission": "InSight",
        "lat": 4.5024, "lon": 135.6234, "arrived": "2018-11-26", "lastContact": "2022-12-15",
        "status": "Silent since 2022", "mass_kg": 360,
        "why": "The first mission built to study the deep inside of Mars: its crust, mantle and core.",
        "science": "Its seismometer recorded more than 1,300 marsquakes. Scientists used those quakes to measure how thick the crust is and how big Mars's liquid metal core is.",
        "story": "I sat on a flat plain called Elysium Planitia for four years, listening to Mars shake. Dust slowly piled up on my solar panels until I had too little power to stay awake. My final transmission reached Earth on 15 December 2022.",
        "funFact": "On 4 May 2022 it felt a magnitude 5 marsquake, the biggest quake ever detected on another planet.",
        "lastWords": "Last transmission received 15 December 2022; NASA declared the mission over on 21 December 2022 after it missed two contacts. A few days earlier its team posted, in InSight's voice: 'My power's really low, so this may be the last image I can send you.' The team wrote that post, not the lander.",
        "distance_km": None, "source": NSSDC + "2018-042A",
    },
    {
        "id": "ingenuity", "name": "Ingenuity Mars Helicopter", "body": "mars", "type": "helicopter", "mission": "Mars 2020",
        "lat": 18.4973, "lon": 77.3225, "arrived": "2021-02-18", "lastContact": "2024-04-16",
        "status": "Grounded since 2024", "mass_kg": 1.8,
        "why": "The first aircraft to make a powered, controlled flight on another planet.",
        "science": "It proved that a helicopter can fly in Mars's air, which is only about 1% as thick as Earth's. Its aerial photos helped the Perseverance team scout routes and places to explore.",
        "story": "I rode to Mars tucked under Perseverance's belly and first lifted off on 19 April 2021. I was planned for five test flights, but I flew 72 times. On my last flight, on 18 January 2024, I came down hard over smooth sand and broke my rotor blades. Now I rest at a spot my team named Valinor Hills, still keeping my flight records.",
        "funFact": "It carries a stamp-sized piece of fabric from the Wright brothers' 1903 Flyer, the first airplane on Earth.",
        "lastWords": "Flight 72 (18 January 2024) damaged its rotor blades, and the mission ended on 25 January 2024. Its final communication session, relayed through Perseverance, was on 16 April 2024; it was left set to keep recording data.",
        "distance_km": 18.1, "source": "https://www.jpl.nasa.gov/news/nasas-ingenuity-mars-helicopter-team-says-goodbye-for-now",
    },
    {
        "id": "mars-polar-lander", "name": "Mars Polar Lander (crash site, approximate)", "body": "mars", "type": "crash",
        "mission": "Mars Polar Lander", "lat": -76.0, "lon": 165.0, "arrived": "1999-12-03", "lastContact": "1999-12-03",
        "status": "Lost while landing in 1999", "mass_kg": 290,
        "why": "It was meant to be the first lander near Mars's south pole, to study ice and climate.",
        "science": "It was going to dig into the layered, icy ground near the south pole. Investigators think the jolt of its landing legs opening fooled its computer into thinking it had landed, so it shut off its engines too early.",
        "story": "I headed for the icy layered land near the south pole of Mars on 3 December 1999. As planned, I went quiet while I entered the atmosphere, and Earth never heard from me again. Engineers think I fell the last 40 meters after my computer decided I had already touched down.",
        "funFact": "No orbiter photo has ever confirmed where it crashed, so this map shows the spot it was aiming for.",
        "lastWords": "Last signal before atmospheric entry on 3 December 1999; nothing was ever received after landing.",
        "distance_km": None, "source": "https://nssdc.gsfc.nasa.gov/planetary/mars/polar_lander/mpl_ds2_landsite.html",
    },
    {
        "id": "deep-space-2", "name": "Deep Space 2 probes Amundsen & Scott (impact site, approximate)", "body": "mars", "type": "crash",
        "mission": "Deep Space 2", "lat": -73.0, "lon": 150.0, "arrived": "1999-12-03", "lastContact": None,
        "status": "Never heard from (1999)", "mass_kg": 3.5,
        "why": "Two small test probes designed to smash into the ground at high speed and check the soil for water.",
        "science": "Each probe was built to hit the ground at about 200 meters per second, drive a spike into the soil, and test it for water ice. No signal ever came back, so nobody knows what happened to them.",
        "story": "We were two small probes, named Amundsen and Scott after the explorers who raced to Earth's South Pole. We rode to Mars with the Mars Polar Lander and let go just before arrival, planning to slam into the ground and radio home. No one ever heard from us.",
        "funFact": "They were built to survive hitting the ground at about 200 m/s, faster than 700 km/h.",
        "lastWords": "Separated from Mars Polar Lander on 3 December 1999; no signal was ever received from either probe.",
        "distance_km": None, "source": "https://nssdc.gsfc.nasa.gov/planetary/mars/polar_lander/mpl_ds2_landsite.html",
    },
    {
        "id": "mars-climate-orbiter", "name": "Mars Climate Orbiter (lost, location unknown)", "body": "mars", "type": "crash",
        "mission": "Mars Climate Orbiter", "lat": None, "lon": None, "arrived": "1999-09-23", "lastContact": "1999-09-23",
        "status": "Lost in 1999", "mass_kg": 338,
        "why": "A Mars weather satellite that was lost because of a mix-up between metric and imperial units.",
        "science": "It was supposed to study Martian weather and relay messages for Mars Polar Lander. Some navigation numbers were sent in English (imperial) units instead of being converted to metric, so it flew far too close to Mars.",
        "story": "I flew for nine months to reach Mars. On 23 September 1999 I fired my engine to slip into orbit and passed behind the planet, but I never came out the other side. I was aiming for 140 to 150 km above the surface but came in at about 57 km, so I probably burned up in the air or bounced back out into space.",
        "funFact": "Its loss is now a famous lesson for engineers everywhere: always check your units.",
        "lastWords": "Signal lost as expected when it passed behind Mars during orbit insertion on 23 September 1999; it was never heard again.",
        "distance_km": None, "source": NSSDC + "1998-073A",
    },
    {
        "id": "curiosity", "name": "Curiosity Rover", "body": "mars", "type": "rover", "mission": "Mars Science Laboratory",
        "lat": curi_path[-1][0], "lon": curi_path[-1][1], "arrived": "2012-08-06", "lastContact": None,
        "status": "Still working (position as of Nov 2026)", "mass_kg": 899,
        "why": "A car-sized, nuclear-powered rover sent to find out whether Mars ever had places where microbes could live.",
        "science": "In its first year it showed that an ancient lake in Gale crater had water that could have supported microbes. Since then it has been climbing Mount Sharp, reading its rock layers like pages in a history book of how Mars dried out.",
        "story": "A rocket-powered sky crane lowered me onto Mars in August 2012. Ever since, I've been climbing Mount Sharp, a mountain more than 5 kilometers tall, drilling rocks to learn how Mars changed from wet to dry. My power comes from plutonium, so dust storms can't switch me off.",
        "funFact": "Holes in its wheels spell 'JPL' in Morse code, so it stamps the letters into the Martian ground as it drives.",
        "path": curi_path, "distance_km": 38.3, "source": "https://science.nasa.gov/mission/msl-curiosity/",
    },
    {
        "id": "perseverance", "name": "Perseverance Rover", "body": "mars", "type": "rover", "mission": "Mars 2020",
        "lat": perse_path[-1][0], "lon": perse_path[-1][1], "arrived": "2021-02-18", "lastContact": None,
        "status": "Still working (position as of Oct 2026)", "mass_kg": 1025,
        "why": "It is searching for signs of ancient microbial life and collecting rock samples that could one day come back to Earth.",
        "science": "It landed in Jezero crater, an ancient lake with a river delta, and seals rock and soil samples in tubes. In 2024 it found a rock nicknamed 'Cheyava Falls' with 'leopard spot' patterns that scientists call a possible sign of ancient life, though not proof.",
        "story": "I touched down in Jezero crater on 18 February 2021 with a little helicopter tucked under my belly. I've driven more than 45 kilometers, across an old river delta and up onto the crater rim, filling sample tubes along the way. I even left ten tubes on the ground as a backup stash at a place called Three Forks.",
        "funFact": "It carries microphones and recorded the first sounds ever captured on Mars, including the hum of Ingenuity's rotors.",
        "path": perse_path, "distance_km": 45.25, "source": "https://science.nasa.gov/mission/mars-2020-perseverance/",
    },
    {
        "id": "perseverance-backshell", "name": "Perseverance's Backshell & Parachute", "body": "mars", "type": "edl-debris",
        "mission": "Mars 2020", "lat": 18.452, "lon": 77.432, "arrived": "2021-02-18", "lastContact": None,
        "status": "Thrown away during landing (2021)", "mass_kg": None,
        "why": "The cone-shaped cover and 21.5-meter parachute that slowed Perseverance down, then were cast off so the rover could land.",
        "science": "Ingenuity flew over this wreckage on 19 April 2022 and took the first aerial photos of discarded landing gear on Mars. The backshell hit the ground at about 126 km/h (78 mph), and engineers used the pictures to learn how the hardware held up.",
        "story": "I'm the backshell that shielded Perseverance on its fiery way down, and my parachute is still tied to me. About 2 kilometers above the ground I let the rover go so its sky crane could finish the landing. Now I lie in the sand of Jezero crater, about a kilometer from where the rover landed, and Ingenuity flew by to take my picture.",
        "funFact": "The parachute's orange-and-white pattern hides a secret code that spells 'Dare Mighty Things' plus the map coordinates of JPL.",
        "distance_km": None, "source": "https://science.nasa.gov/resource/rovers-backshell-seen-from-the-air",
    },
]

# self-check
ids = [d["id"] for d in data]
assert len(ids) == len(set(ids))
for d in data:
    if d["lat"] is not None:
        assert -90 <= d["lat"] <= 90 and -180 <= d["lon"] <= 180, d["id"]
    for la, lo in d.get("path", []):
        assert -90 <= la <= 90 and -180 <= lo <= 180, d["id"]
    if "path" in d:
        assert [d["lat"], d["lon"]] == d["path"][-1], d["id"]
assert abs(curi_last["lat"] - curi_path[-1][0]) < 1e-3 and abs(perse_last["lon"] - perse_path[-1][1]) < 1e-3

os.makedirs(os.path.dirname(OUT), exist_ok=True)
txt = json.dumps(data, indent=2, ensure_ascii=False)
txt = re.sub(r"\[\s+(-?[\d.]+),\s+(-?[\d.]+)\s+\]", r"[\1, \2]", txt)  # one waypoint per line
open(OUT, "w", encoding="utf-8").write(txt + "\n")
print(len(data), "entries ->", OUT)
