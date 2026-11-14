"""Download photos taken BY each machine, resize, write photos-by.json.
usage: python -I build.py <scratchdir> <project public dir>"""
import sys, os, io, json, time, urllib.request, urllib.parse
sys.path.insert(0, sys.argv[1])
from sel import SEL
from PIL import Image

PUB = sys.argv[2]
UA = {'User-Agent': 'GhostRoverAtlas-edu/1.0 (school project; python urllib)'}
MAXW, MAXB = 1600, 350_000


def fetch(url, tries=4):
    for i in range(tries):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40).read()
        except urllib.error.HTTPError as e:
            if e.code in (429, 503) and i < tries - 1:
                print('  429, waiting', e.headers.get('Retry-After'), flush=True); time.sleep(min(700, max(30, int(e.headers.get('Retry-After') or 30)))); continue
            raise


def commons_urls(names):
    out = {}
    for i in range(0, len(names), 40):
        q = {'action': 'query', 'format': 'json', 'prop': 'imageinfo', 'iiprop': 'url', 'iiurlwidth': '1280',
             'titles': '|'.join('File:' + n for n in names[i:i + 40])}
        d = json.loads(fetch('https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode(q)))
        norm = {x['to']: x['from'] for x in d['query'].get('normalized', [])}
        for pg in d['query']['pages'].values():
            t = norm.get(pg['title'], pg['title'])[5:]
            if 'imageinfo' in pg:
                out[t] = pg['imageinfo'][0].get('thumburl') or pg['imageinfo'][0]['url']
        time.sleep(2)
    return out


def save(raw, path):
    im = Image.open(io.BytesIO(raw))
    im.seek(0)
    im = im.convert('RGB')
    if im.width > MAXW:
        im = im.resize((MAXW, round(im.height * MAXW / im.width)), Image.LANCZOS)
    while True:
        for q in (85, 78, 70, 62):
            buf = io.BytesIO(); im.save(buf, 'JPEG', quality=q, optimize=True, progressive=True)
            if buf.tell() <= MAXB: break
        if buf.tell() <= MAXB: break
        im = im.resize((round(im.width * .85), round(im.height * .85)), Image.LANCZOS)
    open(path, 'wb').write(buf.getvalue())
    return im.width, im.height, buf.tell()


cnames = [r for v in SEL.values() for k, r, *_ in v if k == 'c']
curls = commons_urls(cnames)
out, total = {}, 0
for mid, items in SEL.items():
    os.makedirs(os.path.join(PUB, 'photos', 'by', mid), exist_ok=True)
    for kind, ref, name, caption, credit in items:
        rel = f'photos/by/{mid}/{name}.jpg'
        dest = os.path.join(PUB, rel)
        if kind == 'n':
            src = f'https://images.nasa.gov/details/{ref}'
            man = [i['href'].replace('http://', 'https://') for i in json.loads(fetch(f'https://images-api.nasa.gov/asset/{ref}'))['collection']['items']]
            rank = lambda u: next((k for k, t in enumerate(('~large.jpg', '~orig.jpg', '~orig.png', '~orig.tif', '~medium.jpg')) if u.endswith(t)), 99)
            urls = sorted((u for u in man if rank(u) < 99), key=rank)
        elif kind == 'u':
            src, urls = 'https://nssdc.gsfc.nasa.gov/photo_gallery/photogallery-venus.html', [ref]
        else:
            src = 'https://commons.wikimedia.org/wiki/File:' + urllib.parse.quote(ref.replace(' ', '_'))
            urls = [curls[ref]] if ref in curls else []
        if os.path.exists(dest):
            im = Image.open(dest); w, h, b = im.width, im.height, os.path.getsize(dest)
        else:
            raw = None
            for u in urls:
                try: raw = fetch(u); break
                except Exception as e: print('  fail', u, e)
            if raw is None: print('MISSING', mid, ref); continue
            w, h, b = save(raw, dest)
            time.sleep(20 if kind == 'c' else 0.3)
        total += b
        out.setdefault(mid, []).append({'file': rel, 'w': w, 'h': h, 'caption': caption, 'credit': credit,
                                        'license': 'Public domain', 'source': src})
        print(f'{mid:22} {name:24} {w}x{h} {b//1024}KB')
json.dump(out, open(os.path.join(PUB, 'data', 'photos-by.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('machines', len(out), 'photos', sum(map(len, out.values())), 'bytes', total)
