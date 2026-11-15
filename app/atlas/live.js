// "Photos it took" gallery and "Right now" live numbers for the atlas dossier and the tour.
// Data: public/data/photos-by.json ({ id: [{ file, w, h, caption, credit, license, source }] })
//       public/data/live.json ({ id: { kind: 'probe' | 'rover' | 'reflector', ... } }), built from JPL Horizons and NASA feeds.
// Everything is computed in the browser from reference values; the only network calls are two optional NASA feeds
// (rover odometry and latest raw image), which fail quietly back to the stored values.
import { ICON } from './icons.js';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const httpUrl = u => /^https?:\/\//.test(u || '');
const link = (u, t) => httpUrl(u) ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(t)} ${ICON.external}</a>` : esc(t);

const AU = 149597870.7, C = 299792.458, DAY = 864e5;
const nf = d => new Intl.NumberFormat('en', { maximumFractionDigits: d, minimumFractionDigits: d });
const N0 = nf(0), N2 = nf(2);

let photosOnce, liveOnce;
const getJson = url => fetch(url).then(r => (r.ok ? r.json() : null)).catch(() => null);
/** Fetches photos-by.json once; resolves to { id: Photo[] } ({} if missing). */
export function loadPhotosBy() { return photosOnce ||= getJson('/data/photos-by.json').then(d => d || {}); }
/** Fetches live.json once; resolves to { id: LiveEntry } ({} if missing). */
export function loadLive() { return liveOnce ||= getJson('/data/live.json').then(d => d || {}); }
/** Photos taken by machine `id` (empty array if none). */
export async function photosFor(id) { return (await loadPhotosBy())[id] || []; }

// ---- calculations ---------------------------------------------------------------------------------------------
// Linear interpolation in a Horizons table (10-day rows); past either end, extend the nearest segment.
function sample(t, now) {
  const x = (now - Date.parse(t.start)) / (t.stepDays * DAY), last = t.rows.length - 1;
  const i = Math.max(0, Math.min(last - 1, Math.floor(x))), f = x - i;
  return Object.fromEntries(t.cols.map((c, k) => [c, t.rows[i][k] + (t.rows[i + 1][k] - t.rows[i][k]) * f]));
}

// Earth-Moon distance (km, centre to centre): the largest terms of Meeus, Astronomical Algorithms ch. 47. Good to about 200 km.
const MOON = [[0, 0, 1, -20905355], [2, 0, -1, -3699111], [2, 0, 0, -2955968], [0, 0, 2, -569925], [0, 1, 0, 48888],
  [2, 0, -2, 246158], [2, -1, -1, -152138], [2, 0, 1, -170733], [2, -1, 0, -204586], [0, 1, -1, -129620],
  [1, 0, 0, 108743], [0, 1, 1, 104755], [4, 0, -1, 30824]];
export function moonDistanceKm(now) {
  const T = (now / DAY + 2440587.5 - 2451545) / 36525, r = Math.PI / 180;
  const D = (297.8501921 + 445267.1114034 * T) * r, M = (357.5291092 + 35999.0502909 * T) * r, Mp = (134.9633964 + 477198.8675055 * T) * r;
  return 385000.56 + MOON.reduce((s, [d, m, mp, k]) => s + k * Math.cos(d * D + m * M + mp * Mp), 0) / 1000;
}

const dur = s => {
  const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, sec = Math.floor(s % 60);
  return h ? `${h} h ${m} min ${sec} s` : m ? `${m} min ${sec} s` : `${N2.format(s)} s`;
};
const since = (iso, now) => {
  const a = new Date(iso), b = new Date(now);
  let y = b.getUTCFullYear() - a.getUTCFullYear();
  const anniv = new Date(Date.UTC(a.getUTCFullYear() + y, a.getUTCMonth(), a.getUTCDate()));
  if (anniv > b) { y--; anniv.setUTCFullYear(anniv.getUTCFullYear() - 1); }
  const d = Math.floor((b - anniv) / DAY);
  return `${y} years, ${d} day${d === 1 ? '' : 's'}`;
};
const km = v => `${N0.format(v)} km`;
const CALC = 'calc', MEAS = 'measured';

/**
 * Current numbers for one live.json entry at time `now` (ms or Date).
 * Returns [{ key, label, value, note, kind: 'calc' | 'measured' }]; kind says whether the number is calculated
 * from reference values or was measured/reported by NASA.
 */
export function liveNumbers(entry, now = Date.now()) {
  if (!entry) return [];
  now = +now;
  const out = [], add = (key, label, value, note, kind = CALC) => out.push({ key, label, value, note, kind });
  const hz = entry.source?.name?.startsWith('JPL') ? 'From JPL Horizons predictions' : 'From reference values';

  if (entry.kind === 'probe' || entry.kind === 'rover') {
    const s = sample(entry.table, now), dE = s.earthAu * AU;
    add('earth', 'Distance from Earth', km(dE), hz);
    if (s.sunAu != null) add('sun', 'Distance from the Sun', km(s.sunAu * AU), `${hz} (${N2.format(s.sunAu)} au)`);
    add('light', 'Radio signal takes', dur(dE / C), 'One way, travelling at the speed of light');
    if (s.sunKms != null) add('speed', 'Speed away from the Sun', `${N2.format(s.sunKms)} km/s`, `About ${N0.format(s.sunKms * 3600)} km every hour (${hz.toLowerCase()})`);
  }
  if (entry.kind === 'probe') {
    add('age', 'Travelling for', since(entry.since, now), `Since launch on ${entry.since}`);
    const c = entry.countdown;
    if (c) add('countdown', c.label, N0.format(Math.max(0, Math.ceil((Date.parse(c.date) - now) / DAY))), c.note);
  }
  if (entry.kind === 'rover') {
    const { n, startUtc, solSeconds } = entry.sol, x = (now - Date.parse(startUtc)) / (solSeconds * 1000);
    const sol = n + Math.floor(x), t = (x - Math.floor(x)) * 86400;
    add('sol', 'Today is sol', N0.format(sol), 'Mars days since landing (sol 0), counted from the rover team’s clock');
    add('lmst', 'Time of day at the rover', [t / 3600, t / 60 % 60, t % 60].map(v => String(Math.floor(v)).padStart(2, '0')).join(':'), 'Local mean solar time on Mars');
    const o = entry.odometer;
    if (o) add('odo', `Driven so far (as of sol ${N0.format(o.sol)})`, `${N2.format(o.km)} km`, o.live ? 'By the rover team, fetched just now from NASA' : `By the rover team, as last published by NASA${o.asOf ? ` around ${o.asOf}` : ''}`, MEAS);
  }
  if (entry.kind === 'reflector') {
    const d = moonDistanceKm(now);
    add('earth', 'Distance from Earth', `about ${km(Math.round(d / 100) * 100)}`, 'From the Moon’s orbit (centre of Earth to centre of the Moon)');
    add('laser', 'Laser round trip', `about ${N2.format(2 * d / C)} s`, 'From a telescope on Earth to this mirror and back');
    add('age', 'Reflecting lasers for', since(entry.since, now), `Since it was set up on ${entry.since}`);
  }
  return out;
}

// ---- HTML -----------------------------------------------------------------------------------------------------
const uidOf = (() => { let i = 0; return () => `lv${++i}`; })();

/** Gallery of photos taken by the machine. Returns '' for an empty list. */
export function photosBlock(list) {
  const ok = (list || []).filter(p => p && p.file);
  if (!ok.length) return '';
  const id = uidOf();
  return `<section class="lv-photos" aria-labelledby="${id}">
    <h3 id="${id}">Photos it took</h3>
    <ul class="lv-strip" tabindex="0" aria-label="Photos taken by this machine. Scroll sideways for more.">${ok.map(p => {
      const w = Number(p.w) || 1600, h = Number(p.h) || 1200;
      return `<li style="--ar:${(w / h).toFixed(3)}"${w / h > 2.6 ? ' class="is-pano"' : ''}><figure>
        <img src="/${esc(String(p.file).replace(/^\//, ''))}" width="${w}" height="${h}" loading="lazy" decoding="async" alt="">
        <figcaption>${esc(p.caption)}<small>${esc(p.credit)} · ${esc(p.license || 'Public domain')}${httpUrl(p.source) ? ` · ${link(p.source, 'source')}` : ''}</small></figcaption>
      </figure></li>`;
    }).join('')}</ul>
    ${ok.length > 1 ? `<p class="lv-hint">${ok.length} photos · scroll sideways</p>` : ''}
  </section>`;
}

/** "Right now" block with labelled live numbers; fill and tick it with startLive(). Returns '' with no entry. */
export function liveBlock(entry) {
  const nums = liveNumbers(entry);
  if (!nums.length) return '';
  const id = uidOf(), srcs = [entry.source, entry.sol?.source, entry.odometer?.source].filter(s => s && httpUrl(s.url));
  return `<section class="lv-live" aria-labelledby="${id}">
    <div class="lv-head"><h3 id="${id}">Right now</h3><span class="lv-pulse"><i aria-hidden="true"></i>Updating live</span></div>
    <dl class="lv-nums">${nums.map(n => `<div class="lv-n is-${n.kind}">
      <dt>${esc(n.label)}</dt>
      <dd><span class="lv-v" data-live="${n.key}">${esc(n.value)}</span>
        <span class="lv-note"><b>${n.kind === MEAS ? 'Measured' : 'Calculated'}</b> <span data-live-note="${n.key}">${esc(n.note)}</span></span></dd>
    </div>`).join('')}</dl>
    ${entry.latestImage ? `<figure class="lv-latest" data-live-img hidden>
      <figcaption><b>Latest picture it sent home</b> <span data-live-img-cap></span></figcaption>
      <a data-live-img-link target="_blank" rel="noopener"><img alt="" decoding="async"></a>
    </figure>` : ''}
    <p class="lv-src">Sources: ${srcs.map(s => link(s.url, s.name)).join(' · ')}</p>
  </section>`;
}

/**
 * Ticks the numbers inside `rootEl` (which contains liveBlock(entry)) every second, and tries the NASA feeds once.
 * Returns a stop function.
 */
export function startLive(rootEl, entry) {
  if (!rootEl || !entry) return () => {};
  const e = { ...entry }, ctl = new AbortController();
  const tick = () => {
    for (const n of liveNumbers(e)) {
      const v = rootEl.querySelector(`[data-live="${n.key}"]`), note = rootEl.querySelector(`[data-live-note="${n.key}"]`);
      if (v && v.textContent !== n.value) v.textContent = n.value;
      if (note && note.textContent !== n.note) note.textContent = n.note;
      const dt = v?.closest('.lv-n')?.querySelector('dt');
      if (dt && dt.textContent !== n.label) dt.textContent = n.label;
    }
  };
  const feed = url => fetch(url, { signal: ctl.signal }).then(r => (r.ok ? r.json() : Promise.reject(r.status)));

  if (e.odometer?.liveUrl) feed(e.odometer.liveUrl).then(j => {
    const p = j?.features?.at(-1)?.properties;
    if (p && Number.isFinite(p.dist_km) && Number.isFinite(p.sol) && p.sol >= e.odometer.sol) { e.odometer = { ...e.odometer, km: p.dist_km, sol: p.sol, live: true }; tick(); }
  }).catch(() => { /* offline or blocked: keep the stored value */ });

  const fig = rootEl.querySelector('[data-live-img]');
  if (fig && e.latestImage?.url) feed(e.latestImage.url).then(j => {
    const im = j?.images?.[0], src = im?.image_files?.medium || im?.image_files?.large || im?.image_files?.small;
    if (!httpUrl(src)) return;
    const img = fig.querySelector('img'), a = fig.querySelector('a');
    img.onload = () => { fig.hidden = false; };
    img.alt = `Raw image from ${im.camera?.instrument?.replace(/_/g, ' ').toLowerCase() || 'a camera'}`;
    img.src = src;
    if (httpUrl(im.link)) a.href = im.link; else a.removeAttribute('href');
    const when = Date.parse(im.date_taken_utc + (/[zZ]|[+-]\d\d:?\d\d$/.test(im.date_taken_utc || '') ? '' : 'Z'));
    fig.querySelector('[data-live-img-cap]').textContent =
      `Sol ${im.sol}${Number.isFinite(when) ? `, ${new Date(when).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}` : ''}. Raw and unprocessed. ${im.credit || 'NASA/JPL-Caltech'}.`;
  }).catch(() => { /* feed unreachable: the figure stays hidden */ });

  tick();
  const timer = setInterval(tick, 1000);
  return () => { clearInterval(timer); ctl.abort(); };
}
