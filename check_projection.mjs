// node check_projection.mjs : checks the Gaia overlay math embedded in index.html
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const src = readFileSync(new URL('./index.html', import.meta.url), 'utf8').match(/\/\/ gaia-math[\s\S]*?\/\/ end gaia-math/)[0];
const { project, at } = new Function(`${src}\nreturn { project, at };`)();
const near = (a, b, tol = 0.02) => assert.ok(Math.abs(a - b) < tol, `${a} != ${b}`);

for (const d of [{ ra: 269.4463, dec: 4.7682, pixels: 29 }, { ra: 248.1675, dec: 66.755, pixels: 49 }]) {
  const c = d.pixels / 2;
  near(project(d.ra, d.dec, d)[0], c); near(project(d.ra, d.dec, d)[1], c);            // center -> center
  const [xn, yn] = project(d.ra, d.dec + 61.5 / 3600, d); near(xn, c); near(yn, c - 10); // 61.5" north -> 10 px up
  const [xe, ye] = project(d.ra + 61.5 / 3600 / Math.cos(d.dec * Math.PI / 180), d.dec, d);
  near(xe, c - 10); near(ye, c, 0.1);                                                    // 61.5" east -> 10 px left
}
// Barnard's Star, one year after Gaia epoch: moves 10.362" north
const [, dec] = at({ ra: 269.4485, dec: 4.7394, pmra: -801.551, pmde: 10362.394 }, 57388.5 + 365.25);
near((dec - 4.7394) * 3600, 10.362394, 1e-6);
// inspect-math: unproject() must invert project() (click -> RA/Dec), incl. near the pole and RA wrap
const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const inv = html.match(/\/\/ inspect-math[\s\S]*?\/\/ end inspect-math/)[0];
const { unproject } = new Function(`${src}\n${inv}\nreturn { unproject };`)();
for (const d of [{ ra: 269.4463, dec: 4.7682, pixels: 29 }, { ra: 248.1675, dec: 66.755, pixels: 49 }, { ra: 0.01, dec: -56.8, pixels: 99 }]) {
  for (const [x, y] of [[0, 0], [d.pixels, 3], [d.pixels / 2, d.pixels / 2], [7.3, d.pixels - 1]]) {
    const [ra, dec] = unproject(x, y, d), [x2, y2] = project(ra, dec, d);
    near(x2, x, 1e-6); near(y2, y, 1e-6);
  }
}
console.log('projection ok');
