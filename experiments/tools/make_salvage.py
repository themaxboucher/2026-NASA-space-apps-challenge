"""Builds public/data/salvage.json. Score = sum of the four factors, grade from the rubric bands.
Run: python -I make_salvage.py <repo root>. Asserts every machine id gets exactly one entry."""
import json, sys, pathlib

root = pathlib.Path(sys.argv[1])
ids = [m['id'] for f in ('moon', 'mars', 'deepspace') for m in json.loads((root / f'public/data/{f}.json').read_text('utf-8'))]

S = dict(
    heritage='https://www.nasa.gov/wp-content/uploads/2023/12/nasa-usg-lunar-historic-sites-reva.pdf',
    onestep='https://www.congress.gov/bill/116th-congress/senate-bill/1694',
    s3='https://science.nasa.gov/mission/surveyor-3/',
    s3visit='https://www.nasa.gov/image-article/astronauts-pay-visit-surveyor-3/',
    s3cable='https://ntrs.nasa.gov/citations/19720012478',
    retrodust='https://tmurphy.physics.ucsd.edu/papers/Icarus-208-31.pdf',
    nglr='https://ilrs.gsfc.nasa.gov/missions/satellite_missions/current_missions/ngl1_general.html',
    rps='https://science.nasa.gov/planetary-science/programs/radioisotope-power-systems/about-rps/',
    mmrtg='https://science.nasa.gov/mission/mars-2020-perseverance/rover-components/',
    isru='https://www.nasa.gov/overview-in-situ-resource-utilization/',
    insight_boost='https://www.jpl.nasa.gov/news/nasas-insight-mars-lander-gets-a-power-boost',
    insight_clean='https://www.nasa.gov/missions/insight/for-insight-dust-cleanings-will-yield-new-science/',
    opp='https://science.nasa.gov/mission/mer-opportunity/',
    opp_recovery='https://www.jpl.nasa.gov/news/update-on-opportunity-rover-recovery-efforts/',
    mer='https://science.nasa.gov/mission/mars-exploration-rovers-spirit-and-opportunity/',
    free_spirit='https://webarchive.library.unt.edu/web/20090825062022/http://www.nasa.gov/mission_pages/mer/freespirit.html',
    spirit_platform='https://www.planetary.org/articles/2320',
    ingenuity='https://www.jpl.nasa.gov/news/nasa-performs-first-aircraft-accident-investigation-on-another-world/',
    hubble='https://science.nasa.gov/mission/hubble/observatory/missions-to-hubble/',
    voyager_fix='https://www.jpl.nasa.gov/news/nasas-voyager-1-resumes-sending-engineering-updates-to-earth/',
    tempel='https://www.jpl.nasa.gov/news/nasa-releases-images-of-man-made-crater-on-comet/',
    hera='https://www.esa.int/Space_Safety/Hera/ESA_s_Hera_targets_early_arrival_at_Didymos_asteroids',
    cassini='https://science.nasa.gov/mission/cassini/grand-finale/',
    galileo='https://science.nasa.gov/mission/galileo/',
    backshell='https://science.nasa.gov/resource/rovers-backshell-seen-from-the-air/',
    phoenix='https://science.nasa.gov/photojournal/image-from-mars-orbit-indicates-solar-panels-on-phoenix-lander-may-have-collapsed/',
    curiosity_wheels='https://www.jpl.nasa.gov/news/an-algorithm-helps-protect-mars-curiositys-wheels/',
    kepler='https://www.nasa.gov/news-release/nasa-retires-kepler-space-telescope-passes-planet-hunting-torch/',
    kepler_mission='https://science.nasa.gov/mission/kepler/',
    dawn='https://www.jpl.nasa.gov/news/nasas-dawn-mission-to-asteroid-belt-comes-to-end/',
    mco='https://llis.nasa.gov/llis_lib/pdf/1009464main1_0641-mr.pdf',
    mpl='https://ntrs.nasa.gov/citations/20000061966',
    mmrtg_dust='https://www.jpl.nasa.gov/news/press_kits/mars_2020/launch/mission/spacecraft/power/',
    lroc_sivb='https://lroc.im-ldi.com/images/1261',
    lroc_ranger='https://lroc.im-ldi.com/images/52',
    lroc_grail='https://lroc.im-ldi.com/images/596',
    lroc_ladee='https://lroc.im-ldi.com/images/822',
    lcross='https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=2009-031B',
    stardust_samples='https://curator.jsc.nasa.gov/stardust/',
)
own = {m['id']: m.get('source') for f in ('moon', 'mars', 'deepspace') for m in json.loads((root / f'public/data/{f}.json').read_text('utf-8'))}

def real(text, src): return {'text': text, 'kind': 'real', 'source': S.get(src, src)}
def idea(text): return {'text': text, 'kind': 'idea'}
def fix(part, problem): return {'part': part, 'problem': problem}

E = {}
def add(i, f, needs, approaches, prompt, says, says_src, sources=(), heritage=None):
    r, c, u, x = f
    E[i] = dict(id=i, factors=dict(reach=r, condition=c, usefulness=u, fixability=x), needsRepair=needs, approaches=approaches,
                prompt=prompt, engineersSay=says, engineersSource=S.get(says_src, says_src),
                sources=list(dict.fromkeys([own[i], *(S.get(s, s) for s in sources), S.get(says_src, says_src)] if own.get(i) else [*(S.get(s, s) for s in sources), S.get(says_src, says_src)])),
                **({'heritage': heritage} if heritage else {}))

def working(i, note, needs, approaches, prompt, says, says_src, sources=()):
    add(i, (0, 0, 0, 0), needs, approaches, prompt, says, says_src, sources)
    E[i].pop('factors'); E[i]['working'] = True; E[i]['note'] = note

HERITAGE = 'Protected history. NASA asks visitors to look from a distance and not touch Apollo sites, and a 2020 US law backs that up.'
heritage_appr = real('Leave it where it is. NASA wrote rules in 2011 asking future visitors to keep their distance from Apollo sites, and the One Small Step Act (2020) makes companies with US licences follow them.', 'heritage')

# ---------- Moon: Apollo lunar module descent stages ----------
for i, name, site in [('apollo11-lm', 'Eagle', 'Tranquility Base'), ('apollo12-lm', 'Intrepid', 'the Ocean of Storms'), ('apollo14-lm', 'Antares', 'Fra Mauro'),
                      ('apollo15-lm', 'Falcon', 'Hadley-Apennine'), ('apollo16-lm', 'Orion', 'the Descartes highlands'), ('apollo17-lm', 'Challenger', 'Taurus-Littrow')]:
    add(i, (25, 20, 20, 5),
        [fix('Nothing broke', 'It was a launch pad for the astronauts and was always meant to stay behind. Its engine and fuel are used up.')],
        [heritage_appr,
         idea('Study it from a safe distance with cameras, like a museum piece, to see what more than 50 years of sunlight, cold and tiny meteorites did to its metal and blankets.'),
         real('Learn from old hardware: in 1969 Apollo 12 astronauts brought home parts of Surveyor 3 so scientists could see how the Moon changed them.', 's3')],
        f'{name} is the most famous spaceship part on the Moon, and it sits at {site}. Would you take a piece home for a museum, or leave the whole site untouched? Why?',
        'Engineers and historians mostly say "leave it": NASA\'s 2011 guidelines set keep-out zones around Apollo landing sites, with the strictest rules for Apollo 11 and 17.',
        'heritage', ['onestep'], HERITAGE)

# ---------- Moon: laser retroreflectors ----------
for i in ['apollo11-lrrr', 'apollo14-lrrr', 'apollo15-lrrr']:
    add(i, (25, 18, 25, 15),
        [fix('Mirror faces', 'Moon dust has settled on the glass prisms, so they send back much less laser light than when they were new.')],
        [real('Put a new, better reflector somewhere else instead of touching the old one. A University of Maryland reflector, NGLR-1, launched to the Moon in January 2025.', 'nglr'),
         idea('Gently blow the dust off with a puff of gas from a robot arm. Risky: one wrong move could scratch the glass or break heritage rules.'),
         heritage_appr],
        'This mirror still works, but dust makes it dimmer. If you could not touch it, how else could you get a brighter laser echo from the Moon?',
        'Scientists studying the laser echoes found the Apollo reflectors now return about 10 times less light than expected, most likely because of dust. Their answer is to add new reflectors rather than clean the old ones.',
        'retrodust', ['nglr'], HERITAGE)

# ---------- Moon: Apollo 11 seismometer and ALSEP stations ----------
add('apollo11-pse', (25, 15, 15, 5),
    [fix('Electronics', 'It stopped answering commands after about three weeks, probably because it overheated in the midday Sun.'),
     fix('Solar panels', 'It ran on sunlight only, so it could not work through the freezing two-week lunar night.')],
    [heritage_appr,
     real('Use nuclear power instead of sunlight. The later Apollo science stations ran on small nuclear generators and lasted years longer.', 'rps'),
     idea('Bring a brand-new seismometer and set it down next to the old one, so the old one stays a museum piece.')],
    'The first seismometer on the Moon overheated in the Sun. How would you keep electronics cool at noon and warm at night on the Moon?',
    'Engineers fixed this for later missions by using radioisotope generators, which make steady power from heat, day or night.',
    'rps', [], HERITAGE)
for i in ['apollo12-alsep', 'apollo14-alsep', 'apollo15-alsep', 'apollo16-alsep', 'apollo17-alsep']:
    add(i, (25, 18, 15, 8),
        [fix('Power', 'NASA switched it off in 1977 to save money, and its small nuclear generator was already making less power each year.'),
         fix('Electronics', 'Its electronics have sat in the Moon\'s harsh heat, cold and radiation for about 50 years.')],
        [heritage_appr,
         idea('Plug in a fresh power source and see if it wakes up. It would tell engineers how well 1970s electronics survive on the Moon.'),
         real('Build new science stations instead. NASA plans to use local Moon materials and new equipment for future bases.', 'isru')],
        'This science station still stands where the astronauts left it, just switched off. If you could turn it back on, what would you want it to measure first?',
        'Engineers know its nuclear generator has faded, so waking it would need new power. For now NASA treats Apollo sites as protected history.',
        'heritage', ['rps'], HERITAGE)

# ---------- Moon: rovers ----------
for i in ['apollo15-lrv', 'apollo16-lrv', 'apollo17-lrv']:
    add(i, (25, 18, 18, 10),
        [fix('Batteries', 'Its batteries could not be recharged, so the rover went quiet once they ran down.')],
        [heritage_appr,
         idea('Swap in new rechargeable batteries and solar panels, then drive it to a museum on the Moon. Fun, but it would break heritage rules.'),
         idea('Photograph its wheels up close. They were made of woven wire, and seeing how they aged would help design tyres for new Moon rovers.')],
        'The Moon buggy only needs new batteries. Would you bring it back to life, or leave it parked exactly where the astronauts left it?',
        'NASA\'s 2011 guidelines ask visitors to keep away from Apollo rovers and their tracks, because the tracks are part of the history too.',
        'heritage', [], HERITAGE)

# ---------- Moon: Surveyors ----------
add('surveyor3', (25, 15, 20, 5),
    [fix('Battery and solar panel', 'It never woke up after its first freezing two-week lunar night in 1967.'),
     fix('Missing parts', 'Apollo 12 astronauts cut off its TV camera and other parts in 1969 and took them back to Earth.')],
    [real('Visit it and bring parts home. Apollo 12 did exactly this in 1969 so scientists could study how 2.5 years on the Moon changed metal, glass and wires.', 's3visit'),
     heritage_appr,
     idea('Look at it again with cameras today. Comparing 1969 and today would show what 57 more years of Moon weather did.')],
    'Apollo 12 astronauts walked to Surveyor 3 and cut off its camera. If you were on that moonwalk, which part would you bring home to study, and why?',
    'Engineers wanted real space-aged parts. Tests on Earth found the parts had held up well; the biggest change was discoloured surfaces from radiation and dust.',
    's3cable', ['s3'], 'Next to the Apollo 12 site, so it is treated as part of protected history.')
for i, nights in [('surveyor1', 'its second sunset'), ('surveyor5', 'several lunar nights'), ('surveyor6', 'the lunar night'), ('surveyor7', 'its second lunar day')]:
    add(i, (25, 18, 18, 8),
        [fix('Battery and solar panel', f'It ran on sunlight and batteries that were not built for the freezing two-week lunar night, and it gave out after {nights}.')],
        [real('Study it like Surveyor 3. Apollo 12 brought Surveyor 3 parts home, and the tests taught engineers how materials age on the Moon.', 's3'),
         real('Stay warm through the night with nuclear heat. Radioisotope power and heaters keep spacecraft alive when sunlight is gone.', 'rps'),
         idea('Send a small robot to take close-up photos, without touching it, to compare with Surveyor 3\'s returned parts.')],
        'The lunar night lasts about two weeks and gets colder than Antarctica. How would you design a lander that survives until morning?',
        'Engineers now use radioisotope heaters and generators, which make heat and power from decaying plutonium, for spacecraft that must survive long dark nights.',
        'rps', ['s3'])

# ---------- Moon: deliberate impacts ----------
for i in ['apollo13-sivb', 'apollo14-sivb', 'apollo15-sivb', 'apollo16-sivb', 'apollo17-sivb']:
    add(i, (22, 2, 8, 0),
        [fix('Whole rocket stage', 'It was crashed into the Moon on purpose at about 2.5 km per second and broke into pieces.')],
        [real('It already did its job: the crash shook the Moon so seismometers could listen to its insides.', 'lroc_sivb'),
         real('Use what is there: NASA is working on ways to make oxygen and metal from Moon soil and rocks for future bases.', 'isru'),
         idea('Collect the scattered aluminium bits as building material for a Moon base. First you would have to find them in the crater.')],
        'A rocket stage the size of a bus hit the Moon and shattered. Could the scraps still be useful? What would you build with them?',
        'There is nothing left to repair, so engineers think of crash sites as science and as possible raw materials, not as machines to fix.',
        'isru', ['lroc_sivb'])
for i in ['apollo12-lm-ascent', 'apollo14-lm-ascent', 'apollo15-lm-ascent', 'apollo17-lm-ascent']:
    add(i, (22, 2, 6, 0),
        [fix('Whole ascent stage', 'After the astronauts left it, mission control crashed it into the Moon to make a "moonquake" for the seismometers.')],
        [real('It already did its job: the crash gave the seismometers a known shake to measure.', own[i]),
         idea('Find the pieces and study how metal shatters at high speed on the Moon.'),
         real('Future bases may make oxygen and metal from Moon materials instead of carrying everything from Earth.', 'isru')],
        'Engineers crashed this spacecraft on purpose to make the Moon "ring". What could you learn from a crash at a known time and place?',
        'Scientists used crashes at known places and times to measure how vibrations travel through the Moon, like an ultrasound scan of its insides.',
        own[i], ['isru'])
for i in ['ranger6', 'ranger7', 'ranger8', 'ranger9']:
    add(i, (25, 1, 6, 0),
        [fix('Whole spacecraft', 'Rangers had no brakes or landing legs, so they smashed into the Moon as planned.')],
        [real('Revisit the crater from orbit. NASA\'s LRO camera has found and photographed the Ranger craters.', 'lroc_ranger'),
         idea('Fit future probes with landing legs and brakes, so they can keep working after arrival. (Surveyor did just that a few years later.)')],
        'Rangers sent pictures all the way down and then crashed. Is a crash a failure if it was the plan? How would you design a probe that lands instead?',
        'Engineers learned from Ranger and built Surveyor with legs and a braking rocket, so the next probes could soft-land.',
        'lroc_ranger')
for i in ['lcross-centaur', 'lcross-ssc']:
    add(i, (15, 2, 10, 0),
        [fix('Whole spacecraft', 'It was crashed into the always-dark Cabeus crater on purpose to blast up hidden material.')],
        [real('It already did its job: the crash plume let scientists look for water ice hiding in the dark crater.', 'lcross'),
         real('Use the ice: NASA wants future crews to turn Moon ice into water, air and rocket fuel.', 'isru'),
         idea('Send a rover with lights into Cabeus to find the impact site and study the ice up close.')],
        'This crater never sees sunlight and is colder than anywhere on Earth. How would you design a rover that explores in total darkness?',
        'Engineers plan to "live off the land": NASA\'s resource programme studies how to dig up ice in shadowed craters and turn it into water and oxygen.',
        'isru', ['lcross'])
for i in ['grail-ebb', 'grail-flow']:
    add(i, (18, 2, 8, 0),
        [fix('Whole spacecraft', 'Low on fuel, it was steered into a mountain near Goldschmidt crater, far from historic landing sites.')],
        [real('Pick a safe crash spot. NASA chose a remote mountain so the crash could not hit any historic site.', 'lroc_grail'),
         idea('Visit the Sally Ride impact site as a memorial and study what the crash did to the mountain.')],
        'When a spacecraft runs out of fuel, it has to go somewhere. Where would you choose to crash it, and why?',
        'Engineers plan the "end of mission" carefully, choosing crash sites that keep historic places and scientific sites safe.',
        'lroc_grail')
add('ladee', (15, 2, 4, 0),
    [fix('Whole spacecraft', 'It flew so low that its fuel ran out, and it crashed on the Moon\'s far side as planned.')],
    [real('Find the crater from orbit. NASA\'s LRO spotted LADEE\'s fresh crater.', 'lroc_ladee'),
     idea('Measure how quickly the dark blast marks around the crater fade, to learn how fast the Moon\'s surface changes.')],
    'LADEE always had to crash because it flew so low. Would you design a mission that knows it will end in a crash? What would you measure on the way down?',
    'Engineers sometimes accept a planned crash to fly closer and collect better data, then use orbiters to find and study the new crater.',
    'lroc_ladee')
add('lunar-prospector', (12, 2, 6, 0),
    [fix('Whole spacecraft', 'With its fuel nearly gone, it was steered into a permanently shadowed crater near the south pole.')],
    [real('It already did one last experiment: scientists hoped the crash would throw up water vapour, but none was detected.', own['lunar-prospector']),
     real('Mine the ice: NASA\'s plans focus on the south pole because ice there could become water and fuel.', 'isru')],
    'Lunar Prospector\'s last act was a crash to look for water. If you had one last tank of fuel, what experiment would you do with it?',
    'Engineers like to squeeze one more experiment out of a spacecraft\'s final moments, even a crash.',
    'isru')

# ---------- Mars ----------
DUST_WIND = real('Wait for wind. Gusts on Mars sometimes blow solar panels clean, which kept Spirit and Opportunity going for years.', 'opp')
NUKE = real('Skip solar panels: Curiosity and Perseverance run on nuclear generators, so dust and winter cannot cut their power.', 'mmrtg_dust')
add('viking1', (10, 18, 14, 6),
    [fix('Antenna pointing', 'A 1982 software update by mistake erased the data the lander used to aim its antenna at Earth.'),
     fix('Batteries', 'Its batteries were already ageing, which is why engineers were updating its software.')],
    [real('Fix by radio, one careful step at a time. In 2024 the Voyager 1 team moved broken code to new spots in memory and checked each step before the next.', 'voyager_fix'),
     idea('Land a helper robot nearby to listen to Viking on a short-range radio and relay the signal home.')],
    'One wrong software update cut Viking 1 off forever. How would you check a command before sending it to a spacecraft you can never touch?',
    'Engineers learned to test updates carefully and keep backups. When Voyager 1\'s memory failed in 2024, the team moved its code to new spots in memory and checked each step before going on.',
    'voyager_fix')
add('viking2', (10, 18, 14, 5),
    [fix('Batteries', 'After 1,281 Mars days of work, its batteries failed and the team switched it off in 1980.')],
    [idea('Bring new batteries with a future mission and see if the lander wakes up. Its electronics are now about 50 years old.'),
     real('Study old hardware: astronauts did this with Surveyor 3 on the Moon, and it taught engineers how materials age in space.', 's3')],
    'Viking 2 worked for over three Earth years, much longer than planned. What do you think wears out first on a machine left on Mars?',
    'Viking 2 worked for 1,281 Mars days before its batteries gave out. Today\'s long-lived rovers carry nuclear generators that recharge their batteries day and night.',
    'mmrtg_dust')
add('pathfinder', (10, 18, 12, 5),
    [fix('Battery', 'Engineers suspect its worn-out battery could no longer keep the electronics warm through the freezing nights.')],
    [real('Keep electronics warm with nuclear heat. Radioisotope heaters do this on many spacecraft.', 'rps'),
     idea('Give it a fresh battery and a heater blanket, then try calling it again.')],
    'Mars nights are colder than Antarctica. How would you keep a lander\'s electronics warm when its battery is old?',
    'Engineers use tiny radioisotope heater units, which give off warmth for decades, to keep parts from freezing.',
    'rps')
add('sojourner', (10, 20, 15, 8),
    [fix('Radio link', 'It could only talk to Earth through the Pathfinder lander, so when the lander went silent, Sojourner was cut off too.')],
    [real('Use orbiters as radio relays. Perseverance has one antenna to talk straight to Earth and another to send data through spacecraft circling Mars.', 'mmrtg'),
     idea('Land a new radio station nearby that speaks Sojourner\'s "language", so the little rover could talk again if it still has power.')],
    'Sojourner might have been fine, but its only phone line went dead. How would you give a rover a backup way to call home?',
    'Engineers now give rovers more than one way to talk: Perseverance can send data straight to Earth or through orbiters.',
    'mmrtg', ['mmrtg'])
add('spirit', (10, 17, 18, 8),
    [fix('Right-front wheel', 'Its motor stopped working in 2006, so Spirit drove backwards, dragging the dead wheel.'),
     fix('Stuck in sand', 'In 2009 its wheels broke through a crust into soft sand at a spot called Troy.'),
     fix('Solar panels', 'Stuck at a bad angle, it could not tilt its panels toward the low winter Sun.')],
    [real('Practise on Earth first. Engineers built a sandbox at JPL and tried escape moves with a test rover before sending commands.', 'free_spirit'),
     real('Turn it into a science station. In 2010 NASA stopped trying to drive Spirit and used it as a stationary platform.', 'spirit_platform'),
     idea('Send a helper robot with a shovel to dig out the wheels and push it onto firm ground.')],
    'Spirit is stuck in soft sand with one dead wheel. How would you get it out without anyone there to push?',
    'Engineers recreated Troy in a sandbox and tested drives with a twin rover for months. When nothing worked, they turned Spirit into a stationary science station.',
    'free_spirit', ['spirit_platform', 'mer'])
add('opportunity', (10, 18, 20, 10),
    [fix('Solar panels', 'A planet-wide dust storm in 2018 blocked their sunlight, and dust likely coated them.'),
     fix('Battery', 'With no power for months, its battery likely failed in the deep cold.')],
    [DUST_WIND, NUKE,
     idea('Send a robot with a soft brush or a puff of air to clean the panels, then try to wake it up.')],
    'Opportunity\'s panels went dark in a dust storm. How would you clean a solar panel 200 million km away, with no one to wipe it?',
    'Engineers hoped wind would clear the dust, as it had many times before, and sent more than a thousand commands to wake it before ending the mission in 2019.',
    'opp', ['opp_recovery', 'mer'])
add('phoenix', (8, 10, 14, 3),
    [fix('Solar panels', 'The Arctic winter took its sunlight, and orbit photos suggest heavy carbon-dioxide frost broke the panels.')],
    [real('Check from orbit before sending help. A HiRISE photo showed Phoenix\'s panels had likely collapsed under frost.', 'phoenix'),
     NUKE,
     idea('Design panels that fold up like an umbrella before winter, so frost cannot crush them.')],
    'Frost heavy enough to break metal settled on Phoenix every winter. How would you protect a lander in the Martian Arctic?',
    'Engineers knew Phoenix would not survive the Arctic winter. It was built for a summer mission, so its team planned for it to end.',
    'phoenix')
add('insight', (10, 20, 18, 12),
    [fix('Solar panels', 'Over four years, dust slowly piled up on them until there was too little power.')],
    [real('Trickle sand near the panels. In 2021 the team used InSight\'s robot arm to drop sand in the wind, which knocked dust off a panel and gave it more power.', 'insight_boost'),
     DUST_WIND, NUKE],
    'InSight\'s had no brush and no wiper for its panels. How would you clean them using only what the lander already had?',
    'Engineers had InSight pour sand on a windy day so blowing grains would scrub dust off its panel. It worked, but only a little, and the dust kept coming.',
    'insight_boost', ['insight_clean'])
add('ingenuity', (10, 14, 20, 10),
    [fix('Rotor blades', 'They broke in a hard landing on flight 72, after its navigation camera could not find enough landmarks over smooth sand.')],
    [real('Investigate the crash. Engineers used photos taken after the flight, including one from Perseverance showing a broken blade, to work out what went wrong.', 'ingenuity'),
     real('Learn for the next one: NASA expects the findings to help future Mars helicopters.', 'ingenuity'),
     idea('Carry spare blades and a robot arm that can snap new ones on.')],
    'Ingenuity\'s camera got "lost" over smooth sand with nothing to track. What would you add to help a flying robot know where it is?',
    'Engineers ran the first aircraft accident investigation on another world, about 160 million km away, using photos sent back after the crash. They found its navigation could not track featureless ground.',
    'ingenuity')
add('mars-polar-lander', (4, 2, 4, 0),
    [fix('Landing software', 'The jolt of its legs unfolding was most likely read as touchdown, so the engines shut off about 40 m up.')],
    [real('Find the cause on the ground. Investigators found the flaw slipped through because a test was run with wrongly wired sensors.', 'mpl'),
     idea('Give the lander a second way to sense the ground, like a radar and a leg sensor that must both agree.')],
    'A tiny software mistake made the lander think it had touched down too early. How would you test that a lander knows when it has really landed?',
    'Investigators concluded the most likely cause was the leg-sensor signal. The lesson: test the whole lander, hardware and software together, exactly as it will fly.',
    'mpl')
add('deep-space-2', (3, 1, 2, 0),
    [fix('Whole probes', 'Two small probes were built to slam into the ground. No signal was ever received from either one.')],
    [idea('Search for them with high-resolution cameras from orbit. Their exact landing spot is not known.'),
     real('Test more before launch. The review board said the probes were not ready to launch because they had not been tested enough.', 'mpl')],
    'These probes were the size of a basketball and hit Mars at high speed. How would you test a probe built to crash, before it goes?',
    'Engineers on the review board said a probe that has not been fully tested should not fly.',
    'mpl')
add('mars-climate-orbiter', (0, 0, 2, 0),
    [fix('Navigation numbers', 'One computer program used imperial units and another used metric units, so the orbiter flew too low into Mars\'s atmosphere.')],
    [real('Check your units! The investigation report made this one of the most famous lessons in engineering.', 'mco'),
     idea('Have two teams calculate the path separately and compare answers.')],
    'A mix-up between pounds and newtons lost a whole spacecraft. How would you make sure everyone on a team uses the same units?',
    'Investigators found the unit mix-up and said the bigger problem was that the checks meant to catch it did not work. Engineers now double-check units across every team.',
    'mco')
add('perseverance-backshell', (10, 12, 16, 3),
    [fix('Backshell and parachute', 'They were dropped during landing and hit the ground hard. They were never meant to be used again.')],
    [real('Photograph it from the air. Ingenuity took pictures of the backshell and parachute so engineers could see how they worked.', 'backshell'),
     idea('Reuse the parachute fabric or metal as shelter or raw material for a future Mars base.')],
    'Ingenuity flew over this landing gear and took pictures. What would you look for in those photos to make the next landing safer?',
    'Engineers used Ingenuity\'s photos to check how the parachute and backshell performed, to help design future landings.',
    'backshell')
working('curiosity', 'Still working — not salvage, it\'s a mission.',
        [fix('Wheels', 'Sharp rocks poke holes in its thin aluminium wheels as it drives.')],
        [real('New driving software. Engineers sent a traction control update that adjusts each wheel\'s speed over rocks to slow the damage.', 'curiosity_wheels'),
         idea('Plan routes around the sharpest rocks, like picking a path barefoot.')],
        'Curiosity\'s wheels are wearing out and nobody can change a tyre on Mars. How would you make them last longer?',
        'Engineers wrote new software that changes each wheel\'s speed as it climbs over rocks, reducing the push on the wheels.',
        'curiosity_wheels', ['mmrtg'])
working('perseverance', 'Still working — not salvage, it\'s a mission.', [],
        [NUKE],
        'Perseverance gets its power from plutonium, not sunlight. Why might engineers choose that for a rover on dusty Mars?',
        'Engineers chose a nuclear generator because it gives power day and night, in any season, and dust cannot cover it.',
        'mmrtg')

# ---------- Deep space ----------
GONE = [fix('Whole spacecraft', 'It was destroyed. There is nothing left to repair or recover.')]
for i, star in [('pioneer10', 'Aldebaran'), ('pioneer11', 'the constellation Aquila')]:
    add(i, (0, 20, 10, 0),
        [fix('Power', 'Its nuclear generator faded until it was too weak to send a signal home.')],
        [idea('Leave it as a message in a bottle: it carries a plaque for anyone who might find it.'),
         idea('Chase it with a faster probe. It would take many decades, and catching up is not the same as stopping it.')],
        f'This probe is drifting toward {star} and will never stop. Could anything ever catch it? Should we even try?',
        'Engineers treat it as gone for good. It is far beyond the reach of any spacecraft we could send, and its power ran out long ago.',
        own[i])
working('voyager1', 'Still working — not salvage, it\'s a mission.',
        [fix('Power', 'Its nuclear generator makes less power every year, so engineers switch instruments off one at a time.')],
        [real('Fix it by radio. When a memory chip failed in 2024, engineers moved the code to other spots in memory, from 24 billion km away.', 'voyager_fix'),
         real('Save power by turning things off. The team switched off an instrument in 2026 to keep the spacecraft running.', own['voyager1'])],
        'A message to Voyager 1 takes nearly a day to arrive. How would you fix a computer you cannot see, when every test takes two days?',
        'Engineers worked out which chip had failed, split the code across other parts of memory and sent it piece by piece, checking each step.',
        'voyager_fix')
working('voyager2', 'Still working — not salvage, it\'s a mission.',
        [fix('Power', 'Its nuclear generator makes less power every year.')],
        [real('Share out the power carefully. Engineers turn off heaters and instruments to keep the most important science running.', own['voyager2'])],
        'Voyager 2 has less power every year. If you had to switch something off, how would you decide what goes first?',
        'Engineers rank what matters most for science and switch off the rest, step by step, so Voyager 2 keeps working as long as possible.',
        own['voyager2'])
working('newhorizons', 'Still working — not salvage, it\'s a mission.', [],
        [real('Sleep to save energy. New Horizons spends long stretches in hibernation between busy periods.', own['newhorizons'])],
        'New Horizons naps for months at a time. Why would a spacecraft far from home want to sleep?',
        'Engineers put it into hibernation to save wear and reduce work for the team, then wake it up to check its health.',
        own['newhorizons'])
working('juno', 'Still working — not salvage, it\'s a mission.', [], [],
        'Juno flies through Jupiter\'s fierce radiation. How would you protect a spacecraft\'s brain from radiation?',
        'Engineers put Juno\'s most important electronics inside a thick titanium vault to shield them from radiation.',
        own['juno'])
working('osiris_apex', 'Still working — not salvage, it\'s a mission.', [],
        [real('Reuse a spacecraft. After returning its asteroid sample, OSIRIS-REx got a new job: visiting asteroid Apophis.', own['osiris_apex'])],
        'OSIRIS-REx finished its job and got a brand-new one. What other old spacecraft would you give a second mission?',
        'Engineers check how much fuel and health a spacecraft has left, then look for a new target it can still reach.',
        own['osiris_apex'])
add('galileo', (0, 0, 4, 0),
    [fix('Main antenna', 'Its big umbrella antenna jammed half open, so it had to send everything through a tiny backup antenna.'), *GONE],
    [real('Work around it. Engineers wrote new software that squeezed pictures, so the small antenna could send up to 10 times more.', 'galileo'),
     real('Protect other worlds. NASA steered Galileo into Jupiter so it could never crash into Europa, which may hide an ocean.', 'galileo')],
    'Galileo\'s main antenna would not open. If you could only send home a few pictures a day, how would you choose what to send?',
    'Engineers upgraded the software on Galileo and the antennas on Earth, so the mission still did most of its science with a tiny antenna.',
    'galileo')
add('galileo_probe', (0, 0, 2, 0), GONE,
    [real('It was meant to end this way: the probe dropped into Jupiter, measuring the air until heat and pressure destroyed it.', 'galileo')],
    'This probe dove into Jupiter knowing it would be crushed. What would you measure in the last hour before that?',
    'Engineers build probes like this to send as much data as possible before they are destroyed, since nothing can survive that deep inside Jupiter.',
    'galileo')
add('cassini', (0, 0, 4, 0), GONE,
    [real('Protect other worlds. NASA plunged Cassini into Saturn so it could never crash into moons like Enceladus and Titan.', 'cassini'),
     real('Use the last fuel for science: its "Grand Finale" dives between Saturn and its rings sent back new discoveries.', 'cassini')],
    'Cassini was steered into Saturn on purpose. Why might it be better to destroy a spacecraft than leave it orbiting?',
    'Engineers chose to burn Cassini up in Saturn so it could never land on a moon that might have life and bring Earth germs with it.',
    'cassini')
add('messenger', (2, 1, 3, 0), GONE,
    [idea('Look for its crater with a future Mercury orbiter and see how fresh craters change near the Sun.')],
    'MESSENGER crashed into Mercury at about 14,000 km/h. If you could send a camera to find the crater, what would you want to learn?',
    'Engineers used MESSENGER\'s last bits of fuel to stretch the mission as long as they could before the crash.',
    own['messenger'])
for i in ['magellan', 'pioneer_venus_orbiter']:
    add(i, (0, 0, 2, 0), [fix('Whole spacecraft', 'It burned up in Venus\'s thick atmosphere at the end of its mission.')],
        [real('Use the ending for science: the last dive measured Venus\'s atmosphere.', own[i])],
        'This spacecraft finished by diving into Venus\'s air. What do you think it could measure on the way down?',
        'Engineers often plan a final experiment for the end of a mission, even when it means the spacecraft will burn up.',
        own[i])
for i in ['pioneer_venus_large_probe', 'pioneer_venus_small_probes']:
    add(i, (1, 2, 3, 0), [fix('Whole probe', 'Venus\'s surface is hot enough to melt lead, so nothing built in 1978 still works there.')],
        [idea('Build electronics that work in Venus heat. It would have to be a whole new spacecraft.'),
         idea('Float a balloon high in Venus\'s cooler clouds instead of landing on the scorching ground.')],
        'Venus\'s ground is about 460 °C. How would you design a machine that keeps working there for more than an hour?',
        'Engineers say nothing could repair a probe on Venus\'s surface. The next landers will need parts built to survive the heat from the start.',
        own[i])
add('dawn', (3, 22, 10, 5),
    [fix('Fuel', 'It ran out of the fuel it needed to point its antenna at Earth, so it is silent but still circling Ceres.')],
    [real('Leave it in a safe orbit. NASA placed Dawn in an orbit that should last at least 20 years so it won\'t crash into Ceres.', 'dawn'),
     idea('Send a robotic fuel truck to top up its tanks so it could talk again.')],
    'Dawn is healthy but out of fuel, circling a dwarf planet. Would you send a robot to refuel it, or build a new spacecraft? Which is easier?',
    'Engineers chose a long, safe orbit so Dawn would not crash onto Ceres, which scientists want to keep clean for future study.',
    'dawn')
add('near_shoemaker', (5, 18, 10, 4),
    [fix('Mission ended', 'It was never built to land, but it touched down gently on asteroid Eros and sent data for about two weeks before the team stopped listening.')],
    [idea('Visit Eros and look at how 25 years on an asteroid changed its metal and solar panels.'),
     real('Land on asteroids on purpose: later missions like OSIRIS-REx touched asteroids to collect samples.', own['osiris_apex'])],
    'NEAR Shoemaker landed on an asteroid it wasn\'t built for. How would you land softly on something with almost no gravity?',
    'Engineers slowed it down step by step until it touched down at about walking speed, then kept listening to it on the surface for about two weeks.',
    own['near_shoemaker'])
add('kepler', (6, 20, 12, 8),
    [fix('Pointing wheels', 'Two of the spinning wheels that held it steady broke, the second in 2013.'),
     fix('Fuel', 'It ran out of fuel in 2018 and was switched off.')],
    [real('Get clever with what still works. After the breakdown, engineers found a new way to point Kepler, switching its view every three months, and called it K2.', 'kepler'),
     real('Repair it with astronauts. Hubble was built to be fixed this way, and five shuttle crews repaired and upgraded it.', 'hubble'),
     idea('Send a robot servicer to fit new wheels and fuel. Kepler is far behind Earth and was not designed for repairs.')],
    'Kepler lost the wheels that pointed it. How would you keep a telescope pointed at the same stars without them?',
    'Engineers found a fix that changed its view every three months, and the K2 mission went on to survey more than 500,000 stars.',
    'kepler', ['kepler_mission'])
add('spitzer', (6, 20, 12, 6),
    [fix('Coolant', 'It ran out of the liquid helium that kept its coldest instruments working, and carried on with fewer cameras.'),
     fix('Switched off', 'NASA turned it off in 2020 while it trailed farther and farther behind Earth.')],
    [real('Keep working with what is left. After the coolant ran out, Spitzer kept doing science with its remaining cameras for years.', own['spitzer']),
     idea('Refill it with coolant from a robotic tanker. It would have to chase Spitzer around the Sun first.')],
    'Spitzer needed to be super cold to see heat from distant stars. How would you keep a telescope cold in space?',
    'Engineers kept Spitzer working long after its coolant ran out by using the instruments that still worked when warmer.',
    own['spitzer'], ['hubble'])
add('deep_impact_impactor', (2, 0, 6, 0), GONE,
    [real('Go back and look. In 2011 NASA\'s Stardust flew past comet Tempel 1 and photographed the crater the impactor made.', 'tempel')],
    'Six years after the crash, another spacecraft found the crater. What would you want to see when you came back?',
    'Engineers sent Stardust to Tempel 1 to see how the crater had changed after the comet passed the Sun.',
    'tempel')
add('stardust', (4, 20, 8, 4),
    [fix('Fuel', 'It used up its fuel in 2011 and was switched off in orbit around the Sun.')],
    [real('Bring the treasure home. Stardust dropped a capsule of comet dust to Earth in 2006, and scientists still study it.', 'stardust_samples'),
     real('Give it a second job. After its first comet, Stardust visited Tempel 1.', 'tempel')],
    'Stardust sent its comet dust home in a capsule. Why is bringing a sample to Earth better than studying it in space?',
    'Engineers designed a capsule to survive the fastest re-entry ever at the time, so scientists on Earth could study comet dust with their best tools.',
    'stardust_samples')
add('dart', (3, 0, 10, 0), GONE,
    [real('Go back and look. Europe\'s Hera spacecraft launched in 2024 to study what DART did to asteroid Dimorphos.', 'hera')],
    'DART crashed into an asteroid to nudge it. If you could fly there next, what would you measure to see if it worked?',
    'Engineers sent ESA\'s Hera to measure Dimorphos up close, including its mass and what the impact changed.',
    'hera', ['hera'])

# ---------- grade and write ----------
for e in E.values():  # every URL shown anywhere in the block also appears in the sources list
    e['sources'] = list(dict.fromkeys([*e['sources'], *(a['source'] for a in e['approaches'] if a.get('source'))]))
BANDS = [('A', 80), ('B', 65), ('C', 50), ('D', 35), ('F', 0)]
for e in E.values():
    if e.get('working'):
        e['score'] = None; e['grade'] = None; continue
    e['score'] = sum(e['factors'].values())
    e['grade'] = next(g for g, lo in BANDS if e['score'] >= lo)

assert sorted(E) == sorted(ids), (set(ids) - set(E), set(E) - set(ids))
assert all(all(0 <= v <= 25 for v in e['factors'].values()) for e in E.values() if 'factors' in e)
assert all(a['kind'] == 'idea' or a.get('source', '').startswith('http') for e in E.values() for a in e['approaches'])

rubric = {
    'about': 'Salvageability: how easy and how worthwhile it would be to visit, recover, reuse or fix this machine. Four factors, 0 to 25 points each, add up to a score out of 100.',
    'factors': [
        {'key': 'reach', 'label': 'Reachability', 'question': 'Could a future crew or robot get there?',
         'scale': '25 = Moon near side, close to where Artemis-era missions could land. 12-18 = Moon far side, poles or dark craters. 10 = Mars surface (robots only, a long trip). 3-6 = drifting around the Sun or on an asteroid. 0 = burned up, location unknown, or leaving the solar system.'},
        {'key': 'condition', 'label': 'Condition', 'question': 'What shape is it in?',
         'scale': '20-25 = standing intact, as it was left. 12-18 = intact but aged, dusty or partly broken. 1-5 = crash debris. 0 = burned up or vaporised.'},
        {'key': 'usefulness', 'label': 'Usefulness', 'question': 'Is anything still worth having?',
         'scale': '25 = still in use today. 15-20 = big historic value or science from decades of exposure. 6-12 = some science value, or scrap metal for future builders. 0-4 = almost nothing left.'},
        {'key': 'fixability', 'label': 'Fixability', 'question': 'Could the broken part be repaired or replaced?',
         'scale': '15+ = an easy fix someone could do on site. 8-12 = possible with new parts or a cleaning. 3-6 = would need major work. 0 = nothing left to fix, or out of reach.'},
    ],
    'grades': [
        {'grade': 'A', 'min': 80, 'meaning': 'Great salvage target'},
        {'grade': 'B', 'min': 65, 'meaning': 'Good target'},
        {'grade': 'C', 'min': 50, 'meaning': 'Possible, but hard'},
        {'grade': 'D', 'min': 35, 'meaning': 'Very hard'},
        {'grade': 'F', 'min': 0, 'meaning': 'Not salvageable'},
    ],
    'working': 'Machines that are still working get no score: they are not salvage, they are missions.',
    'heritage': 'A high grade means it COULD be salvaged, not that it SHOULD. Apollo sites are protected history: NASA\'s 2011 guidelines and the One Small Step Act (2020) ask visitors to keep their distance.',
    'kinds': {'real': 'Tried for real: an approach NASA or others have actually used or proposed (with a source).', 'idea': 'Idea: a "what if" nobody has tried. Could you make it work?'},
}
out = {'rubric': rubric, 'machines': {i: E[i] for i in ids}}
(root / 'public/data/salvage.json').write_text(json.dumps(out, ensure_ascii=False, indent=1) + '\n', 'utf-8')
from collections import Counter
print(Counter(e['grade'] or 'working' for e in E.values()))
print(len(E), 'entries')
