"""GLB -> self-contained glTF JSON (buffer as base64 data URI). Artifacts serve .json but not .glb."""
import base64, json, struct, sys, pathlib
for p in map(pathlib.Path, sys.argv[1:]):
    d = p.read_bytes()
    assert d[:4] == b'glTF', p
    jl = struct.unpack('<I', d[12:16])[0]
    j = json.loads(d[20:20 + jl])
    off = 20 + jl
    bl = struct.unpack('<I', d[off:off + 4])[0]
    assert d[off + 4:off + 8] == b'BIN\x00', p
    j['buffers'][0]['uri'] = 'data:application/octet-stream;base64,' + base64.b64encode(d[off + 8:off + 8 + bl]).decode()
    out = p.with_suffix('.gltf.json')
    out.write_text(json.dumps(j, separators=(',', ':')))
    print(f'{out.name} {out.stat().st_size / 1e6:.2f} MB')
