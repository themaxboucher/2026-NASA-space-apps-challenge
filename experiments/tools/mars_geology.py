"""Geology for the Mars sites, from the USGS global Geologic Map of Mars (Tanaka et al. 2014, SIM 3292).

Reads the map through NASA Mars Trek's ArcGIS service (the same data the USGS-NASA PGM interactive map shows) and writes
  public/terrain/mars/<site>/geology.json   unit at each machine, plain-language line for kids
  public/terrain/mars/geology-global.png    2048x1024 equirectangular overlay (USGS unit colours, transparent elsewhere)
  public/terrain/mars/geology-legend.json   unit code, name, age, colour, credit
Run from the project root: python experiments/tools/mars_geology.py
"""
import io, json, os, urllib.parse, urllib.request
from PIL import Image

SVC = 'https://trek.nasa.gov/mars/trekarcgis/rest/services/SIM3292_Global_Geology/MapServer'
OUT = 'public/terrain/mars'
SOURCE = {
    'title': 'Geologic Map of Mars (SIM 3292), scale 1:20,000,000',
    'credit': 'Tanaka, K.L., Skinner, J.A., Jr., Dohm, J.M., Irwin, R.P., III, Kolb, E.J., Fortezzo, C.M., Platz, T., Michael, G.G., and Hare, T.M., 2014, U.S. Geological Survey; served by NASA Mars Trek',
    'url': 'https://doi.org/10.3133/sim3292',
    'license': 'Public domain (U.S. Geological Survey)',
}
ERA = {'A': 'Amazonian', 'H': 'Hesperian', 'N': 'Noachian'}
PART = {'e': 'Early', 'm': 'Middle', 'l': 'Late'}
# Unit at each landing site, explained for a 10-year-old. Ages follow the map's unit names; years are rounded.
KID = {
    'Htu': 'Mount Sharp is a stack of rock layers laid down by water and wind about 3.5 billion years ago, when Mars was slowly drying out.',
    'Apu': 'This ground near the south pole is made of thin layers of ice and dust that piled up during the most recent era of Mars history.',
    'HNt': 'This is flat ground from more than 3.5 billion years ago, on the border between the old southern highlands and the low northern plains.',
    'eHt': 'InSight sits on flat plains of old lava rock about 3.6 billion years old, now covered by a blanket of dust and broken rock.',
    'HNhu': 'Opportunity drove over layers of salty sandstone that formed with the help of water more than 3.5 billion years ago.',
    'Hto': 'Giant floods once rushed across this plain, about 3.5 billion years ago, and left behind rocks carried from far away.',
    'mNhm': 'On this world map the spot is part of the rocky hills around the huge Isidis impact basin, nearly 4 billion years old (Jezero crater is too small to show on a map of all of Mars).',
    'lHl': 'This is a smooth plain in the low northern half of Mars, covered by material spread out about 3.4 billion years ago, with ice hidden just under the soil today.',
    'eHv': 'Spirit drove across dark lava plains that flowed into Gusev crater about 3.6 billion years ago.',
}


def get(url, **q):
    if q: url += '?' + urllib.parse.urlencode(q)
    with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'atlas-build'}), timeout=120) as r:
        return r.read()


def age_of(code):
    """'eHv' -> 'Early Hesperian', 'AHi' -> 'Amazonian and Hesperian', 'Htu' -> 'Hesperian'."""
    p, rest = (PART[code[0]], code[1:]) if code[:1] in PART else (None, code)
    eras = []
    for c in rest:
        if c not in ERA: break
        eras.append(ERA[c])
    era = ' and '.join(eras)
    return f'{p} {era}' if p else era


def legend():
    info = json.loads(get(SVC + '/0', f='json'))
    col = {u['value']: u['symbol']['color'][:3] for u in info['drawingInfo']['renderer']['uniqueValueInfos']}
    codes, off = {}, 0
    while True:  # the service has no paging, so walk OBJECTID in blocks
        d = json.loads(get(SVC + '/0/query', where=f'OBJECTID>={off} AND OBJECTID<{off + 900}', outFields='Unit,UnitDesc', returnGeometry='false', f='json'))
        for f in d['features']: codes[f['attributes']['UnitDesc']] = f['attributes']['Unit']
        if not d['features']: break
        off += 900
    units = [{'unit': codes.get(n, ''), 'unitName': n, 'age': age_of(codes.get(n, '')), 'color': '#%02x%02x%02x' % tuple(c)} for n, c in col.items()]
    return units, {u['unitName']: u for u in units}


def overlay(z=2):
    cols, rows = 2 ** (z + 1), 2 ** z  # 256 px tiles of 180/2^z degrees, top-left -180/90
    img = Image.new('RGBA', (cols * 256, rows * 256))
    for y in range(rows):
        for x in range(cols):
            img.paste(Image.open(io.BytesIO(get(f'{SVC}/tile/{z}/{y}/{x}'))).convert('RGBA'), (x * 256, y * 256))
    return img


def main():
    units, by_name = legend()
    assert all(u['unit'] for u in units), 'unit code missing for some legend entries'
    overlay().save(f'{OUT}/geology-global.png', optimize=True)
    json.dump({'source': SOURCE, 'image': 'geology-global.png', 'projection': 'equirectangular, lon -180..180, lat 90..-90',
               'units': sorted(units, key=lambda u: u['unit'])}, open(f'{OUT}/geology-legend.json', 'w', encoding='utf8'), indent=1, ensure_ascii=False)
    for site in sorted(os.listdir(OUT)):
        mf = f'{OUT}/{site}/meta.json'
        if not os.path.isfile(mf): continue
        lat, lon = json.load(open(mf, encoding='utf8'))['center']
        d = json.loads(get(SVC + '/0/query', geometry=f'{lon},{lat}', geometryType='esriGeometryPoint', inSR=104905,
                           spatialRel='esriSpatialRelIntersects', outFields='Unit,UnitDesc', returnGeometry='false', f='json'))
        a = d['features'][0]['attributes']
        u = by_name[a['UnitDesc']]
        assert a['Unit'] in KID, f'write a kid line for {a["Unit"]} ({site})'
        g = {'unit': a['Unit'], 'unitName': a['UnitDesc'], 'age': u['age'], 'color': u['color'], 'kidText': KID[a['Unit']], 'lat': lat, 'lon': lon, 'source': SOURCE}
        json.dump(g, open(f'{OUT}/{site}/geology.json', 'w', encoding='utf8'), indent=1, ensure_ascii=False)
        print(site, a['Unit'], u['age'], '-', a['UnitDesc'])


if __name__ == '__main__':
    assert age_of('eHv') == 'Early Hesperian' and age_of('AHi') == 'Amazonian and Hesperian' and age_of('Htu') == 'Hesperian' and age_of('lApc') == 'Late Amazonian' and age_of('HNt') == 'Hesperian and Noachian'
    main()
