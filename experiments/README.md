# Ghost Rover Atlas

NASA Space Apps 2026, challenge "Abandoned but not Forgotten". A kids' map of the machines NASA left on the Moon, on Mars and in deep space. Spin a globe, click a machine, and read its story. Each machine shows what happened to it, where it is, and a NASA 3D model.

Run it with any static server:

```bash
python -m http.server 8765
```

Then open http://localhost:8765.

- `data/`: one file per world, plus `locator.json` for the site map crops. Every entry links its source.
- `models/`: NASA 3D Resources models, converted to self-contained `.gltf.json` by `tools/glb2json.py`.
- `img/`: photos (credit and licence are stored with each entry) and `img/loc/` USGS/NASA map crops.
- `tools/`: the scripts that rebuilt the data.

Image credits are shown in the page. Moon map: NASA/GSFC/ASU LROC. Mars map: Solar System Scope, CC BY 4.0.
