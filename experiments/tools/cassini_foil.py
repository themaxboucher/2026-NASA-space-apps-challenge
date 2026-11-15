"""Replace Cassini's baked crumpled-foil photo with a soft, tileable gold-foil texture + normal map.

The NASA model (Brian Kumanchik) paints a photo of crumpled foil, highlights and all, onto a matte material,
so it looks blotchy and stretched. Real Cassini blankets are smooth-ish amber MLI with gentle creases, so this
generates band-limited (FFT, hence tileable) crease noise, turns it into a subtle colour map and a normal map,
and makes the foil materials partly metallic so the scene lights the shine.

Usage: python cassini_foil.py public/models/cassini.gltf.json   (rewrites the file in place; run once)
"""
import base64
import io
import json
import sys

import numpy as np
from PIL import Image

N = 1024
rng = np.random.default_rng(7)


def band_noise(lo, hi):
    """Periodic noise with energy between spatial frequencies lo..hi (cycles per tile)."""
    f = np.fft.fftfreq(N) * N
    r = np.hypot(*np.meshgrid(f, f))
    spec = (rng.normal(size=(N, N)) + 1j * rng.normal(size=(N, N))) * ((r >= lo) & (r <= hi)) / np.maximum(r, 1)
    n = np.real(np.fft.ifft2(spec))
    return n / np.abs(n).max()


# Creases: ridged noise (1 - |n|) at two scales; broad billows underneath.
h = 0.55 * (1 - np.abs(band_noise(6, 14))) ** 3 + 0.3 * (1 - np.abs(band_noise(16, 34))) ** 3 + 0.35 * band_noise(2, 5)
h = (h - h.min()) / (h.max() - h.min())

# Normal map from the periodic gradient.
k = 6.0
dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * k
dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * k
nrm = np.dstack([-dx, dy, np.ones_like(h)])
nrm /= np.linalg.norm(nrm, axis=2, keepdims=True)
normal = ((nrm * 0.5 + 0.5) * 255).astype(np.uint8)

# Colour: amber-gold Kapton, only ±10% shading from the creases (the light adds the rest).
gold = np.array([206, 156, 72], float)
shade = 0.9 + 0.2 * h
color = np.clip(gold[None, None, :] * shade[..., None], 0, 255).astype(np.uint8)


def encode(arr, fmt):
    b = io.BytesIO()
    Image.fromarray(arr).save(b, fmt, **({"quality": 88} if fmt == "WEBP" else {"optimize": True}))
    return b.getvalue()


path = sys.argv[1]
g = json.load(open(path, encoding="utf8"))
names = [m["name"] for m in g["materials"]]
assert "foil_gold" in names and not any(i.get("name") == "foil_soft" for i in g["images"]), "already patched?"
head, b64 = g["buffers"][0]["uri"].split(",", 1)
data = bytearray(base64.b64decode(b64))


def add_image(name, arr, small):
    """Appends webp + png fallback (png downscaled, it is only for loaders without webp) and returns a texture index."""
    srcs = []
    for fmt, mime, a in (("WEBP", "image/webp", arr), ("PNG", "image/png", small)):
        blob = encode(a, fmt)
        while len(data) % 4:
            data.append(0)
        g["bufferViews"].append({"buffer": 0, "byteOffset": len(data), "byteLength": len(blob)})
        data.extend(blob)
        g["images"].append({"bufferView": len(g["bufferViews"]) - 1, "mimeType": mime, "name": name})
        srcs.append(len(g["images"]) - 1)
    g["textures"].append({"extensions": {"EXT_texture_webp": {"source": srcs[0]}}, "sampler": 0, "source": srcs[1]})
    return len(g["textures"]) - 1


half = lambda a: np.asarray(Image.fromarray(a).resize((256, 256), Image.LANCZOS))
tc = add_image("foil_soft", color, half(color))
tn = add_image("foil_soft_normal", normal, half(normal))
for m in g["materials"]:
    pbr = m["pbrMetallicRoughness"]
    if m["name"] == "foil_gold":
        uv = pbr["baseColorTexture"].get("texCoord", 0)
        pbr.update(baseColorTexture={"index": tc, "texCoord": uv}, metallicFactor=0.45, roughnessFactor=0.38)
        m["normalTexture"] = {"index": tn, "texCoord": uv, "scale": 0.7}
    elif m["name"] == "foil_gold_2":  # gradient-mapped parts: no usable UVs for a normal map, just make them foil-like
        pbr.update(metallicFactor=0.45, roughnessFactor=0.4)

g["buffers"][0]["byteLength"] = len(data)
g["buffers"][0]["uri"] = head + "," + base64.b64encode(bytes(data)).decode()
json.dump(g, open(path, "w", encoding="utf8"), separators=(",", ":"))
print("patched", path, len(data), "bytes")
