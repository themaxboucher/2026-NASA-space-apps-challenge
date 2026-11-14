// Ghost Rover Atlas engine: plain JS that drives the DOM rendered by Atlas.tsx.
// Needs the global THREE (r128) plus GLTFLoader/DRACOLoader, loaded by Atlas.tsx from /vendor/three.
/* eslint-disable */
export function startAtlas() {
  const D = Math.PI / 180, NOW = new Date('2026-11-14');
  const WORLDS = {
    moon:   { file: 'data/moon.json', tex: 'tex/moon.jpg', name: 'the Moon',
              intro: 'Twelve astronauts walked here between 1969 and 1972 and left their landers, cars and science stations behind. Robots came before and after them. Nothing on the Moon rusts or blows away, so it all still looks almost the way it did on its last day.' },
    mars:   { file: 'data/mars.json', tex: 'tex/mars.jpg', name: 'Mars',
              intro: 'Mars is a rover graveyard and a rover playground at the same time. Some machines here went quiet decades ago under red dust. Two are still driving today, and one is a helicopter that will never fly again.' },
    beyond: { file: 'data/deepspace.json', name: 'deep space',
              intro: 'Some machines never landed anywhere. They orbit dead worlds, rest on asteroids, plunged into giant planets on purpose, or are sailing out of the solar system forever.' },
  };
  const DATA = { moon: [], mars: [], beyond: [] };
  let world = 'moon', year = 2026, selected = null;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const yr = s => s ? +String(s).slice(0, 4) : null;
  const born = it => it.arrived || it.launched;
  const died = it => it.lastContact || it.ended;
  const COLOR = { alive: 'var(--signal)', echo: 'var(--echo)', silent: 'var(--quiet)', future: 'var(--quiet)' };

  function activeNow(it) {
    const s = it.status || '';
    return !died(it) && /\b(still|active|operational|working|transmitting)\b/i.test(s) && !/inactive|silent|dead|lost|ended/i.test(s);
  }
  // What a machine was doing in year Y.
  function stateAt(it, Y) {
    const a = yr(born(it));
    if (a && a > Y) return 'future';
    if (/reflector/i.test(it.type)) return 'echo';
    const end = yr(died(it));
    if (!end) return activeNow(it) ? 'alive' : 'silent';
    return end >= Y ? 'alive' : 'silent';
  }
  const shape = it => /rover|helicopter/i.test(it.type) ? 'rover' : /impact|crash|debris/i.test(it.type) ? 'impact' : '';

  /* ---------- globe ---------- */
  const cv = $('globe'), stage = cv.parentElement;
  const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(32, 1, 0.1, 400);
  cam.position.z = 4.2;
  const globe = new THREE.Group(); scene.add(globe);
  const mat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
  globe.add(new THREE.Mesh(new THREE.SphereGeometry(1, 128, 64), mat));
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const sun = new THREE.DirectionalLight(0xfff2dc, 0.85); sun.position.set(-4, 2, 3); scene.add(sun);
  { // starfield
    const n = 1400, p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const v = new THREE.Vector3().randomDirection ? new THREE.Vector3().randomDirection() : new THREE.Vector3(Math.random()-.5, Math.random()-.5, Math.random()-.5).normalize(); v.multiplyScalar(80 + Math.random() * 60).toArray(p, i * 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0x9fb0d0, size: 0.35 })));
  }
  const textures = {}, loader = new THREE.TextureLoader();
  function setTexture(w) {
    if (!textures[w]) { textures[w] = loader.load(WORLDS[w].tex); textures[w].encoding = THREE.sRGBEncoding; textures[w].anisotropy = 4; }
    mat.map = textures[w]; mat.needsUpdate = true;
  }
  // Lat/lon (east-positive) to a point on three.js's default sphere UV layout (u=0 at lon -180).
  function ll(lat, lon, r = 1) {
    const p = (lon + 180) * D, t = lat * D;
    return new THREE.Vector3(-Math.cos(p) * Math.cos(t) * r, Math.sin(t) * r, Math.sin(p) * Math.cos(t) * r);
  }
  let rotX = 0.3, rotY = 0, target = null, dragging = false, lastInteract = 0;
  function faceTo(lat, lon) {
    let ty = Math.PI / 2 - (lon + 180) * D;
    ty += Math.round((rotY - ty) / (2 * Math.PI)) * 2 * Math.PI; // shortest way round
    target = { x: lat * D, y: ty };
    if (reduceMotion) { rotX = target.x; rotY = target.y; target = null; }
  }
  cv.addEventListener('pointerdown', e => { dragging = { x: e.clientX, y: e.clientY }; target = null; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', e => {
    if (!dragging) return;
    rotY += (e.clientX - dragging.x) * 0.006; rotX += (e.clientY - dragging.y) * 0.006;
    rotX = Math.max(-1.3, Math.min(1.3, rotX)); dragging = { x: e.clientX, y: e.clientY }; lastInteract = performance.now();
  });
  addEventListener('pointerup', () => { dragging = false; lastInteract = performance.now(); });
  let zoom = 1; // 1 = whole globe fits the narrow side of the stage
  const fitCam = () => { cam.position.z = zoom * 4.2 / Math.min(1, cam.aspect); };
  cv.addEventListener('wheel', e => { e.preventDefault(); zoom = Math.max(0.4, Math.min(1.5, zoom * (1 + e.deltaY * 0.001))); fitCam(); }, { passive: false });

  let pins = [];
  function buildPins() {
    const box = $('pins'); box.innerHTML = '';
    pins = DATA[world].filter(it => Number.isFinite(it.lat) && Number.isFinite(it.lon)).map(it => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'pin ' + shape(it) + (TERRAIN[it.id] ? ' walk' : '');
      b.setAttribute('aria-label', it.name);
      b.innerHTML = `<span class="tip">${esc(it.name)}</span>`;
      b.onclick = () => select(it.id);
      box.appendChild(b);
      return { it, el: b, v: ll(it.lat, it.lon, 1.004) };
    });
    paint();
  }
  const tmp = new THREE.Vector3(), toCam = new THREE.Vector3();
  function placePins() {
    const w = stage.clientWidth, h = stage.clientHeight;
    for (const p of pins) {
      tmp.copy(p.v).applyMatrix4(globe.matrixWorld);
      toCam.copy(cam.position).sub(tmp).normalize();
      const facing = tmp.clone().normalize().dot(toCam) > 0.12;
      const hidden = !facing || p.state === 'future';
      p.el.classList.toggle('far', hidden); p.el.tabIndex = hidden ? -1 : 0;
      tmp.project(cam);
      p.el.style.transform = `translate(${(tmp.x + 1) / 2 * w}px,${(1 - tmp.y) / 2 * h}px)`;
    }
  }
  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); fitCam();
  }
  new ResizeObserver(resize).observe(stage);
  /* ---------- NASA 3D models, shown in the dossier ---------- */
  let MODELS = {};
  // Overrides checked before models.json "covers": null means "no honest model for this one".
  const MODEL_MATCH = [[/backshell|galileo_probe/i, null]];
  const MODEL_NOTE = {
    'apollo-lm': 'Only the bottom half, the descent stage, stayed on the Moon. The top half carried the astronauts back up.',
    'deep-impact': 'The impactor was the small copper-heavy part that split off. The bigger flyby spacecraft watched it hit.',
  };
  function modelKeyFor(it) {
    const s = `${it.id} ${it.name} ${it.mission}`;
    for (const [re, k] of MODEL_MATCH) if (re.test(s)) return MODELS[k] ? k : null;
    for (const [k, m] of Object.entries(MODELS)) if ((m.covers || []).some(c => s.toLowerCase().includes(String(c).toLowerCase()))) return k;
    return null;
  }
  // Model viewer zoom: wheel or the +/- buttons; 1 = whole model fits.
function mvCam() { mv.cam.position.set(0, 0.9 * mv.zoom, 3.6 * mv.zoom); mv.cam.lookAt(0, 0, 0); }
function mvZoom(f) { if (!mv.cam) return; mv.zoom = Math.max(0.3, Math.min(2.5, mv.zoom * f)); mvCam(); }
const mv = { r: null, scene: null, cam: null, obj: null, key: null, spin: 0, drag: null };
  const gltfLoader = THREE.GLTFLoader ? new THREE.GLTFLoader() : null, modelCache = {};
  // Most NASA models are Draco-compressed. Decoder ships with the page (the artifact sandbox blocks runtime CDN fetches); JS build avoids needing WASM.
  if (gltfLoader && THREE.DRACOLoader) gltfLoader.setDRACOLoader(new THREE.DRACOLoader().setDecoderPath('vendor/draco/').setDecoderConfig({ type: 'js' }));
  function mountModel(key) {
    const host = $('mv'); if (!host || !key || !gltfLoader) return;
    if (!mv.r) {
      mv.r = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      mv.r.outputEncoding = THREE.sRGBEncoding; mv.r.setPixelRatio(Math.min(devicePixelRatio, 2));
      mv.scene = new THREE.Scene(); mv.cam = new THREE.PerspectiveCamera(30, 1.6, 0.01, 100);
      mv.zoom = 1; mvCam();
    mv.r.domElement.addEventListener('wheel', e => { e.preventDefault(); mvZoom(1 + e.deltaY * 0.0015); }, { passive: false });
      mv.scene.add(new THREE.HemisphereLight(0xffffff, 0x2a3048, 1.2));
      const d = new THREE.DirectionalLight(0xfff2dc, 1.1); d.position.set(3, 4, 2); mv.scene.add(d);
      const c = mv.r.domElement;
      c.addEventListener('pointerdown', e => { mv.drag = e.clientX; c.setPointerCapture(e.pointerId); });
      c.addEventListener('pointermove', e => { if (mv.drag === null) return; mv.spin += (e.clientX - mv.drag) * 0.01; mv.drag = e.clientX; });
      c.addEventListener('pointerup', () => { mv.drag = null; });
    }
    host.appendChild(mv.r.domElement);
  mv.zoom = 1; mvCam();
  host.parentElement.querySelectorAll('[data-mvz]').forEach(b => { b.onclick = () => mvZoom(+b.dataset.mvz); });
    mv.r.setSize(host.clientWidth, host.clientHeight, false);
    mv.cam.aspect = host.clientWidth / host.clientHeight; mv.cam.updateProjectionMatrix();
    if (mv.obj) mv.scene.remove(mv.obj);
    mv.obj = null; mv.key = key;
    const show = o => { if (mv.key !== key) return; mv.obj = o; mv.scene.add(o); host.classList.add('ready'); };
    if (modelCache[key]) return show(modelCache[key]);
    gltfLoader.load(MODELS[key].file, g => {
      const o = g.scene, box = new THREE.Box3().setFromObject(o), size = box.getSize(new THREE.Vector3()).length() || 1;
      const s = 2.2 / size; o.scale.setScalar(s); o.position.copy(box.getCenter(new THREE.Vector3()).multiplyScalar(-s));
      const pivot = new THREE.Group(); pivot.add(o); modelCache[key] = pivot; show(pivot);
    }, undefined, () => host.classList.add('fail'));
  }

  function frame(t) {
    requestAnimationFrame(frame);
    if (mv.obj && $('mv')) {
      if (mv.drag === null && !reduceMotion) mv.spin += 0.005;
      mv.obj.rotation.y = mv.spin; mv.r.render(mv.scene, mv.cam);
    }
    if (G.open) return stepGround(t);
    if (world === 'beyond') return;
    if (target) {
      rotX += (target.x - rotX) * 0.08; rotY += (target.y - rotY) * 0.08;
      if (Math.abs(target.x - rotX) + Math.abs(target.y - rotY) < 1e-3) target = null;
    } else if (!dragging && !selected && !reduceMotion && t - lastInteract > 2500) rotY += 0.0012;
    globe.rotation.set(rotX, rotY, 0);
    globe.updateMatrixWorld();
    renderer.render(scene, cam);
    placePins();
  }
  requestAnimationFrame(frame);

  /* ---------- deep space map (log distance from the Sun) ---------- */
  const PLANETS = { // a (AU), mean longitude at J2000 (deg), deg/day. Circular-orbit approximation.
    mercury: [0.387, 252.25, 4.09233], venus: [0.723, 181.98, 1.60213], earth: [1, 100.46, 0.98561],
    mars: [1.524, 355.45, 0.52403], jupiter: [5.203, 34.40, 0.08309], saturn: [9.537, 49.94, 0.03346],
    uranus: [19.19, 313.23, 0.01173], neptune: [30.07, 304.88, 0.00598] };
  const daysJ2000 = (NOW - new Date('2000-01-01T12:00Z')) / 864e5;
  // Prefer a real (Horizons) longitude from any machine parked at that planet; else the circular-orbit estimate.
  const planetLon = k => { const hit = DATA.beyond.find(it => hostOf(it) === k && Number.isFinite(it.ecl_lon)); return hit ? hit.ecl_lon : (PLANETS[k][1] + PLANETS[k][2] * daysJ2000) % 360; };
  const R = au => 34 + 430 * Math.log10(Math.max(au, 0.3) / 0.3) / Math.log10(220 / 0.3);
  const xy = (au, lonDeg) => [R(au) * Math.cos(lonDeg * D), -R(au) * Math.sin(lonDeg * D)];
  function hostOf(it) { const b = String(it.body || '').toLowerCase(); return PLANETS[b] ? b : null; }
  function beyondPos(it, i) {
    if (Number.isFinite(it.distance_au) && Number.isFinite(it.ecl_lon)) return xy(it.distance_au, it.ecl_lon);
    const h = hostOf(it);
    if (h) return xy(PLANETS[h][0], planetLon(h) + (i % 3 - 1) * 7);
    if (Number.isFinite(it.distance_au)) return xy(it.distance_au, 200 + i * 37);
    return null;
  }
  // Animated zoom on the deep-space map: centre moves linearly, scale changes geometrically so it feels like flying in.
const FULL_VB = [-500, -500, 1000, 1000];
const bz = { vb: FULL_VB.slice(), raf: 0 };
function setVB(v) {
  bz.vb = v; const svg = $('beyond');
  svg.setAttribute('viewBox', v.map(n => n.toFixed(2)).join(' '));
  svg.style.setProperty('--z', (1000 / v[2]).toFixed(3)); svg.classList.toggle('zoomed', v[2] < 900);
}
function zoomBeyond(id) {
  const el = id && $('beyond').querySelector(`[data-id="${CSS.escape(id)}"] circle`);
  const to = el ? [+el.getAttribute('cx') - 120, +el.getAttribute('cy') - 120, 240, 240] : FULL_VB;
  const from = bz.vb.slice(), t0 = performance.now(), dur = reduceMotion ? 0 : 1200;
  const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const fc = [from[0] + from[2] / 2, from[1] + from[3] / 2], tc = [to[0] + to[2] / 2, to[1] + to[3] / 2];
  cancelAnimationFrame(bz.raf);
  const step = now => {
    const t = dur ? Math.min(1, (now - t0) / dur) : 1, k = ease(t), w = from[2] * Math.pow(to[2] / from[2], k);
    const cx = fc[0] + (tc[0] - fc[0]) * k, cy = fc[1] + (tc[1] - fc[1]) * k;
    setVB([cx - w / 2, cy - w / 2, w, w]);
    if (t < 1) bz.raf = requestAnimationFrame(step);
  };
  bz.raf = requestAnimationFrame(step);
}
function drawBeyond() {
    const s = $('beyond');
    let g = '<circle r="10" fill="#ffcf6b"/><text y="26" text-anchor="middle">Sun</text>';
    const cap = s => s[0].toUpperCase() + s.slice(1);
    // ponytail: greedy label placement (first come keeps its label); hidden labels reappear on hover/focus.
    const boxes = [], fits = b => b.x1 > -500 && b.x2 < 500 && !boxes.some(o => b.x1 < o.x2 && b.x2 > o.x1 && b.y1 < o.y2 && b.y2 > o.y1);
    for (const [k, [a]] of Object.entries(PLANETS)) {
      const [x, y] = xy(a, planetLon(k)), w = k.length * 9.6;
      boxes.push({ x1: x - 10 - w, x2: x - 6, y1: y - 12, y2: y + 6 }, { x1: x - 5, x2: x + 5, y1: y - 5, y2: y + 5 });
      g += `<circle class="orbit" r="${R(a).toFixed(1)}"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="var(--dim)"/><text x="${(x - 10).toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="end">${cap(k)}</text>`;
    }
    g += `<circle class="helio" r="${R(121.6).toFixed(1)}"/><text x="0" y="${(-R(121.6) - 8).toFixed(1)}" text-anchor="middle">Heliopause · edge of the Sun's bubble · ~120 AU</text>`;
    g += `<text x="-490" y="480">Distance from the Sun on a log scale · 1 AU = Earth–Sun distance</text>`;
    // Machines at the same place (4 at Venus, 3 at Jupiter) stack into a short column instead of overlapping.
    const spots = {};
    DATA.beyond.forEach((it, i) => {
      const p = beyondPos(it, i); if (!p) return;
      (spots[p.map(v => Math.round(v / 8)).join()] ||= { p, items: [] }).items.push(it);
    });
    const crafts = [];
    for (const { p, items } of Object.values(spots)) items.forEach((it, j) => crafts.push({ it, x: p[0], y: p[1] + (j - (items.length - 1) / 2) * 24 }));
    crafts.forEach(c => boxes.push({ x1: c.x - 9, x2: c.x + 9, y1: c.y - 9, y2: c.y + 9 }));
    // Still-talking machines claim label space first.
    crafts.sort((a, b) => (stateAt(b.it, 2026) === 'alive') - (stateAt(a.it, 2026) === 'alive'));
    for (const { it, x, y } of crafts) {
      const b = String(it.body || '').toLowerCase(), at = b && b !== 'heliocentric' && !PLANETS[b] ? ` · ${cap(b === 'tempel1' ? 'Tempel 1' : b)}` : '';
      const label = String(it.name).replace(/\s*\(.*?\)/g, '').replace(/ Space Telescope$/, '') + at, w = label.length * 11;
      const right = { x1: x + 12, x2: x + 14 + w, y1: y - 13, y2: y + 7 }, left = { x1: x - 14 - w, x2: x - 12, y1: y - 13, y2: y + 7 };
      const side = fits(right) ? 'r' : fits(left) ? 'l' : '';
      if (side) boxes.push(side === 'r' ? right : left);
      g += `<g class="craft${side ? '' : ' nolabel'}${TERRAIN[it.id] ? ' walk' : ''}" data-id="${esc(it.id)}" tabindex="0" role="button" aria-label="${esc(it.name)}"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="9" stroke="var(--void)" stroke-width="2"/><text x="${(side === 'l' ? x - 14 : x + 14).toFixed(1)}" y="${(y + 6).toFixed(1)}"${side === 'l' ? ' text-anchor="end"' : ''}>${esc(label)}</text></g>`;
    }
    cancelAnimationFrame(bz.raf); setVB(FULL_VB.slice());
  s.innerHTML = g;
  s.onclick = e => { if (!e.target.closest('.craft')) select(null); };
    s.querySelectorAll('.craft').forEach(el => {
      el.onclick = () => select(el.dataset.id);
      el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(el.dataset.id); } };
    });
    paint();
  }

  /* ---------- photos, fates, location renders ---------- */
  const FATES = { // display order for the "what happened" groups
    operational: 'Still working', passive: 'Still useful, needs no power', 'left-behind': 'Left behind on purpose',
    'switched-off': 'Switched off by NASA', power: 'Ran out of power', comms: 'Lost contact', stuck: 'Got stuck',
    damaged: 'Damaged', 'crash-accident': 'Crashed by accident', 'crash-planned': 'Crashed on purpose', lost: 'Fate unknown' };
  let LOC = { credits: {}, sites: {} };
  const RADIUS_KM = { moon: 1737.4, mars: 3389.5 };
  const safeFile = f => /^img\/[\w\-./]+\.(jpe?g|png|webp)$/i.test(f || '') && !String(f).includes('..');
  const httpUrl = u => /^https?:\/\//.test(u || '');
  const link = (u, t) => httpUrl(u) ? `<a href="${esc(u)}" target="_blank" rel="noopener">${t}</a>` : t;
  // "Eagle (Apollo 11 LM descent stage)" -> "Eagle's mission"; names ending in s get a bare apostrophe.
  const missionOf = name => { const n = String(name).replace(/\s*\(.*?\)/g, '').trim(); return `${n}${/s$/i.test(n) ? '’' : '’s'} mission`; };
  const LINKS = {};
const PANOS = {}; // id -> real ground panorama { file, hfov_deg, vtop_deg, vbottom_deg, left_azimuth_deg, caption, credit, license, source }
const ROUTES = {}; // id -> { segments: [{ name, points: [[lat, lon], ...] }], distance_km, credit, ... }
const routeSegs = it => (ROUTES[it.id]?.segments || []).map(sg => sg.points).filter(a => Array.isArray(a) && a.length > 1).concat(ROUTES[it.id] ? [] : (Array.isArray(it.path) && it.path.length > 1 ? [it.path] : []));
  const KIND = { official: 'Mission page', archive: 'Archive', images: 'Images', data: 'Data', video: 'Video', kids: 'For kids', live: 'Live' };
  function learnMore(l) {
    if (!l) return '';
    const hl = (l.highlights || []).filter(Boolean), ln = (l.links || []).filter(x => httpUrl(x?.url));
    if (!hl.length && !ln.length) return '';
    return `<h3>More about the mission</h3>${hl.length ? `<ul class="hl">${hl.map(h => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}
      ${ln.length ? `<ul class="links">${ln.map(x => `<li><a href="${esc(x.url)}" target="_blank" rel="noopener"><span class="lk">${esc(KIND[x.kind] || 'Link')}</span>${esc(x.title || x.url)} ↗</a></li>`).join('')}</ul>` : ''}`;
  }
  function photoFig(p) {
    if (!p || !safeFile(p.file)) return '';
    const bits = [p.credit && 'Image: ' + esc(p.credit), p.license && link(p.licenseUrl, esc(p.license)), httpUrl(p.source) && link(p.source, 'source ↗')].filter(Boolean);
    return `<figure class="photo"><img src="${esc(p.file)}" alt="${esc(p.caption || '')}" loading="lazy">
      <figcaption>${esc(p.caption || '')}<span class="credit">${bits.join(' · ')}</span></figcaption></figure>`;
  }
  function fateBlock(f) {
    if (!f) return '';
    return `<h3>What happened</h3><div class="fate"><span class="fatecat">${esc(FATES[f.category] || f.category)}</span>
      <p class="fatelabel">${esc(f.label)}</p><p>${esc(f.summary)}</p></div>`;
  }
  // One map crop (equirectangular bbox) with the machine, its neighbours, rover trail and a km scale bar drawn on top.
  function locView(it, kind) {
    const v = LOC.sites[it.id]?.[kind];
    if (!v || !safeFile(v.file) || !Array.isArray(v.bbox) || v.bbox.length !== 4) return '';
    const [x0, y0, x1, y1] = v.bbox.map(Number), W = +v.w || 800, H = +v.h || 530;
    const px = (lat, lon) => [(lon - x0) / (x1 - x0) * W, (y1 - lat) / (y1 - y0) * H];
    const inView = ([a, b]) => a >= 0 && a <= W && b >= 0 && b <= H;
    let g = '';
    if (kind === 'wide') { const c = LOC.sites[it.id]?.close?.bbox; if (Array.isArray(c)) { const [a, b] = px(c[3], c[0]), [d, e] = px(c[1], c[2]); g += `<rect class="zoombox" x="${a.toFixed(1)}" y="${b.toFixed(1)}" width="${Math.max(4, d - a).toFixed(1)}" height="${Math.max(4, e - b).toFixed(1)}"/>`; } }
    const [mx, my] = px(it.lat, it.lon);
    for (const o of DATA[world]) {
      if (o.id === it.id || !Number.isFinite(o.lat)) continue;
      const q = px(o.lat, o.lon);
      if (inView(q) && Math.hypot(q[0] - mx, q[1] - my) > 12) g += `<circle class="other" cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="6"><title>${esc(o.name)}</title></circle>`;
    }
    for (const seg of routeSegs(it)) g += `<polyline class="trail" points="${seg.map(p => px(p[0], p[1]).map(n => n.toFixed(1)).join(',')).join(' ')}"/>`;
    g += `<circle class="you" cx="${mx.toFixed(1)}" cy="${my.toFixed(1)}" r="13"/><circle class="youdot" cx="${mx.toFixed(1)}" cy="${my.toFixed(1)}" r="4.5"/>`;
    // Scale bar measured along the site's latitude, rounded to 1/2/5 x 10^n km.
    const kmPerPx = (x1 - x0) * D * RADIUS_KM[world] * Math.max(Math.cos(it.lat * D), 0.02) / W;
    const want = W * 0.22 * kmPerPx, p10 = 10 ** Math.floor(Math.log10(want));
    const km = [5, 2, 1].map(m => m * p10).find(n => n <= want) || p10, bar = km / kmPerPx;
    g += `<g class="scale"><rect x="20" y="${H - 28}" width="${bar.toFixed(1)}" height="7" rx="2"/><text x="20" y="${H - 38}">${km >= 1 ? km : km.toFixed(1)} km</text></g>`;
    const cr = LOC.credits?.[v.credit] || LOC.credits?.[`${world}-${kind}`] || {};
    const relief = /fallback/.test(v.credit || '') ? ' (sunlight never reaches here, so this is a height map: blue is low, red is high)' : '';
    return `<figure class="loc"><div class="locimg" style="aspect-ratio:${W}/${H}"><img src="${esc(v.file)}" alt="${kind === 'wide' ? 'Regional' : 'Close-up'} map around ${esc(it.name)}" loading="lazy">
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${g}</svg></div>
      <figcaption>${kind === 'wide' ? 'The region (dashed box = close-up)' : 'Close-up'}${routeSegs(it).length && kind === 'close' ? `, dashed line = its ${/helicopter/i.test(it.type) ? 'flights' : 'drives'}` : ''}${ROUTES[it.id]?.credit && kind === 'close' ? ` (route: ${esc(ROUTES[it.id].credit)})` : ''}${relief}<span class="credit">${esc(cr.credit || '')}${cr.license ? ' · ' + esc(cr.license) : ''}</span></figcaption></figure>`;
  }
  function locatorBlock(it) {
    if (!Number.isFinite(it.lat) || world === 'beyond') return '';
    const views = locView(it, 'close') + locView(it, 'wide');
    return views ? `<h3>Where it is on ${esc(WORLDS[world].name)}</h3><div class="locs">${views}</div>` : '';
  }

  /* ---------- dossier, timeline, roster ---------- */
  const fmt = s => s ? String(s).slice(0, 10) : '—';
  const yearsSince = s => ((NOW - new Date(String(s).slice(0, 10))) / 3.15576e10);
  function dossier(it) {
    const st = stateAt(it, 2026), end = died(it);
    const rows = [
      [it.arrived ? 'Arrived' : 'Launched', fmt(born(it))],
      ['Last heard from', st === 'alive' ? 'Today' : fmt(end)],
    ];
    if (end && st !== 'alive') rows.push([st === 'echo' ? 'Working unpowered for' : 'Silent for', `${Math.floor(yearsSince(end))} years`]);
    if (Number.isFinite(it.lat)) rows.push(['Where', `${Math.abs(it.lat).toFixed(2)}°${it.lat >= 0 ? 'N' : 'S'} ${Math.abs(it.lon).toFixed(2)}°${it.lon >= 0 ? 'E' : 'W'}`]);
    if (Number.isFinite(it.distance_au)) rows.push(['From the Sun', `${it.distance_au.toFixed(1)} AU`]);
    if (Number.isFinite(it.lightTime_hours)) rows.push(['Radio hello takes', `${it.lightTime_hours.toFixed(1)} h one way`]);
    if (Number.isFinite(it.distance_km) && it.distance_km > 0) rows.push(['Drove', `${it.distance_km} km (${(it.distance_km / 42.195).toFixed(2)} marathons)`]);
    if (Number.isFinite(it.mass_kg)) rows.push(['Mass', `${it.mass_kg.toLocaleString()} kg`]);
    const src = /^https?:\/\//.test(it.source || '') ? `<a class="src" href="${esc(it.source)}" target="_blank" rel="noopener">Source ↗</a>` : '';
    const mk = modelKeyFor(it), m = mk && MODELS[mk];
    const model = m ? `<figure class="model"><div class="mv" id="mv" role="img" aria-label="3D model of ${esc(m.title)}"></div>
    <div class="mvz"><button type="button" data-mvz="0.8" aria-label="Zoom in">+</button><button type="button" data-mvz="1.25" aria-label="Zoom out">−</button></div>
      ${MODEL_NOTE[mk] ? `<figcaption>${esc(MODEL_NOTE[mk])}</figcaption>` : ''}
      <figcaption>NASA 3D model: ${esc(m.title)} · drag to turn, scroll or +/− to zoom${/^https?:\/\//.test(m.page || '') ? ` · <a href="${esc(m.page)}" target="_blank" rel="noopener" style="color:var(--echo)">model page ↗</a>` : ''}</figcaption></figure>` : '';
    return `<p class="eyebrow">${esc(it.mission)} · ${esc(it.type)}</p>
      <h2>${esc(it.name)}</h2>
      <span class="pill" style="--c:${COLOR[st]}">${esc(it.status)}</span>
      ${TERRAIN[it.id] ? `<br><button type="button" class="walkbtn" data-walk="${esc(it.id)}">Walk around this site →</button>` : ''}
      ${photoFig(it.photo)}
      ${it.summary ? `<p class="summary">${esc(it.summary)}</p>` : ''}
      ${fateBlock(it.fate)}
      ${locatorBlock(it)}
      ${it.orbit ? `<h3>Seen from orbit today</h3>${photoFig(it.orbit)}` : ''}
      <dl class="facts">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
      ${model ? `<h3>Turn it around</h3>${model}` : ''}
      ${it.story ? `<blockquote class="voice">${esc(it.story)}</blockquote>` : ''}
      ${it.lastWords && !it.fate ? `<h3>Its last day</h3><p>${esc(it.lastWords)}</p>` : ''}
      <h3>${esc(missionOf(it.name))}</h3><p>${esc(it.why)}</p>
      <h3>What it found</h3><p>${esc(it.science)}</p>
      ${it.funFact ? `<p class="fun"><strong>Fun fact</strong>${esc(it.funFact)}</p>` : ''}
      ${learnMore(LINKS[it.id])}
      ${src}`;
  }
  function intro() {
    const list = DATA[world], alive = list.filter(it => stateAt(it, 2026) === 'alive').length;
    const echo = list.filter(it => stateAt(it, 2026) === 'echo').length;
    return `<div class="intro"><p class="eyebrow">Welcome to ${esc(WORLDS[world].name)}</p>
      <p class="big">${list.length}</p><p>machines on this map. ${alive} still send data home${echo ? `, and ${echo} silent mirrors still get used by scientists every week` : ''}.</p>
      <p>${esc(WORLDS[world].intro)}</p><p>Click a dot, or pick a name from the list below.</p></div>`;
  }
  function paint() {
    for (const p of pins) {
      p.state = stateAt(p.it, year);
      p.el.style.setProperty('--c', COLOR[p.state]);
      p.el.classList.toggle('sel', p.it.id === selected);
    }
    if (world === 'beyond') DATA.beyond.forEach(it => {
      const el = $('beyond').querySelector(`[data-id="${CSS.escape(it.id)}"]`); if (!el) return;
      const st = stateAt(it, year);
      el.style.display = st === 'future' ? 'none' : '';
      el.querySelector('circle').setAttribute('fill', COLOR[st]);
      el.classList.toggle('sel', it.id === selected);
    });
    document.querySelectorAll('.life b').forEach(b => {
      const st = stateAt(byId(b.dataset.id), year);
      b.style.setProperty('--c', COLOR[st === 'future' ? 'silent' : st]);
      b.classList.toggle('future', st === 'future'); b.classList.toggle('sel', b.dataset.id === selected);
    });
    document.querySelectorAll('#list button').forEach(b => {
      b.style.setProperty('--c', COLOR[stateAt(byId(b.dataset.id), year)]);
      b.setAttribute('aria-pressed', b.dataset.id === selected);
    });
    $('yearOut').value = year;
    const list = DATA[world], here = list.filter(it => stateAt(it, year) !== 'future');
    const talking = here.filter(it => stateAt(it, year) === 'alive').length;
    $('yearNote').textContent = here.length
      ? `In ${year}: ${here.length} machine${here.length === 1 ? '' : 's'} had reached ${WORLDS[world].name}, ${talking} still talking.`
      : `In ${year}: nothing from NASA had reached ${WORLDS[world].name} yet.`;
    $('cursor').style.left = `calc(${(year - 1959) / (2026 - 1959) * 100}% - 1px)`;
  }
  const byId = id => DATA[world].find(it => it.id === id);
  function buildTimeline() {
    const box = $('lives'); box.querySelectorAll('.life').forEach(n => n.remove());
    const pct = d => ((yr(d) - 1959 + (+String(d).slice(5, 7) || 6) / 12) / (2026 - 1959 + 1) * 100);
    [...DATA[world]].filter(born).sort((a, b) => String(born(a)).localeCompare(String(born(b)))).forEach(it => {
      const row = document.createElement('div'); row.className = 'life';
      const a = pct(born(it)), e = activeNow(it) || /reflector/i.test(it.type) ? 100 : died(it) ? pct(died(it)) : a;
      row.innerHTML = `<b data-id="${esc(it.id)}" title="${esc(it.name)}: ${esc(fmt(born(it)))} to ${esc(activeNow(it) ? 'today' : fmt(died(it)))}" style="left:${a}%;width:${Math.max(0, e - a)}%"></b>`;
      row.firstChild.onclick = () => select(it.id);
      box.appendChild(row);
    });
    buildRoster();
  }
  // Moon/Mars machines are grouped by what happened to them; deep space stays a flat list.
  function buildRoster() {
    const ul = $('list'), list = DATA[world], grouped = list.some(it => it.fate);
    ul.innerHTML = ''; ul.className = grouped ? 'groups' : '';
    const go = id => { select(id); $('dossier').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' }); };
    $('rosterTitle').textContent = grouped ? `What happened to every machine on ${WORLDS[world].name}` : `Every machine on ${WORLDS[world].name}`;
    if (!grouped) {
      list.forEach(it => { const li = document.createElement('li'); li.innerHTML = `<button type="button" data-id="${esc(it.id)}">${esc(it.name)}</button>`; ul.appendChild(li); });
    } else {
      const groups = {};
      list.forEach(it => (groups[it.fate?.category || 'lost'] ||= []).push(it));
      const keys = [...Object.keys(FATES).filter(k => groups[k]), ...Object.keys(groups).filter(k => !FATES[k])];
      const most = Math.max(...keys.map(k => groups[k].length));
      for (const k of keys) {
        const li = document.createElement('li');
        li.innerHTML = `<div class="ghead"><b>${esc(FATES[k] || k)}</b><span class="gn">${groups[k].length}</span><i class="gbar" style="width:${(groups[k].length / most * 100).toFixed(0)}%"></i></div>
          <div class="grows">${groups[k].map(it => `<button type="button" class="grow" data-id="${esc(it.id)}"><span class="gname">${esc(it.name)}</span><span class="glabel">${esc(it.fate?.label || it.status)}</span></button>`).join('')}</div>`;
        ul.appendChild(li);
      }
    }
    ul.querySelectorAll('button').forEach(b => b.onclick = () => go(b.dataset.id));
  }
  function select(id) {
    const it = byId(id);
    selected = it ? id : null;
    $('dossier').innerHTML = it ? dossier(it) : intro();
    $('dossier').scrollTop = 0;
    $('dossier').querySelector('[data-walk]')?.addEventListener('click', e => openGround(e.currentTarget.dataset.walk));
    if (it) mountModel(modelKeyFor(it)); else mv.key = null;
    if (it && Number.isFinite(it.lat) && world !== 'beyond') faceTo(it.lat, it.lon);
  if (world === 'beyond') zoomBeyond(it ? id : null);
    if (it && location.hash.slice(1) !== id) history.replaceState(null, '', '#' + id);
    paint();
  }
  function setWorld(w, keepSel) {
    if (G.open) closeGround();
    world = w;
    document.querySelectorAll('.worlds button').forEach(b => b.setAttribute('aria-selected', b.dataset.world === w));
    const deep = w === 'beyond';
    cv.hidden = deep; $('pins').hidden = deep; $('beyond').toggleAttribute('hidden', !deep); // SVG has no .hidden property
    $('hint').textContent = deep ? 'Directions and distances are approximate' : 'Drag to spin · scroll to zoom';
    buildTimeline();
    if (deep) { pins = []; drawBeyond(); } else { setTexture(w); buildPins(); }
    if (!keepSel) { select(null); history.replaceState(null, '', '#' + w); }
  }
  document.querySelectorAll('.worlds button').forEach(b => b.onclick = () => setWorld(b.dataset.world));
  // Hero and footer links: switch world even if the hash already matches, then bring the map into view.
  document.querySelectorAll('[data-go]').forEach(a => a.onclick = e => {
    e.preventDefault(); setWorld(a.dataset.go);
    document.querySelector('.bar').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  });
  $('year').oninput = e => { year = +e.target.value; stopPlay(); paint(); };
  let timer = null;
  function stopPlay() { clearInterval(timer); timer = null; $('play').textContent = '▶ Play history'; }
  $('play').onclick = () => {
    if (timer) return stopPlay();
    if (year >= 2026) year = 1959;
    $('play').textContent = '❚❚ Pause';
    timer = setInterval(() => { year++; $('year').value = year; paint(); if (year >= 2026) stopPlay(); }, reduceMotion ? 600 : 260);
  };

  /* ---------- street-level explorer (drag the person onto a site) ---------- */
  // Terrain tiles: terrain/<world>/<site>/{height.png (Terrarium RGB), color.jpg, meta.json}; north = -Z, east = +X, metres.
  const TERRAIN = {};
  const GRAVITY = { moon: 1.62, mars: 3.71, beyond: 0.006, mercury: 3.7, venus: 8.87, eros: 0.0059, tempel1: 0.0004, dimorphos: 0.00005 }; // m/s²
  const REAL_SIZE = { 'apollo-lm': 7, mer: 2.3, curiosity: 3.2, perseverance: 3.2, ingenuity: 1.2, insight: 6, viking: 3, ladee: 2.4, near: 4, messenger: 4, 'deep-impact': 3 };
  const EYE = 1.7;
  const G = { open: false, r: null, scene: null, cam: null, mesh: null, h: null, n: 0, ext: [1, 1], exag: 1, meta: null, fly: false,
    yaw: 0, pitch: -0.08, x: 0, z: 0, jump: 0, vy: 0, keys: {}, goal: null, target: [0, 0], orbit: { yaw: 0.6, pitch: 0.55, dist: 600 }, last: 0, drag: null, extras: [] };
  const validTile = p => /^(moon|mars|beyond)\/[\w-]+$/.test(p || '');

  function hAt(x, z) { // bilinear height (m, exaggerated) at east x / south z from the centre
  if (G.R && (Math.abs(x) > G.ext[0] / 2 || Math.abs(z) > G.ext[1] / 2)) return (G.surroundY || 0) - (x * x + z * z) / (2 * G.R); // curved ground beyond the tile
    const n = G.n, u = Math.max(0, Math.min(n - 1.001, (x / G.ext[0] + 0.5) * (n - 1))), v = Math.max(0, Math.min(n - 1.001, (z / G.ext[1] + 0.5) * (n - 1)));
    const c = u | 0, r = v | 0, fx = u - c, fy = v - r, i = r * n + c, H = G.h;
    return ((H[i] * (1 - fx) + H[i + 1] * fx) * (1 - fy) + (H[i + n] * (1 - fx) + H[i + n + 1] * fx) * fy) * G.exag;
  }
  // Real orbital imagery beyond the sharp tile, streamed from NASA Trek (equirectangular WMTS: 2^(z+1) x 2^z tiles of 256 px,
// top-left -180/90). Each ring is one stitched canvas on a curved plane, so the planet falls away to a real horizon.
const TREK = {
  mars: { layer: 'Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m', zmax: 7, R: 3389500, tint: 0xffb68a, credit: 'NASA/USGS Viking MDIM 2.1 colour mosaic via NASA Mars Trek' },
  moon: { layer: 'Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02', zmax: 8, R: 1737400, tint: 0xffffff, credit: 'NASA/GSFC/ASU LRO WAC mosaic via NASA Moon Trek' },
};
async function surroundRing(T, lat0, lon0, halfM, z, yOff, order) {
  const kx = T.R * Math.cos(lat0 * D) * D, ky = T.R * D, tdeg = 180 / 2 ** z, cols = 2 ** (z + 1), rows = 2 ** z;
  const dLat = halfM / ky, dLon = Math.min(179, halfM / Math.max(kx, 1));
  const x0 = Math.floor((lon0 - dLon + 180) / tdeg), x1 = Math.floor((lon0 + dLon + 180) / tdeg);
  const y0 = Math.max(0, Math.floor((90 - (lat0 + dLat)) / tdeg)), y1 = Math.min(rows - 1, Math.floor((90 - (lat0 - dLat)) / tdeg));
  const nx = x1 - x0 + 1, ny = y1 - y0 + 1;
  if (nx * ny > 36) return null; // near the poles longitude explodes: skip rather than download half the planet
  const cnv = document.createElement('canvas'); cnv.width = nx * 256; cnv.height = ny * 256;
  const ctx = cnv.getContext('2d'); ctx.fillStyle = '#1a120d'; ctx.fillRect(0, 0, cnv.width, cnv.height);
  const jobs = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) jobs.push((async () => {
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.src = `https://trek.nasa.gov/tiles/${T.layer}/1.0.0/default/default028mm/${z}/${y}/${((x % cols) + cols) % cols}.jpg`;
    try { await img.decode(); ctx.drawImage(img, (x - x0) * 256, (y - y0) * 256); } catch {}
  })());
  await Promise.all(jobs);
  const west = x0 * tdeg - 180, east = (x1 + 1) * tdeg - 180, north = 90 - y0 * tdeg, south = 90 - (y1 + 1) * tdeg;
  const geo = new THREE.PlaneGeometry((east - west) * kx, (north - south) * ky, 128, 128);
  geo.rotateX(-Math.PI / 2); geo.translate(((west + east) / 2 - lon0) * kx, 0, -((north + south) / 2 - lat0) * ky);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) { const X = pos.getX(i), Z = pos.getZ(i); pos.setY(i, yOff - (X * X + Z * Z) / (2 * T.R)); }
  geo.computeVertexNormals();
  const tex = new THREE.CanvasTexture(cnv); tex.encoding = THREE.sRGBEncoding; tex.anisotropy = 8;
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0, color: T.tint, polygonOffset: true, polygonOffsetFactor: order, polygonOffsetUnits: order }));
  m.renderOrder = -order; return m;
}
async function addSurround(meta) {
  const T = TREK[meta.world], c = meta.center;
  if (!T || !Array.isArray(c)) return;
  // Sit the surround just under the tile's edge so the sharp tile always wins.
  G.surroundY = (G.edgeY || 0) - 0.4; G.R = T.R; G.surroundHalf = meta.world === 'mars' ? 60000 : 30000;
  const scene = G.scene;
  for (const [half, z, order] of [[G.surroundHalf, T.zmax, 2], [G.surroundHalf * 3.5, T.zmax - 2, 4]]) {
    const ring = await surroundRing(T, +c[0], +c[1], half, z, G.surroundY - (order - 2) * 3, order);
    if (!ring || G.scene !== scene) return;
    scene.add(ring);
  }
  $('gCredit').querySelector('details')?.insertAdjacentHTML('beforeend', `<br>Surrounding area: ${esc(T.credit)} (public domain)`);
}
const flyMax = () => G.surroundHalf ? 15000 : Math.max(...G.ext) * 0.6;
function groundGeometry() {
    const n = G.n, seg = Math.min(255, n - 1), step = (n - 1) / seg;
    const geo = new THREE.PlaneGeometry(G.ext[0], G.ext[1], seg, seg), pos = geo.attributes.position;
    for (let r = 0; r <= seg; r++) for (let c = 0; c <= seg; c++) pos.setZ(r * (seg + 1) + c, G.h[Math.round(r * step) * n + Math.round(c * step)] * G.exag);
    geo.rotateX(-Math.PI / 2); geo.computeVertexNormals();
    return geo;
  }
  function labelSprite(text, color) {
    const c = document.createElement('canvas'), x = c.getContext('2d'), f = '600 28px "IBM Plex Mono", monospace';
    x.font = f; const w = Math.ceil(x.measureText(text).width) + 28; c.width = w; c.height = 46;
    x.font = f; x.fillStyle = 'rgba(9,4,3,.82)'; x.fillRect(0, 0, w, 46); x.fillStyle = color; x.fillRect(0, 0, 6, 46);
    x.fillStyle = '#efe5da'; x.textBaseline = 'middle'; x.fillText(text, 16, 24);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), sizeAttenuation: false, depthTest: false }));
    s.scale.set(0.045 * w / 46, 0.045, 1); s.renderOrder = 9; return s;
  }
  function placeMachines() {
    const span = Math.max(...G.ext);
    for (const p of G.meta.places || []) {
      const it = byId(p.id); if (!it || !Number.isFinite(+p.x_m) || !Number.isFinite(+p.y_m)) continue;
      const x = +p.x_m, z = -p.y_m, y = hAt(x, z), col = getComputedStyle(document.documentElement).getPropertyValue(stateAt(it, 2026) === 'alive' ? '--signal' : stateAt(it, 2026) === 'echo' ? '--echo' : '--quiet').trim() || '#c1a995';
      const g = new THREE.Group(); g.position.set(x, y, z); G.scene.add(g); G.extras.push(g);
      const beamH = Math.max(25, span * 0.02);
      // 1-px marker line: findable from far away, never blocks the view up close
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, beamH, 0)]), new THREE.LineBasicMaterial({ color: col })));
      const lab = labelSprite(String(it.name).replace(/\s*\(.*?\)/g, ''), col); lab.position.y = beamH * 1.05; g.add(lab);
      const key = modelKeyFor(it), crashed = /impact|crash/i.test(it.type) || /crash|smash|plunge|impact/i.test(it.status || ''); // wrecks get a crater ring, not an intact model
      if (key && gltfLoader && !crashed) gltfLoader.load(MODELS[key].file, m => {
        const o = m.scene, box = new THREE.Box3().setFromObject(o), size = box.getSize(new THREE.Vector3()).length() || 1;
        o.scale.setScalar((REAL_SIZE[key] || 3) / size);
        const b2 = new THREE.Box3().setFromObject(o); o.position.y -= b2.min.y; o.position.x -= (b2.min.x + b2.max.x) / 2; o.position.z -= (b2.min.z + b2.max.z) / 2;
        g.add(o);
      });
      else if (crashed) {
        const ring = new THREE.Mesh(new THREE.RingGeometry(8, 10, 48), new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide, transparent: true, opacity: 0.8 }));
        ring.rotation.x = -Math.PI / 2; ring.position.y = 0.4; g.add(ring);
      } else {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.8, 2, 16), new THREE.MeshStandardMaterial({ color: col })); cone.position.y = 1; g.add(cone);
      }
    }
  }
  // Routes of every machine in this world, projected into the tile (east = +x, north = -z) and draped over the terrain.
function drapeRoutes() {
  (G.routeObjs || []).forEach(o => { G.scene?.remove(o); o.geometry.dispose(); o.material.dispose(); });
  G.routeObjs = [];
  const Rm = (RADIUS_KM[G.meta.world] || 0) * 1000, c = G.meta.center;
  if (!Rm || !Array.isArray(c) || !G.scene) return;
  const [lat0, lon0] = c.map(Number), kx = Rm * Math.cos(lat0 * D) * D, ky = Rm * D, hw = G.ext[0] / 2, hh = G.ext[1] / 2, step = Math.max(G.ext[0], G.ext[1]) / 400;
  const col = getComputedStyle(document.documentElement).getPropertyValue('--signal').trim() || '#d9814a';
  for (const it of DATA[G.meta.world] || []) for (const seg of routeSegs(it)) {
    let run = [];
    const flush = () => { if (run.length > 1) { const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(run), new THREE.LineBasicMaterial({ color: col })); G.scene.add(l); G.routeObjs.push(l); } run = []; };
    let prev = null;
    for (const [la, lo] of seg) {
      const x = (lo - lon0) * kx, z = -(la - lat0) * ky, inside = Math.abs(x) < hw && Math.abs(z) < hh;
      if (!inside) { flush(); prev = null; continue; }
      if (prev) { const n = Math.ceil(Math.hypot(x - prev[0], z - prev[1]) / step); for (let i = 1; i < n; i++) { const t = i / n, xi = prev[0] + (x - prev[0]) * t, zi = prev[1] + (z - prev[1]) * t; run.push(new THREE.Vector3(xi, hAt(xi, zi) + 0.6, zi)); } }
      run.push(new THREE.Vector3(x, hAt(x, z) + 0.6, z)); prev = [x, z];
    }
    flush();
  }
}
function resizeGround() {
    if (!G.r) return;
    const w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return;
    G.r.setSize(w, h, false); G.cam.aspect = w / h; G.cam.updateProjectionMatrix();
  }
  new ResizeObserver(resizeGround).observe(stage);

  async function openGround(id) {
    const path = TERRAIN[id], it = byId(id);
    if (!validTile(path) || !it) return;
    $('ground').hidden = false; $('gLoad').hidden = false; $('gLoad').textContent = 'Landing…';
    $('gTitle').textContent = ''; $('gWorld').textContent = WORLDS[world].name; G.open = true;
    try {
      const base = `terrain/${path}/`;
      const meta = await fetch(base + 'meta.json').then(r => { if (!r.ok) throw new Error('meta'); return r.json(); });
      const img = new Image(); img.src = base + 'height.png'; await img.decode();
      const cnv = document.createElement('canvas'); cnv.width = img.width; cnv.height = img.height;
      const ctx = cnv.getContext('2d'); ctx.drawImage(img, 0, 0);
      const px = ctx.getImageData(0, 0, img.width, img.height).data, n = Math.min(img.width, img.height), H = new Float32Array(n * n);
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) { const k = (r * img.width + c) * 4; H[r * n + c] = px[k] * 256 + px[k + 1] + px[k + 2] / 256 - 32768; }
      if (!G.open) return;
      closeGroundScene();
      if (TREK[meta.world]) { // blend the tile's border into the flat surround so it doesn't stand up like an island
      let sum = 0; for (let i = 0; i < n; i++) sum += H[i] + H[(n - 1) * n + i] + H[i * n] + H[i * n + n - 1];
      const edgeY = sum / (4 * n), band = (n - 1) * 0.06;
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) { const e = Math.min(r, c, n - 1 - r, n - 1 - c) / band; if (e < 1) { const t = e * e * (3 - 2 * e); H[r * n + c] = edgeY + (H[r * n + c] - edgeY) * t; } }
      G.edgeY = edgeY;
    }
    Object.assign(G, { R: 0, surroundY: 0, surroundHalf: 0, meta, h: H, n, ext: (meta.extent_m || [1000, 1000]).map(Number), exag: 1, fly: false, goal: null, jump: 0, vy: 0, extras: [] });
      if (!G.r) {
        G.r = new THREE.WebGLRenderer({ canvas: $('groundCv'), antialias: true, logarithmicDepthBuffer: true });
        G.r.outputEncoding = THREE.sRGBEncoding; G.r.setPixelRatio(Math.min(devicePixelRatio, 2));
        bindGroundControls();
      }
      const span = Math.max(...G.ext), mars = meta.world === 'mars' || /orange/.test(meta.sky || '');
      G.scene = new THREE.Scene();
      G.scene.background = new THREE.Color(mars ? 0xc8a07c : 0x000000);
      if (mars) G.scene.fog = new THREE.Fog(0xc8a07c, 30000, 420000);
      G.cam = new THREE.PerspectiveCamera(62, 1, 0.3, 600000);
      const tex = new THREE.TextureLoader().load(base + 'color.jpg'); tex.encoding = THREE.sRGBEncoding; tex.anisotropy = 8;
      G.mesh = new THREE.Mesh(groundGeometry(), new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0, color: mars ? 0xff7a38 : 0xffffff }));
      G.scene.add(G.mesh);
      const az = (Number.isFinite(meta.sunAzimuth_deg) ? meta.sunAzimuth_deg : 135) * D, el = (Number.isFinite(meta.sunElevation_deg) ? meta.sunElevation_deg : 30) * D;
      const sunL = new THREE.DirectionalLight(0xfff4e6, mars ? 1.25 : 1.1); sunL.position.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)); G.scene.add(sunL);
      G.scene.add(new THREE.HemisphereLight(mars ? 0xffc9a0 : 0x8890a0, 0x3a2014, mars ? 0.95 : 0.45));
      if (!mars) { // stars above the horizon
        const k = 1500, p = new Float32Array(k * 3);
        for (let i = 0; i < k; i++) { const t = Math.random() * 2 * Math.PI, u = Math.random() * 0.95 + 0.05, r = 450000; p.set([Math.cos(t) * Math.sqrt(1 - u * u) * r, u * r, Math.sin(t) * Math.sqrt(1 - u * u) * r], i * 3); }
        const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(p, 3));
        G.scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false })));
      }
      placeMachines();
    drapeRoutes();
    addSurround(meta);
      // Stand 25 m south of the machine, facing it.
      const me = (meta.places || []).find(p => p.id === id) || { x_m: 0, y_m: 0 };
      G.target = [+me.x_m || 0, -(+me.y_m || 0)]; G.x = G.target[0]; G.z = G.target[1] + 25; G.yaw = 0; G.pitch = -0.06;
      G.orbit = { yaw: 0.6, pitch: 0.6, dist: span * 0.35 };
      $('gTitle').textContent = meta.title || it.name;
      $('gWorld').textContent = `${WORLDS[world].name} · ${Math.round(G.ext[0] / 100) / 10} km across${meta.res_m?.height ? ` · ${meta.res_m.height} m height detail` : ''}`;
      const s = meta.sources || {}, cr = [s.height && `Terrain: ${s.height.credit || ''} ${s.height.product ? '(' + s.height.product + ')' : ''}`, s.color && `Image: ${s.color.credit || ''}`].filter(Boolean).map(esc).join(' · ');
      $('gCredit').innerHTML = `<details><summary>About this map data</summary>${cr}${meta.note ? `<br>${esc(meta.note)}` : ''}</details>`;
      $('gGo').innerHTML = (meta.places || []).filter(p => byId(p.id)).map(p => `<button class="gbtn" type="button" data-go-to="${esc(p.id)}">Go to ${esc(String(byId(p.id).name).replace(/\s*\(.*?\)/g, ''))}</button>`).join('');
      $('gGo').querySelectorAll('[data-go-to]').forEach(b => b.onclick = () => { const q = meta.places.find(p => p.id === b.dataset.goTo); G.target = [+q.x_m, -q.y_m]; if (G.fly) return; G.goal = [+q.x_m, -q.y_m + 12]; });
    // Nearby machines outside this map: listed with distance; clicking travels there directly (loads their site).
    const here = new Set((meta.places || []).map(p => p.id)), Rkm = RADIUS_KM[world];
    if (Rkm && Array.isArray(meta.center)) {
      const [la0, lo0] = meta.center.map(n => +n * D);
      const far = DATA[world].filter(o => !here.has(o.id) && TERRAIN[o.id] && Number.isFinite(o.lat)).map(o => {
        const la = o.lat * D, lo = o.lon * D, h = Math.sin((la - la0) / 2) ** 2 + Math.cos(la0) * Math.cos(la) * Math.sin((lo - lo0) / 2) ** 2;
        return { o, km: 2 * Rkm * Math.asin(Math.min(1, Math.sqrt(h))) };
      }).sort((a, b) => a.km - b.km).slice(0, 5);
      if (far.length) $('gGo').insertAdjacentHTML('beyond' === world ? 'beforeend' : 'beforeend', `<details class="gfarbox"><summary class="gbtn">Elsewhere on ${esc(WORLDS[world].name)} (${far.length}) ▾</summary><div class="gfarlist">` + far.map(({ o, km }) =>
        `<button class="gbtn gfar" type="button" data-travel="${esc(o.id)}" title="Not on this map: travel to its site">${esc(String(o.name).replace(/\s*\(.*?\)/g, ''))} <span>${km < 10 ? km.toFixed(1) : Math.round(km).toLocaleString()} km ↗</span></button>`).join('') + '</div></details>');
      $('gGo').querySelectorAll('[data-travel]').forEach(b => b.onclick = () => { select(b.dataset.travel); openGround(b.dataset.travel); });
    }
      $('gMode').setAttribute('aria-pressed', 'false'); $('gMode').textContent = 'Fly over';
      $('gJump').hidden = false; $('gDown').hidden = false; G.machineId = id; G.helpText = G.helpText || $('gHelp').textContent; $('gPhoto').hidden = !PANOS[id]; togglePhoto(false);
      resizeGround(); $('gLoad').hidden = true; $('groundCv').focus({ preventScroll: true });
    } catch (err) {
      $('gLoad').textContent = 'No ground data for this site yet';
    }
  }
  // Street View-style photo sphere: the rover's own panorama wrapped around the viewer at its final spot.
function togglePhoto(on = !G.photo) {
  const pano = PANOS[G.machineId];
  G.photo = !!(on && pano && safeFile(pano.file));
  $('gPhoto').setAttribute('aria-pressed', G.photo); $('gPhoto').textContent = G.photo ? 'Back to 3D terrain' : 'Real photo 360°';
  ['gJump', 'gDown', 'gMode'].forEach(k => { $(k).hidden = G.photo; });
  document.querySelectorAll('#ground [data-k]').forEach(b => { b.hidden = G.photo; });
  if (G.pano) { G.scene.remove(G.pano); G.pano.geometry.dispose(); G.pano.material.map?.dispose(); G.pano.material.dispose(); G.pano = null; }
  if (!G.photo) { $('gHelp').textContent = G.helpText; return; }
  if (G.fly) $('gMode').click();
  const hf = Math.min(360, +pano.hfov_deg || 360), top = Number.isFinite(+pano.vtop_deg) ? +pano.vtop_deg : 45, bot = Number.isFinite(+pano.vbottom_deg) ? +pano.vbottom_deg : -45;
  const az0 = Number.isFinite(+pano.left_azimuth_deg) && pano.left_azimuth_deg !== null ? +pano.left_azimuth_deg : 0;
  const tex = new THREE.TextureLoader().load(pano.file); tex.encoding = THREE.sRGBEncoding;
  // phi = azimuth - 90deg once the sphere is mirrored (scale.x = -1) so the photo reads left-to-right from inside.
  const geo = new THREE.SphereGeometry(40, 96, 48, (az0 - 90) * D, hf * D, (90 - top) * D, (top - bot) * D);
  G.pano = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, depthTest: false, depthWrite: false, fog: false }));
  G.pano.scale.x = -1; G.pano.renderOrder = 20; G.scene.add(G.pano);
  G.x = G.target[0]; G.z = G.target[1]; G.goal = null; G.jump = 0; G.vy = 0; G.pitch = 0; G.yaw = -((az0 + hf / 2) * D);
  $('gHelp').innerHTML = `${esc(pano.caption || 'Real photo taken here')}${pano.taken ? ' · ' + esc(pano.taken) : ''} · <span class="credit">${esc(pano.credit || '')}${pano.license ? ' · ' + link(pano.licenseUrl, esc(pano.license)) : ''}${httpUrl(pano.source) ? ' · ' + link(pano.source, 'source ↗') : ''}${Number.isFinite(+pano.left_azimuth_deg) && pano.left_azimuth_deg !== null ? '' : ' · compass direction approximate'}</span>`;
}
function closeGroundScene() {
    G.pano = null; G.photo = false;
    if (!G.scene) return;
    G.scene.traverse(o => { o.geometry?.dispose(); [].concat(o.material || []).forEach(m => { m.map?.dispose(); m.dispose(); }); });
    G.scene = null; G.mesh = null;
  }
  function closeGround() { if (document.pointerLockElement) document.exitPointerLock(); G.look = false; G.open = false; $('ground').hidden = true; closeGroundScene(); }

  function bindGroundControls() {
    const c = $('groundCv');
    // Minecraft-style mouse look: a mouse click on the view locks the pointer (walk / photo mode); Esc releases it. Touch and fly-over keep drag-to-look.
  c.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && !G.fly && G.look) { setLook(false); return; }
    if (e.pointerType === 'mouse' && !G.fly && document.pointerLockElement !== c && c.requestPointerLock) {
      c.focus({ preventScroll: true });
      // requestPointerLock returns a promise in modern browsers; embedded/sandboxed views reject it, so fall back to drag-to-look.
      const noLock = () => { G.noLock = true; setLook(true); };
      try { Promise.resolve(c.requestPointerLock({ unadjustedMovement: true })).catch(() => Promise.resolve(c.requestPointerLock()).catch(noLock)); } catch { noLock(); }
      return;
    }
    if (document.pointerLockElement === c) return;
    G.drag = { x: e.clientX, y: e.clientY }; try { c.setPointerCapture(e.pointerId); } catch {}
  });
  document.addEventListener('mousemove', e => {
    const r = c.getBoundingClientRect(); G.mx = (e.clientX - r.left) / r.width;
    if ((document.pointerLockElement !== c && !(G.look && e.target === c)) || G.fly) return;
    G.yaw -= e.movementX * 0.0022; G.pitch = Math.max(-1.45, Math.min(1.45, G.pitch - e.movementY * 0.0022));
  });
  document.addEventListener('pointerlockerror', () => { G.noLock = true; setLook(true); });
  // Free-look fallback where the browser refuses pointer lock (embedded previews): the view follows the mouse, no button held.
  function setLook(on) {
    G.look = !!on && !G.fly; c.style.cursor = G.look ? 'crosshair' : '';
    if (!G.photo) $('gHelp').textContent = G.look ? 'Mouse to look (move to an edge to keep turning) · W A S D or arrows to walk · hold Space to fly up, C to go down · click or Esc to stop looking' : G.helpText;
  }
  c.addEventListener('mouseleave', () => { G.mx = 0.5; });
  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === c;
    if (!locked) G.unlockedAt = performance.now();
    c.style.cursor = locked ? 'none' : '';
    if (!G.photo) $('gHelp').textContent = locked ? 'Mouse to look · W A S D or arrows to walk (Shift runs) · hold Space to fly up, C to go down · Esc to free the mouse' : G.helpText;
  });
    c.addEventListener('pointermove', e => {
      if (!G.drag) return;
      const dx = e.clientX - G.drag.x, dy = e.clientY - G.drag.y; G.drag = { x: e.clientX, y: e.clientY };
      if (G.fly) { G.orbit.yaw -= dx * 0.005; G.orbit.pitch = Math.max(0.08, Math.min(1.45, G.orbit.pitch + dy * 0.005)); }
      else { G.yaw += dx * 0.004; G.pitch = Math.max(-1.3, Math.min(1.3, G.pitch + dy * 0.004)); }
    });
    c.addEventListener('pointerup', () => { G.drag = null; });
    c.addEventListener('wheel', e => { if (!G.fly) return; e.preventDefault(); G.orbit.dist = Math.max(20, Math.min(G.surroundHalf ? 120000 : Math.max(...G.ext) * 1.5, G.orbit.dist * (1 + e.deltaY * 0.001))); }, { passive: false });
    c.addEventListener('dblclick', e => { // walk to the clicked spot (needs a visible cursor)
    if (document.pointerLockElement === c) return;
      if (!G.mesh) return;
      const r = c.getBoundingClientRect(), ray = new THREE.Raycaster();
      ray.setFromCamera({ x: (e.clientX - r.left) / r.width * 2 - 1, y: -(e.clientY - r.top) / r.height * 2 + 1 }, G.cam);
      const hit = ray.intersectObject(G.mesh)[0]; if (!hit) return;
      if (G.fly) { G.target = [hit.point.x, hit.point.z]; return; }
      G.goal = [hit.point.x, hit.point.z];
    });
    const keyOn = (code, on) => { G.keys[code] = on; };
    c.addEventListener('keydown', e => {
      if (e.code === 'Escape' && G.look) { setLook(false); return; }
    if (e.code === 'Escape') { if (document.pointerLockElement === c || performance.now() - (G.unlockedAt || 0) < 400) return; return closeGround(); }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
            keyOn(e.code, true);
    });
    c.addEventListener('keyup', e => keyOn(e.code, false));
    c.addEventListener('blur', () => { G.keys = {}; });
    document.querySelectorAll('#ground [data-k]').forEach(b => {
      b.addEventListener('pointerdown', () => keyOn(b.dataset.k, true));
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, () => keyOn(b.dataset.k, false)));
    });
    $('gBack').onclick = closeGround;
      $('gPhoto').onclick = () => togglePhoto();
    $('gMode').onclick = () => { G.fly = !G.fly; if (G.fly && document.pointerLockElement) document.exitPointerLock(); if (G.fly) { G.look = false; $('groundCv').style.cursor = ''; } $('gMode').setAttribute('aria-pressed', G.fly); $('gMode').textContent = G.fly ? 'Walk' : 'Fly over'; $('gJump').hidden = G.fly; $('gDown').hidden = G.fly; if (!G.fly) { G.x = G.target[0]; G.z = G.target[1] + 25; G.yaw = 0; } };
  }
  function doJump() { if (!G.fly && G.jump <= 0) G.vy = 2.6; } // a hard astronaut hop is ~2.6 m/s

  function stepGround(t) {
    const dt = Math.min(0.05, (t - (G.last || t)) / 1000); G.last = t;
    if (!G.scene) return;
    const half = G.surroundHalf ? [G.surroundHalf * 0.95, G.surroundHalf * 0.95] : [G.ext[0] / 2 - 2, G.ext[1] / 2 - 2];
    if (G.fly) {
      const [tx, tz] = G.target, ty = hAt(tx, tz), o = G.orbit;
      G.cam.position.set(tx + Math.sin(o.yaw) * Math.cos(o.pitch) * o.dist, ty + Math.sin(o.pitch) * o.dist, tz + Math.cos(o.yaw) * Math.cos(o.pitch) * o.dist);
      G.cam.lookAt(tx, ty, tz);
    } else {
      const k = G.keys, run = k.ShiftLeft || k.ShiftRight ? 25 : 5, fwd = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
      const strafe = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0), turn = (k.ArrowLeft ? 1 : 0) - (k.ArrowRight ? 1 : 0);
    const lift = (k.Space ? 1 : 0) - (k.KeyC || k.KeyQ ? 1 : 0);
    // Flying speeds up the longer a movement key is held (about 2x after 1 s, 6x after 2 s, capped at 25x); walking stays at walking pace.
    G.hold = fwd || strafe || lift ? (G.hold || 0) + dt : 0;
    const boost = G.jump > 0.5 || lift ? Math.min(25, 1 + 1.2 * G.hold * G.hold) : 1, spd = run * boost;
      G.yaw += turn * 1.6 * dt;
    if (G.look && G.mx != null) { if (G.mx < 0.07) G.yaw += 1.4 * dt; else if (G.mx > 0.93) G.yaw -= 1.4 * dt; }
      const sy = Math.sin(G.yaw), cy = Math.cos(G.yaw);
      // Forward follows the gaze in 3D: horizontal share is cos(pitch), vertical share sin(pitch). On the ground looking down, keep full walking speed.
    const grounded = G.jump <= 0 && G.pitch < 0, hf = grounded ? 1 : Math.cos(G.pitch);
    let mx = (-sy * fwd * hf + cy * strafe) * spd * dt, mz = (-cy * fwd * hf - sy * strafe) * spd * dt;
    if (fwd && !G.photo) G.jump = Math.max(0, Math.min(flyMax(), G.jump + fwd * Math.sin(G.pitch) * spd * dt));
      if (G.goal && !fwd && !strafe) {
        const gx = G.goal[0] - G.x, gz = G.goal[1] - G.z, d = Math.hypot(gx, gz), s = Math.min(d, Math.max(8, d * 1.5) * dt);
        if (d < 0.6) G.goal = null; else { mx = gx / d * s; mz = gz / d * s; G.yaw += Math.atan2(Math.sin(Math.atan2(-gx, -gz) - G.yaw), Math.cos(Math.atan2(-gx, -gz) - G.yaw)) * Math.min(1, 4 * dt); }
      } else if (fwd || strafe) G.goal = null;
      G.x = Math.max(-half[0], Math.min(half[0], G.x + mx)); G.z = Math.max(-half[1], Math.min(half[1], G.z + mz));
      // Creative-mode flight: hold Space to rise, C or Q to sink, hover in between; touching the ground lands you.
    if (lift) G.jump = Math.max(0, Math.min(flyMax(), G.jump + lift * (k.ShiftLeft || k.ShiftRight ? 60 : 12) * boost * dt));
      if (G.photo) { G.x = G.target[0]; G.z = G.target[1]; G.goal = null; }
    G.cam.position.set(G.x, hAt(G.x, G.z) + EYE + G.jump, G.z);
    G.pano?.position.copy(G.cam.position);
      G.cam.rotation.order = 'YXZ'; G.cam.rotation.set(G.pitch, G.yaw, 0);
    }
    const head = ((G.fly ? -G.orbit.yaw + Math.PI : -G.yaw) / D % 360 + 360) % 360;
    $('gCompass').textContent = `${['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(head / 45) % 8]} ${Math.round(head)}°`;
    G.r.render(G.scene, G.cam);
  }

  // The draggable explorer: drop it near a glowing pin (globe) or craft (deep space).
  const peg = $('peg');
  function nearestWalkable(cx, cy) {
    const els = world === 'beyond' ? [...$('beyond').querySelectorAll('.craft.walk')] : pins.filter(p => TERRAIN[p.it.id] && !p.el.classList.contains('far')).map(p => p.el);
    let best = null, bd = 70;
    for (const el of els) {
      const r = (el.querySelector?.('circle') || el).getBoundingClientRect(), d = Math.hypot(r.left + r.width / 2 - cx, r.top + r.height / 2 - cy);
      if (d < bd) { bd = d; best = el; }
    }
    return best;
  }
  let pegDrag = null, pegHit = null;
// Pegman-style ragdoll: the astronaut hangs from the cursor by the helmet; body and each limb are damped springs,
// so the body swings against the drag and the limbs lag behind it. Limbs spread while held and fold back when dropped.
const sway = { push: 0, vy: 0, raf: 0, lastX: 0, lastY: 0, lastT: 0 };
const rag = { body: { a: 0, v: 0 }, armL: { a: 0, v: 0 }, armR: { a: 0, v: 0 }, legL: { a: 0, v: 0 }, legR: { a: 0, v: 0 } };
const JOINTS = { armL: [7.8, 23], armR: [32.2, 23], legL: [16.5, 39], legR: [23.5, 39] };
const spring = (o, target, k, d) => { o.v = (o.v + (target - o.a) * k) * d; o.a += o.v; };
function swayTick() {
  const held = !!pegDrag, svg = document.getElementById('peg')?.querySelector('svg'); // look up fresh: hot reload can swap the markup
  if (!svg) { sway.raf = 0; return; }
  spring(rag.body, Math.max(-50, Math.min(50, sway.push)), 0.13, 0.8);
  const lagB = -rag.body.a * 0.7 - rag.body.v * 2.2; // limbs try to keep hanging straight down
  const lift = held ? Math.max(-25, Math.min(25, sway.vy * 1.5)) : 0;
  spring(rag.armL, lagB + (held ? 32 + lift : 0), 0.06, 0.88);
  spring(rag.armR, lagB - (held ? 32 + lift : 0), 0.06, 0.88);
  spring(rag.legL, lagB * 0.8 + (held ? 12 : 0), 0.08, 0.86);
  spring(rag.legR, lagB * 0.8 - (held ? 12 : 0), 0.08, 0.86);
  sway.push *= 0.86; sway.vy *= 0.85;
  svg.style.transform = `rotate(${rag.body.a.toFixed(2)}deg) scale(${held ? 1.3 : 1})`;
  for (const [k, [x, y]] of Object.entries(JOINTS)) svg.querySelector('.pm-' + k)?.setAttribute('transform', `rotate(${rag[k].a.toFixed(2)} ${x} ${y})`);
  const moving = Object.values(rag).some(o => Math.abs(o.a) > 0.05 || Math.abs(o.v) > 0.05);
  if (held || moving) sway.raf = requestAnimationFrame(swayTick); else sway.raf = 0;
}
const kickSway = () => { if (!sway.raf && !reduceMotion) sway.raf = requestAnimationFrame(swayTick); };
  peg.addEventListener('pointerdown', e => { e.preventDefault(); try { peg.setPointerCapture(e.pointerId); } catch {} pegDrag = { x: e.clientX, y: e.clientY, moved: false }; sway.lastX = e.clientX; sway.lastY = e.clientY; sway.lastT = performance.now(); kickSway(); peg.classList.add('dragging'); stage.classList.add('pegging'); });
  peg.addEventListener('pointermove', e => {
    if (!pegDrag) return;
    const dx = e.clientX - pegDrag.x, dy = e.clientY - pegDrag.y; pegDrag.moved ||= Math.hypot(dx, dy) > 5;
    peg.style.transform = `translate(${dx}px,${dy}px)`;
  const now = performance.now(), dt = Math.max(8, now - sway.lastT), vx = (e.clientX - sway.lastX) / dt * 16, vy = (e.clientY - sway.lastY) / dt * 16; // px per frame
  sway.push = sway.push * 0.5 + vx * 2.4; sway.vy = sway.vy * 0.5 + vy; sway.lastX = e.clientX; sway.lastY = e.clientY; sway.lastT = now; kickSway();
    const hit = nearestWalkable(e.clientX, e.clientY);
    if (hit !== pegHit) { pegHit?.classList.remove('droptarget'); hit?.classList.add('droptarget'); pegHit = hit; }
  });
  const pegEnd = () => {
    if (!pegDrag) return;
    const moved = pegDrag.moved, hit = pegHit; pegDrag = null; pegHit = null;
    peg.style.transform = ''; peg.classList.remove('dragging'); stage.classList.remove('pegging'); hit?.classList.remove('droptarget');
    const id = hit && (hit.dataset.id || pins.find(p => p.el === hit)?.it.id);
    if (id) { select(id); openGround(id); return; }
    const n = (world === 'beyond' ? DATA.beyond : DATA[world]).filter(it => TERRAIN[it.id]).length;
    $('hint').textContent = n ? (moved ? 'Drop the explorer right on a glowing site' : 'Drag the explorer onto a glowing site') : 'Ground views for this world are still loading';
  };
  peg.addEventListener('pointerup', pegEnd);
  peg.addEventListener('pointercancel', pegEnd);
// Search across every world: name, mission, type, fate and the places named in each summary. Current world ranks first.
const qIn = $('q'), qRes = $('qres');
let qHits = [], qActive = -1;
function searchAll(q) {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const hits = [];
  for (const w of Object.keys(WORLDS)) for (const it of DATA[w]) {
    const name = String(it.name).toLowerCase();
    const hay = [it.name, it.mission, it.type, it.status, it.fate?.label, it.fate?.summary, it.summary, it.body, WORLDS[w].name].join(' ').toLowerCase();
    if (!terms.every(t => hay.includes(t))) continue;
    hits.push({ w, it, score: (w === world ? 2 : 0) + (terms.every(t => name.includes(t)) ? 4 : 0) + (name.startsWith(terms[0]) ? 1 : 0) });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, 12);
}
function renderSearch() {
  qHits = searchAll(qIn.value); qActive = qHits.length ? 0 : -1;
  qRes.hidden = !qIn.value.trim();
  qRes.innerHTML = qHits.length ? qHits.map((h, i) => `<li role="option" id="qo${i}" aria-selected="${i === qActive}" data-i="${i}"><span class="qn">${esc(h.it.name)}</span><span class="qm">${esc(WORLDS[h.w].name)} · ${esc(h.it.fate?.label || h.it.status || h.it.mission)}</span></li>`).join('')
    : '<li class="qnone">No machines or places match</li>';
  qIn.setAttribute('aria-activedescendant', qActive >= 0 ? 'qo' + qActive : '');
}
function goSearch(i) {
  const h = qHits[i]; if (!h) return;
  qIn.value = ''; qRes.hidden = true;
  if (h.w !== world) setWorld(h.w, true);
  select(h.it.id);
  stage.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
}
qIn.addEventListener('input', renderSearch);
qIn.addEventListener('keydown', e => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault(); if (!qHits.length) return;
    qActive = (qActive + (e.key === 'ArrowDown' ? 1 : -1) + qHits.length) % qHits.length;
    qRes.querySelectorAll('li[data-i]').forEach(li => li.setAttribute('aria-selected', +li.dataset.i === qActive));
    qIn.setAttribute('aria-activedescendant', 'qo' + qActive);
  } else if (e.key === 'Enter') { e.preventDefault(); goSearch(Math.max(0, qActive)); }
  else if (e.key === 'Escape') { qIn.value = ''; qRes.hidden = true; }
});
qRes.addEventListener('mousedown', e => { const li = e.target.closest('li[data-i]'); if (li) { e.preventDefault(); goSearch(+li.dataset.i); } });
qIn.addEventListener('blur', () => setTimeout(() => { qRes.hidden = true; }, 120));
qIn.addEventListener('focus', () => { if (qIn.value.trim()) renderSearch(); });

// Full screen for the interactive area (globe or ground view). Where the browser refuses or ignores real full screen
// (embedded previews), fall back to filling the whole window with CSS.
function fsLabel() {
  const on = document.fullscreenElement === stage || stage.classList.contains('maxed');
  ['fsBtn', 'gFs'].forEach(k => { const b = $(k); if (b) { b.textContent = on ? '✕ Exit full screen' : '⛶ Full screen'; b.setAttribute('aria-pressed', on); } });
}
function toggleFs() {
  if (stage.classList.contains('maxed')) { stage.classList.remove('maxed'); document.body.style.overflow = ''; return fsLabel(); }
  if (document.fullscreenElement) { document.exitFullscreen?.(); return; }
  const fallback = () => { if (!document.fullscreenElement) { stage.classList.add('maxed'); document.body.style.overflow = 'hidden'; fsLabel(); } };
  try { Promise.resolve(stage.requestFullscreen?.()).catch(fallback); } catch { fallback(); }
  setTimeout(fallback, 400);
}
document.addEventListener('fullscreenchange', fsLabel);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && stage.classList.contains('maxed') && !G.open) toggleFs(); });
$('fsBtn').onclick = toggleFs;
$('gFs').onclick = toggleFs;


  function route(h = decodeURIComponent(location.hash.slice(1))) {
    if (WORLDS[h]) { if (h !== world) setWorld(h); return; }
    for (const w of Object.keys(WORLDS)) if (DATA[w].some(it => it.id === h)) { if (w !== world) setWorld(w, true); select(h); return; }
  }
  addEventListener('hashchange', () => route());
  const startHash = decodeURIComponent(location.hash.slice(1));

  Promise.allSettled([
    ...Object.entries(WORLDS).map(([w, c]) => fetch(c.file).then(r => r.ok ? r.json() : []).then(d => { DATA[w] = Array.isArray(d) ? d : []; })),
    fetch('models/models.json').then(r => r.ok ? r.json() : {}).then(m => { MODELS = m && typeof m === 'object' ? m : {}; }),
    fetch('data/locator.json').then(r => r.ok ? r.json() : null).then(l => { if (l && l.sites) LOC = { credits: l.credits || {}, sites: l.sites }; }),
    fetch('data/panoramas.json').then(r => r.ok ? r.json() : {}).then(m => { if (m && typeof m === 'object') Object.assign(PANOS, m); }),
  fetch('data/routes.json').then(r => r.ok ? r.json() : {}).then(m => { if (m && typeof m === 'object') Object.assign(ROUTES, m); }),
  ...['moon', 'mars', 'beyond'].map(w => fetch(`data/links-${w}.json`).then(r => r.ok ? r.json() : {}).then(m => { if (m && typeof m === 'object') Object.assign(LINKS, m); })),
    ...['moon', 'mars', 'beyond'].map(w => fetch(`terrain/index-${w}.json`).then(r => r.ok ? r.json() : {}).then(m => { if (m && typeof m === 'object') Object.assign(TERRAIN, m); })),
  ])
    .then(() => {
      document.querySelectorAll('.worlds button').forEach(b => b.querySelector('.n').textContent = DATA[b.dataset.world].length);
      setWorld('moon');
      route(startHash);
    });
}
