# SPHEREx Blink

Explore how the infrared sky changes over time. Enter any sky position and SPHEREx Blink plays NASA SPHEREx images of that patch as a short loop, so moving objects (brown dwarfs, nearby stars, asteroids) and variable stars stand out.

Built for the NASA Space Apps Challenge 2026, challenge **Planet X and SPHEREx**.

## Features

- **Blink viewer**: one frame per six-month sky pass (stacked) or every exposure, with crossfade and speed control.
- **Colour mode**: three SPHEREx detectors mapped to red/green/blue (4.4–5.0 µm, 1.6–2.4 µm, 0.75–1.1 µm), so cool objects like brown dwarfs show up red.
- **16-year baseline**: optional WISE/NEOWISE frames from 2010–2024 before the SPHEREx passes.
- **Difference mode**: shows only what changed.
- **Gaia DR3 overlay**: known stars, moved to each frame's date by their proper motion.
- **Inspect**: tap a source to get its Gaia match, a SIMBAD link and a 0.75–5 µm SPHEREx spectrum.
- **Shareable views**: the target, field, band and mode are kept in the URL.

## Run it

```bash
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt   # macOS/Linux: .venv/bin/pip
.venv/Scripts/python server.py
```

Open http://localhost:8000. A target's first load takes 30–90 s while images are fetched. After that, results are cached in `.cache/`.

## How it works

| Step | Source |
|---|---|
| Find images covering a position | IRSA SIA v2 (`spherex_dr1`, `spherex_qr3`), cached on disk |
| Read only the pixels needed | HTTP Range reads from the public `nasa-irsa-spherex` S3 bucket (~100 KB per image instead of 65 MB) |
| Align | Reproject every exposure onto one north-up grid at 6.15″/px (`reproject`) |
| Stack | Median per sky pass, per band; zodiacal light model subtracted |
| Spectrum | Aperture photometry at the per-pixel wavelength from each image's spectral WCS |
| WISE baseline | NEOWISE/WISE single exposures from `nasa-irsa-wise` S3, median per visit (`wise.py`) |

To add a new SPHEREx data release, add its collection name to `COLLECTIONS` in `server.py`.

## API

- `GET /api/blink?target=<coords or name>&size=<arcsec>&band=D1..D6|RGB&mode=epoch|frame&wise=1`
- `GET /api/spectrum?ra=<deg>&dec=<deg>`

## Data credits

NASA/IPAC Infrared Science Archive (SPHEREx DR1 and QR3, WISE/NEOWISE) · ESA Gaia DR3 via the VizieR CfA mirror · Aladin Lite (CDS) · 2MASS and WISE HiPS hosted by IRSA.

## Also in this repo

`ghost-rover-atlas/` is a separate project for the "Abandoned but not Forgotten" challenge. See its own README.
