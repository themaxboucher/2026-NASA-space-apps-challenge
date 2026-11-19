"""Merge every code-built model's <key>.json (written by gen.finish) into public/models/models.json.
Run after building models:  python -I models-src/procedural/register.py   (safe to run again)."""
import glob, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
path = os.path.join(ROOT, "public", "models", "models.json")
models = json.load(open(path, encoding="utf-8"))

for f in sorted(glob.glob(os.path.join(HERE, "*.json"))):
    key = os.path.splitext(os.path.basename(f))[0]
    info = json.load(open(f, encoding="utf-8"))
    models[key] = {k: info[k] for k in ("file", "title", "credit", "license", "size_m", "bytes", "covers", "parts", "note") if k in info}
    print("registered", key, info["size_m"], "m")

# The lunar module's top half is the same NASA file as the whole lander; the tour and atlas hide the bottom half.
lm = models["apollo-lm"]
models["apollo-lm-ascent"] = {
    "file": lm["file"],
    "title": "Apollo Lunar Module ascent stage",
    "credit": lm["credit"],
    "page": lm.get("page"),
    "bytes": lm["bytes"],
    "covers": [],
    "license": lm["license"],
    "size_m": 4.3,
    "note": "The top half of NASA's Apollo Lunar Module model (the descent stage is hidden): about 4.3 m across.",
}

with open(path, "w", encoding="utf-8", newline="") as out:
    json.dump(models, out, indent=2, ensure_ascii=False)
    out.write("\n")
print(len(models), "models")
