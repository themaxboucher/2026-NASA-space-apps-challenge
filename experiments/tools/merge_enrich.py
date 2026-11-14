"""Fold agent enrichment (summary, fate, photo, orbit) into data/<world>.json. Re-runnable.

Usage: python tools/merge_enrich.py   (run from the abandoned/ folder)
"""
import json, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCES = {'moon': ['enrich-moon-apollo.json', 'enrich-moon-robotic.json'], 'mars': ['enrich-mars.json']}
FIELDS = ('summary', 'fate', 'photo', 'orbit')
FATES = {'operational', 'passive', 'left-behind', 'switched-off', 'power', 'comms', 'stuck',
         'damaged', 'crash-accident', 'crash-planned', 'lost'}


def check_image(p, where):
    if not p:
        return
    f = ROOT / p['file']
    assert f.is_file(), f'{where}: missing {p["file"]}'
    assert f.read_bytes()[:3] in (b'\xff\xd8\xff', b'\x89PN'), f'{where}: not a JPEG/PNG {p["file"]}'
    assert p.get('license') and p.get('credit'), f'{where}: image without license/credit'


for world, files in SOURCES.items():
    data_path = ROOT / 'data' / f'{world}.json'
    items = json.loads(data_path.read_text(encoding='utf-8'))
    extra = {}
    for name in files:
        src = ROOT / 'data' / name
        if src.exists():
            extra.update(json.loads(src.read_text(encoding='utf-8')))
        else:
            print(f'{world}: {name} not there yet')
    for it in items:
        e = extra.get(it['id'])
        if not e:
            print(f'{world}: no enrichment for {it["id"]}')
            continue
        assert e['fate']['category'] in FATES, f'{it["id"]}: bad fate {e["fate"]["category"]}'
        for k in ('photo', 'orbit'):
            check_image(e.get(k), f'{it["id"]}.{k}')
        it.update({k: e.get(k) for k in FIELDS})
    unknown = set(extra) - {it['id'] for it in items}
    assert not unknown, f'{world}: enrichment for unknown ids {unknown}'
    data_path.write_text(json.dumps(items, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(f'{world}: merged {sum(1 for it in items if it.get("fate"))}/{len(items)}')
