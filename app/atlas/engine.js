// Ruins Among the Stars engine: plain JS that drives the DOM rendered by Atlas.tsx.
// Needs the global THREE (r128) plus GLTFLoader/DRACOLoader, loaded by Atlas.tsx from /vendor/three.
/* eslint-disable */
import { loadSalvage, salvageBlock } from './salvage.js';
import { loadPhotosBy, loadLive, photosBlock, liveBlock, startLive } from './live.js';
import { ICON } from './icons.js';
export function startAtlas() {
  const D = Math.PI / 180, NOW = new Date('2026-11-14');
  const WORLDS = {
    moon:   { file: 'data/moon.json', tex: 'tex/moon.jpg', name: 'the Moon',
              intro: 'Twelve astronauts walked here between 1969 and 1972 and left their landers, cars and science stations behind. Robots came before and after them. Nothing on the Moon rusts or blows away, so it all still looks almost the way it did on its last day.' },
    mars:   { file: 'data/mars.json', tex: 'tex/mars.jpg', name: 'Mars',
              intro: 'Mars is a rover graveyard and a rover playground at the same time. Some space objects here went quiet decades ago under red dust. Two are still driving today, and one is a helicopter that will never fly again.' },
    beyond: { file: 'data/deepspace.json', name: 'deep space',
              intro: 'Some space objects never landed anywhere. They orbit dead worlds, rest on asteroids, plunged into giant planets on purpose, or are sailing out of the solar system forever.' },
  };
  const DATA = { moon: [], mars: [], beyond: [] };
  // Machines this visitor has opened, kept in this browser only (a per-visitor convenience; nothing is sent anywhere).
  const SEEN_KEY = 'gra-explored';
  // Machines whose every spot you've found in the tour (written by app/tour/state.ts).
  const complete = () => { try { return new Set(JSON.parse(localStorage.getItem('gra-complete') || '[]')); } catch { return new Set(); } };
  const seen = new Set((() => { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); } catch { return []; } })());
  const saveSeen = () => { try { localStorage.setItem(SEEN_KEY, JSON.stringify([...seen])); } catch { /* private mode: progress lasts this visit */ } };
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
    // Real magnitude spread: most stars near the naked-eye limit (faint), only a few bright ones.
    const n = 900, p = new Float32Array(n * 3), c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      let v; do { v = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1); } while (v.lengthSq() > 1 || v.lengthSq() < 1e-4);
      v.normalize().multiplyScalar(120).toArray(p, i * 3);
      const m = Math.max(-1.4, 6.5 + Math.log10(Math.max(Math.random(), 1e-6)) / 0.48), b = Math.min(1, 0.08 + 0.92 * Math.min(1, Math.pow(10, -0.4 * (m - 6.5)) / 60)), t = Math.random();
      c.set([b * (t < 0.15 ? 0.82 : 1), b * (t > 0.85 ? 0.9 : 1), b * (t > 0.85 ? 0.78 : 1)], i * 3);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ vertexColors: true, size: 1.6, sizeAttenuation: false, transparent: true, depthWrite: false })));
  }
  const textures = {}, loader = new THREE.TextureLoader();
  function setTexture(w) {
    if (!textures[w]) { textures[w] = loader.load(WORLDS[w].tex); textures[w].encoding = THREE.sRGBEncoding; textures[w].anisotropy = 4; textures[w + 'N'] = loader.load(WORLDS[w].tex.replace('.jpg', '-normal.jpg')); }
    mat.map = textures[w]; mat.normalMap = textures[w + 'N']; mat.needsUpdate = true;
  }
  // Geology (Mars only): USGS global geologic map (SIM 3292) as a see-through layer on the globe, plus a legend.
  const geoMesh = new THREE.Mesh(new THREE.SphereGeometry(1.002, 128, 64), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.78, depthWrite: false }));
  geoMesh.visible = false; globe.add(geoMesh);
  // Deep space: fly the same map in 3D. The 2D map zooms and fades, then /solar opens straight overhead, framed the
  // same way, and swoops down to the selected craft (or Earth).
  stage.insertAdjacentHTML('beforeend', '<button class="gbtn fly3d" id="fly3d" type="button" hidden>Fly around in 3D →</button>');
  $('fly3d').onclick = () => {
    const to = '/solar?intro=map' + (selected ? '&from=' + encodeURIComponent(selected) : '');
    // Hand the map itself over: /solar shows it lined up over its overhead view, then dissolves it into 3D.
    try { cancelAnimationFrame(bz.raf); setVB(FULL_VB.slice()); sessionStorage.setItem('gra-map', $('beyond').outerHTML); } catch { /* no storage: plain fade */ }
    location.href = to;
  };
  stage.insertAdjacentHTML('beforeend', '<button class="gbtn geobtn" id="geoBtn" type="button" aria-pressed="false" aria-controls="geoLegend" hidden>Rock map</button><div class="geolegend" id="geoLegend" hidden></div>');
  const ERAS = { Noachian: 'Noachian: oldest, about 4 billion years', Hesperian: 'Hesperian: about 3.5 billion years', Amazonian: 'Amazonian: youngest, up to today' };
  const hexOk = c => /^#[0-9a-f]{6}$/i.test(c || '') ? c : '#888888';
  function syncGeo(on = $('geoBtn').getAttribute('aria-pressed') === 'true') {
    const ok = world === 'mars'; on = on && ok;
    $('geoBtn').hidden = !ok; $('geoBtn').setAttribute('aria-pressed', on); $('geoLegend').hidden = !on; geoMesh.visible = on;
    if (on && !geoMesh.material.map) {
      geoMesh.material.map = loader.load('terrain/mars/geology-global.png'); geoMesh.material.map.encoding = THREE.sRGBEncoding; geoMesh.material.needsUpdate = true;
      fetch('terrain/mars/geology-legend.json').then(r => r.json()).then(L => {
        const groups = {};
        for (const u of L.units) (groups[(String(u.age).match(/Amazonian|Hesperian|Noachian/) || ['Other'])[0]] ||= []).push(u);
        $('geoLegend').innerHTML = `<p class="eyebrow">Rock ages on Mars</p>` + ['Noachian', 'Hesperian', 'Amazonian'].filter(k => groups[k]).map(k => `<h4>${esc(ERAS[k])}</h4><ul>${groups[k].map(u => `<li><i style="background:${hexOk(u.color)}"></i>${esc(String(u.unitName).replace(/\s+unit$/i, ''))}</li>`).join('')}</ul>`).join('')
          + `<p class="credit">${esc(L.source.title)} · ${esc(L.source.credit)} · ${esc(L.source.license)}</p>`;
      }).catch(() => { $('geoLegend').textContent = 'Legend unavailable'; });
    }
  }
  $('geoBtn').onclick = () => syncGeo($('geoBtn').getAttribute('aria-pressed') !== 'true');
  const GEO = {}; // site geology.json, per machine id
  const geologyOf = id => GEO[id] ||= /^mars\/[\w-]+$/.test(TERRAIN[id] || '') ? fetch(`terrain/${TERRAIN[id]}/geology.json`).then(r => r.ok ? r.json() : null).catch(() => null) : Promise.resolve(null);
  const geoName = g => esc(String(g.unitName).replace(/\s+unit$/i, '') + (String(g.unitName).startsWith(g.age) ? '' : ` (${g.age})`));
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
  const zoomBy = f => { zoom = Math.max(0.4, Math.min(1.5, zoom * f)); fitCam(); };
  // Plain wheel scrolls the page; Ctrl/⌘ + wheel (and trackpad pinch, which arrives as ctrl+wheel) zooms.
  cv.addEventListener('wheel', e => { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); zoomBy(1 + e.deltaY * 0.004); }, { passive: false });
  stage.insertAdjacentHTML('beforeend', '<div class="gzoom" id="gZoom"><button type="button" data-z="0.8" aria-label="Zoom in">' + ICON.zoomIn + '</button><button type="button" data-z="1.25" aria-label="Zoom out">' + ICON.zoomOut + '</button></div>');
  $('gZoom').onclick = e => { const b = e.target.closest('[data-z]'); if (b) zoomBy(+b.dataset.z); };

  let pins = [], pinMenu = null;
  const RANK = { alive: 3, echo: 2, silent: 1, future: 0 };
  // Machines within ~0.05° (one landing site) share one pin; clicking it lists them.
  function buildPins() {
    const box = $('pins'); box.innerHTML = ''; pinMenu = null;
    const sites = [];
    for (const it of DATA[world].filter(it => Number.isFinite(it.lat) && Number.isFinite(it.lon))) {
      const s = sites.find(s => Math.hypot(s.lat - it.lat, (s.lon - it.lon) * Math.cos(it.lat * D)) < 0.05);
      if (s) s.items.push(it); else sites.push({ lat: it.lat, lon: it.lon, items: [it] });
    }
    pins = sites.map(({ lat, lon, items }) => {
      const it = items[0], many = items.length > 1, b = document.createElement('button');
      const name = many ? `${it.mission} site · ${items.length} space objects` : it.name;
      b.type = 'button'; b.className = 'pin ' + (many ? 'site' : shape(it)) + (items.some(x => TERRAIN[x.id]) ? ' walk' : '');
      b.setAttribute('aria-label', name);
      b.innerHTML = `<span class="tip">${esc(name)}</span>${many ? `<span class="cnt" aria-hidden="true">${items.length}</span>` : ''}`;
      b.onclick = e => { e.stopPropagation(); many ? openPinMenu(p) : select(it.id); };
      if (many) b.setAttribute('aria-haspopup', 'true');
      box.appendChild(b);
      const p = { it, items, el: b, v: ll(lat, lon, 1.004) };
      return p;
    });
    paint();
  }
  function closePinMenu() { pinMenu?.el.remove(); pinMenu?.pin.el.setAttribute('aria-expanded', 'false'); pinMenu = null; }
  function openPinMenu(p) {
    const again = pinMenu?.pin === p; closePinMenu(); if (again) return;
    const m = document.createElement('div'); m.className = 'pinmenu'; m.setAttribute('role', 'menu');
    m.innerHTML = `<p>${esc(p.it.mission)} site</p>` + p.items.map(it => `<button type="button" role="menuitem" data-id="${esc(it.id)}" style="--c:${COLOR[stateAt(it, year)]}"${seen.has(it.id) ? ' class="seen"' : ''}><i></i>${esc(it.name)}</button>`).join('');
    m.onclick = e => { const b = e.target.closest('[data-id]'); if (b) { closePinMenu(); select(b.dataset.id); } };
    m.onkeydown = e => { if (e.key === 'Escape') { closePinMenu(); p.el.focus(); } };
    $('pins').appendChild(m); pinMenu = { el: m, pin: p }; p.el.setAttribute('aria-expanded', 'true');
    m.querySelector('button').focus({ preventScroll: true });
  }
  addEventListener('pointerdown', e => { if (pinMenu && !e.target.closest('.pinmenu,.pin')) closePinMenu(); });
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
      if (pinMenu?.pin === p) { if (hidden) closePinMenu(); else pinMenu.el.style.transform = p.el.style.transform; }
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
  const MODEL_MATCH = [ // explicit picks first (most specific first); null = no honest model
  [/apollo15-lrrr/, 'lrrr-300'], [/-lrrr/, 'lrrr-100'], [/apollo11-pse/, 'easep'], [/-alsep/, 'alsep'], [/-lrv/, 'lrv'],
  [/^surveyor/, 'surveyor'], [/^pathfinder/, 'pathfinder'], [/^sojourner/, 'sojourner'], [/^phoenix/, 'phoenix'], [/backshell/, 'backshell'],
  [/galileo_probe/, 'galileo-probe'], [/pioneer_venus_orbiter/, 'pioneer-venus-orbiter'], [/pioneer_venus_large/, 'pioneer-venus-large'],
  [/pioneer_venus_small/, 'pioneer-venus-small'], [/^spitzer/, 'spitzer'],
];
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
  // The part that gave out, per machine: which named parts of its 3D model to glow red, and a kid-readable note.
// Only machines whose model has that part as a separate, named piece are listed; the note says what really happened.
const FAULTS = {
  opportunity: { parts: /^tex_panels2?_n$/, note: 'solar panels. A planet-wide dust storm blocked their sunlight in 2018.' },
  spirit: { parts: /^tex_suspension_n$/, note: 'wheels. One had already failed, and the rest dug into soft sand at Troy.' },
  insight: { parts: /^panel_/, note: 'solar panels. Dust piled up on them until there was too little power.' },
  phoenix: { parts: /^cell$/, note: 'solar panels. The Arctic winter took their sunlight, and frost later cracked them.' },
  ingenuity: { parts: /^(blades|rotors_0[12])$/, note: 'rotor blades. They snapped in a hard landing on flight 72.' },
  surveyor1: { parts: /^cell$/, note: 'solar panel. It could not keep the battery alive through the freezing two-week nights.' },
  surveyor3: { parts: /^cell$/, note: 'solar panel. It could not keep the battery alive through the freezing two-week night.' },
  surveyor5: { parts: /^cell$/, note: 'solar panel. It could not keep the battery alive through the freezing two-week nights.' },
  surveyor6: { parts: /^cell$/, note: 'solar panel. It could not keep the battery alive through the freezing two-week night.' },
  surveyor7: { parts: /^cell$/, note: 'solar panel. It could not keep the battery alive through the freezing two-week nights.' },
  galileo: { parts: /^ribs:gold_mesh$/, note: 'main antenna. It jammed half open, so Galileo had to send everything through a tiny one.' },
};
const faultMats = new Set();
// Clones the materials of the failed part and makes them glow; the frame loop pulses everything in faultMats.
function tintFault(obj, it, bag) {
  const f = it && FAULTS[it.id]; if (!f) return false;
  let hit = false;
  obj.traverse(o => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    if (!(f.parts.test(o.name) || f.parts.test(o.parent?.name || '') || mats.some(m => f.parts.test(m?.name || '')))) return;
    const glow = mats.map(m => { const c = m.clone(); c.emissive = new THREE.Color(0xff2a10); c.emissiveIntensity = 0.5; faultMats.add(c); bag.push(c); return c; });
    o.material = Array.isArray(o.material) ? glow : glow[0]; hit = true;
  });
  return hit;
}
const dropFaultMats = bag => { bag.forEach(m => { faultMats.delete(m); m.dispose(); }); bag.length = 0; };
// Model viewer zoom: wheel or the +/- buttons; 1 = whole model fits.
function mvCam() { mv.cam.position.set(0, 0.9 * mv.zoom, 3.6 * mv.zoom); mv.cam.lookAt(0, 0, 0); }
function mvZoom(f) { if (!mv.cam) return; mv.zoom = Math.max(0.55, Math.min(2.5, mv.zoom * f)); mvCam(); }
const mv = { r: null, scene: null, cam: null, obj: null, key: null, spin: 0, drag: null };
  const gltfLoader = THREE.GLTFLoader ? new THREE.GLTFLoader() : null, modelCache = {};
  // Most NASA models are Draco-compressed. Decoder ships with the page (the artifact sandbox blocks runtime CDN fetches); JS build avoids needing WASM.
  if (gltfLoader && THREE.DRACOLoader) gltfLoader.setDRACOLoader(new THREE.DRACOLoader().setDecoderPath('vendor/draco/').setDecoderConfig({ type: 'js' }));
  function mountModel(key, it) {
    const host = $('mv'); if (!host || !key || !gltfLoader) return;
    if (!mv.r) {
      mv.r = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      mv.r.outputEncoding = THREE.sRGBEncoding; mv.r.setPixelRatio(Math.min(devicePixelRatio, 2));
      mv.scene = new THREE.Scene(); mv.cam = new THREE.PerspectiveCamera(30, 1.6, 0.01, 100);
      mv.zoom = 1; mvCam();
    mv.r.domElement.addEventListener('wheel', e => { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); mvZoom(1 + e.deltaY * 0.0015); }, { passive: false });
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
    dropFaultMats(mv.faults || (mv.faults = []));
    // Each machine gets its own copy, so one model can show different failed parts (Spirit's wheels, Opportunity's panels).
    const show = base => { if (mv.key !== key) return; const o = base.clone(true); tintFault(o, it, mv.faults); mv.obj = o; mv.scene.add(o); host.classList.add('ready'); };
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
    if (faultMats.size) { const k = 0.38 + 0.3 * Math.sin(t / 260); faultMats.forEach(m => { m.emissiveIntensity = k; }); }
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
  let SALV = {}; // salvage grade per machine (public/data/salvage.json)
  let PHOTOS_BY = {}, LIVE = {}, stopLive = () => {}; // photos each machine took; live numbers for working ones
const PANOS = {}; // id -> real ground panorama { file, hfov_deg, vtop_deg, vbottom_deg, left_azimuth_deg, caption, credit, license, source }
const ROUTES = {}; // id -> { segments: [{ name, points: [[lat, lon], ...] }], distance_km, credit, ... }
const routeSegs = it => (ROUTES[it.id]?.segments || []).map(sg => sg.points).filter(a => Array.isArray(a) && a.length > 1).concat(ROUTES[it.id] ? [] : (Array.isArray(it.path) && it.path.length > 1 ? [it.path] : []));
  const KIND = { official: 'Mission page', archive: 'Archive', images: 'Images', data: 'Data', video: 'Video', kids: 'For kids', live: 'Live' };
  function learnMore(l) {
    if (!l) return '';
    const hl = (l.highlights || []).filter(Boolean), ln = (l.links || []).filter(x => httpUrl(x?.url));
    if (!hl.length && !ln.length) return '';
    return `${hl.length ? `<ul class="hl">${hl.map(h => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}
      ${ln.length ? `<ul class="links">${ln.map(x => `<li><a href="${esc(x.url)}" target="_blank" rel="noopener"><span class="lk">${esc(KIND[x.kind] || 'Link')}</span>${esc(x.title || x.url)} ${ICON.external}</a></li>`).join('')}</ul>` : ''}`;
  }
  function photoFig(p) {
    if (!p || !safeFile(p.file)) return '';
    const bits = [p.credit && 'Image: ' + esc(p.credit), p.license && link(p.licenseUrl, esc(p.license)), httpUrl(p.source) && link(p.source, `source ${ICON.external}`)].filter(Boolean);
    return `<figure class="photo"><img src="${esc(p.file)}" alt="${esc(p.caption || '')}" loading="lazy">
      <figcaption>${esc(p.caption || '')}<span class="credit">${bits.join(' · ')}</span></figcaption></figure>`;
  }
  function fateBlock(f) {
    if (!f) return '';
    return `<h3>What happened</h3><div class="fate${BAD.has(f.category) ? ' bad' : ''}"><p class="fatecat"><i aria-hidden="true"></i>${esc(FATES[f.category] || f.category)}</p>
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
    return views ? `<div class="locs">${views}</div>` : '';
  }

  /* ---------- dossier, timeline, roster ---------- */
  const DATEF = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  // "2012-08-06" -> "6 Aug 2012"; a bare year stays a year.
  const fmt = s => { const t = s ? String(s) : ''; if (!t) return '—'; if (t.length < 10) return t.slice(0, 4); const d = new Date(t.slice(0, 10) + 'T12:00:00Z'); return isNaN(d) ? t.slice(0, 10) : DATEF.format(d); };
  const span = days => days < 1 ? 'Under a day' : days < 60 ? `${Math.round(days)} day${Math.round(days) === 1 ? '' : 's'}` : days < 730 ? `${Math.round(days / 30.44)} months` : `${(days / 365.25).toFixed(days < 7305 ? 1 : 0)} years`;
  const yrs = it => { const a = String(born(it) || '').slice(0, 4), e = activeNow(it) ? 'today' : String(died(it) || '').slice(0, 4); return a ? (e && e !== a ? `${a}–${e}` : a) : ''; };
  const BAD = new Set(['power', 'comms', 'stuck', 'damaged', 'crash-accident', 'lost']);
  const Y0 = 1959, Y1 = 2027, yPct = y => Math.max(0, Math.min(100, (y - Y0) / (Y1 - Y0) * 100));
  const yearsSince = s => ((NOW - new Date(String(s).slice(0, 10))) / 3.15576e10);
  function dossier(it) {
    const st = stateAt(it, 2026), end = died(it);
    const src = /^https?:\/\//.test(it.source || '') ? `<a class="src" href="${esc(it.source)}" target="_blank" rel="noopener">Source ${ICON.external}</a>` : '';
    const mk = modelKeyFor(it), m = mk && MODELS[mk];
    const model = m ? `<figure class="model"><div class="mv" id="mv" role="img" aria-label="3D model of ${esc(m.title)}"></div>
    <div class="mvz"><button type="button" data-mvz="0.8" aria-label="Zoom in">${ICON.zoomIn}</button><button type="button" data-mvz="1.25" aria-label="Zoom out">${ICON.zoomOut}</button></div>
      ${MODEL_NOTE[mk] ? `<figcaption>${esc(MODEL_NOTE[mk])}</figcaption>` : ''}
      ${FAULTS[it.id] ? `<figcaption class="faultnote"><i aria-hidden="true"></i><span><b>Glowing red is what gave out:</b> the ${esc(FAULTS[it.id].note)}</span></figcaption>` : ''}
      <figcaption>${/^NASA/.test(m.credit || 'NASA') ? 'NASA 3D model' : '3D model'}: ${esc(m.title)}${/^NASA/.test(m.credit || 'NASA') ? '' : ` (${esc(m.credit)}, ${esc(m.license || '')})`} · drag to turn, +/− or Ctrl + scroll to zoom${/^https?:\/\//.test(m.page || '') ? ` · <a href="${esc(m.page)}" target="_blank" rel="noopener" style="color:var(--signal)">model page ${ICON.external}</a>` : ''}</figcaption></figure>` : '';
    return `<p class="eyebrow">${esc(it.mission)} · ${esc(it.type)}</p>
      <h2>${esc(it.name)}</h2>
      <span class="pill" style="--c:${COLOR[st]}">${esc(it.status)}</span>
      ${TERRAIN[it.id] ? `<br><button type="button" class="walkbtn" data-walk="${esc(it.id)}">Walk around this site ${ICON.go}</button>` : ''}
    ${world === 'beyond' && mk ? `<br><a class="walkbtn" href="/fly#${esc(it.id)}">Fly around it ${ICON.go}</a>` : ''}
      ${glance(it, st, end)}
      ${photoFig(it.photo)}
      ${it.summary ? `<p class="summary">${esc(it.summary)}</p>` : ''}
      ${fateBlock(it.fate)}
      ${salvageBlock(SALV[it.id])}
      ${liveBlock(LIVE[it.id])}${photosBlock(PHOTOS_BY[it.id])}
      ${model ? `<h3>Turn it around</h3>${model}` : ''}
      ${it.funFact ? `<p class="fun"><strong>Fun fact</strong>${esc(it.funFact)}</p>` : ''}
      ${fold('In its own words', it.story ? `<blockquote class="voice">${esc(it.story)}</blockquote>` : '')}
      ${fold(`Where it is${world === 'beyond' ? '' : ' on ' + esc(WORLDS[world].name)}`, locatorBlock(it) + (it.orbit ? `<h4>Seen from orbit today</h4>${photoFig(it.orbit)}` : ''))}
      ${fold(esc(missionOf(it.name)) + ' and what it found', `<p>${esc(it.why)}</p><p>${esc(it.science)}</p>${it.lastWords && !it.fate ? `<h4>Its last day</h4><p>${esc(it.lastWords)}</p>` : ''}`)}
      ${fold('More about the mission', learnMore(LINKS[it.id]))}
      ${src}`;
  }
  // Long sections fold away so the page reads: status, numbers, what happened, then extras on demand.
  const fold = (title, body) => body && body.replace(/<[^>]*>/g, '').trim() ? `<details class="fold"><summary>${title}</summary>${body}</details>` : '';
  // "At a glance": a few big numbers a kid can compare, instead of a list of fields.
  function glance(it, st, end) {
    const start = born(it); if (!start) return '';
    const stop = st === 'alive' || st === 'echo' ? NOW : end ? new Date(String(end).slice(0, 10)) : null;
    const days = stop ? (stop - new Date(String(start).slice(0, 10))) / 864e5 : null;
    const tile = (k, v, n, cls = '') => `<div class="stat${cls}"><span class="k">${k}</span><span class="v">${v}</span>${n ? `<span class="n">${n}</span>` : ''}</div>`;
    const when = `${fmt(start)} – ${st === 'alive' || st === 'echo' ? 'today' : fmt(end)}`;
    const t = [];
    if (days != null) t.push(tile(st === 'echo' ? 'Working unpowered for' : st === 'alive' ? 'Working for' : 'Worked for', esc(span(days)), esc(when)));
    else t.push(tile(it.arrived ? 'Arrived' : 'Launched', esc(fmt(start)), ''));
    if (end && st === 'silent') t.push(tile('Silent for', esc(span((NOW - new Date(String(end).slice(0, 10))) / 864e5)), `Last heard ${esc(fmt(end))}`));
    if (Number.isFinite(it.distance_au)) t.push(tile('From the Sun', `${it.distance_au.toFixed(1)}<small> AU</small>`, Number.isFinite(it.lightTime_hours) ? `A radio hello takes ${it.lightTime_hours.toFixed(1)} h one way` : ''));
    if (Number.isFinite(it.mass_kg)) t.push(tile('Mass', `${it.mass_kg.toLocaleString('en-US')}<small> kg</small>`, ''));
    let drove = '';
    if (Number.isFinite(it.distance_km) && it.distance_km > 0) {
      const M = 42.195, km = it.distance_km, full = Math.max(km, M), m = km / M;
      drove = `<div class="stat wide"><span class="k">${/helicopter/i.test(it.type) ? 'Flew' : 'Drove'}</span><span class="v">${km.toLocaleString('en-US')}<small> km</small></span>
        <div class="meter" role="img" aria-label="${km} km, ${m.toFixed(2)} of a marathon"><b style="width:${(km / full * 100).toFixed(1)}%"></b><i style="left:${(M / full * 100).toFixed(1)}%"></i></div>
        <span class="n">${m >= 1 ? `${m.toFixed(1)} marathons` : `${Math.round(m * 100)}% of a marathon`} · the line marks one marathon (42.2 km)</span></div>`;
    }
    const where = Number.isFinite(it.lat) ? `<p class="where">Where it is: <span class="coord">${Math.abs(it.lat).toFixed(2)}°${it.lat >= 0 ? 'N' : 'S'} ${Math.abs(it.lon).toFixed(2)}°${it.lon >= 0 ? 'E' : 'W'}</span></p>` : '';
    return `<div class="glance" aria-label="At a glance" role="group">${t.join('')}${drove}</div>${where}`;
  }
  function intro() {
    const list = DATA[world], alive = list.filter(it => stateAt(it, 2026) === 'alive').length;
    const echo = list.filter(it => stateAt(it, 2026) === 'echo').length;
    return `<div class="intro"><p class="eyebrow">Welcome to ${esc(WORLDS[world].name)}</p>
      <p class="big">${list.length}</p><p>space objects on this map. ${alive} still send data home${echo ? `, and ${echo} silent mirrors still get used by scientists every week` : ''}.</p>
      <p>${esc(WORLDS[world].intro)}</p><p>Click a dot, or pick a name from the list below.</p></div>`;
  }
  function paint() {
    for (const p of pins) {
      // A site shows its liveliest machine; the pin's shape repeats the state so it isn't colour alone.
      p.state = p.items.map(it => stateAt(it, year)).sort((a, b) => RANK[b] - RANK[a])[0];
      p.el.style.setProperty('--c', COLOR[p.state]);
      p.el.classList.remove('alive', 'echo', 'silent'); p.el.classList.add(p.state);
      p.el.classList.toggle('sel', p.items.some(it => it.id === selected));
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
    pins.forEach(p => p.el.classList.toggle('seen', p.items.every(it => seen.has(it.id))));
    const full = complete();
    pins.forEach(p => p.el.classList.toggle('complete', p.items.every(it => full.has(it.id))));
    $('beyond').querySelectorAll('.craft').forEach(g => g.classList.toggle('complete', full.has(g.dataset.id)));
    document.querySelectorAll('#list button').forEach(b => b.classList.toggle('complete', full.has(b.dataset.id)));
    $('beyond').querySelectorAll('.craft').forEach(g => g.classList.toggle('seen', seen.has(g.dataset.id)));
    document.querySelectorAll('#list button').forEach(b => b.classList.toggle('seen', seen.has(b.dataset.id)));
    showExplored();
    $('yearOut').value = year;
    const list = DATA[world], here = list.filter(it => stateAt(it, year) !== 'future');
    const talking = here.filter(it => stateAt(it, year) === 'alive').length;
    $('yearNote').textContent = here.length
      ? `In ${year}: ${here.length} space object${here.length === 1 ? '' : 's'} had reached ${WORLDS[world].name}, ${talking} still talking.`
      : `In ${year}: nothing from NASA had reached ${WORLDS[world].name} yet.`;
    $('cursor').style.left = `calc(var(--lw) + (100% - var(--lw)) * ${(yPct(year + 0.5) / 100).toFixed(4)} - 1px)`;
  }
  const byId = id => DATA[world].find(it => it.id === id);
  // "You've explored 12 of 79": one bar for everything, and a count per world.
  function showExplored() {
    const box = $('explored'); if (!box) return;
    const names = { moon: 'Moon', mars: 'Mars', beyond: 'Deep space' };
    const per = Object.keys(DATA).map(w => [w, DATA[w].filter(it => seen.has(it.id)).length, DATA[w].length]);
    const done = per.reduce((s, x) => s + x[1], 0), all = per.reduce((s, x) => s + x[2], 0);
    if (!all) return;
    const full = [...complete()].filter((id) => Object.values(DATA).some((l) => l.some((it) => it.id === id))).length;
    $('exploredText').textContent = (done ? `You've opened ${done} of ${all} space objects` : `You've opened 0 of ${all} space objects. Click a dot to start.`) + (full ? ` · fully explored ${full}` : '');
    const bar = $('exploredBar'); bar.setAttribute('aria-valuenow', done); bar.setAttribute('aria-valuemax', all);
    bar.querySelector('b').style.width = `${(done / all * 100).toFixed(1)}%`;
    $('exploredWorlds').innerHTML = per.map(([w, d, n]) => `<span${w === world ? ' class="here"' : ''}>${names[w]} <b>${d}/${n}</b>${d === n ? ' ' + ICON.check : ''}</span>`).join('');
    $('exploredReset').hidden = !done;
  }
  function buildTimeline() {
    const box = $('lives'); box.querySelectorAll('.life').forEach(n => n.remove());
    let tip = box.querySelector('.lifetip');
    if (!tip) { tip = document.createElement('span'); tip.className = 'lifetip'; tip.hidden = true; tip.setAttribute('aria-hidden', 'true'); box.appendChild(tip); }
    const pct = d => yPct(yr(d) + ((+String(d).slice(5, 7) || 7) - 1) / 12);
    [...DATA[world]].filter(born).sort((a, b) => String(born(a)).localeCompare(String(born(b)))).forEach(it => {
      const row = document.createElement('div'); row.className = 'life';
      const a = pct(born(it)), e = activeNow(it) || /reflector/i.test(it.type) ? 100 : died(it) ? pct(died(it)) : a;
      const label = `${it.name.replace(/\s*\(.*?\)\s*/g, ' ').trim()} · ${yrs(it)}`;
      // Every lane is named, with a dot where it landed (or launched): no hovering needed to see what's what.
      row.innerHTML = `<b data-id="${esc(it.id)}" role="button" tabindex="0" aria-label="${esc(label)}" style="left:${a}%;width:${Math.max(0, e - a)}%"></b><span class="lname" aria-hidden="true">${esc(label.split(' · ')[0])}</span>`;
      row.querySelector('.lname').onclick = () => select(it.id);
      const b = row.firstChild;
      b.onclick = () => select(it.id);
      b.onkeydown = ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); select(it.id); } };
      const show = () => { tip.textContent = label; tip.style.top = `${row.offsetTop}px`; tip.style.left = `calc(var(--lw) + (100% - var(--lw)) * ${(Math.min(a, 70) / 100).toFixed(3)})`; tip.hidden = false; };
      b.onpointerenter = show; b.onfocus = show; b.onpointerleave = b.onblur = () => { tip.hidden = true; };
      box.appendChild(row);
    });
    buildRoster();
  }
  // Moon/Mars machines are grouped by what happened to them; deep space stays a flat list.
  function buildRoster() {
    const ul = $('list'), list = DATA[world], grouped = list.some(it => it.fate);
    ul.innerHTML = ''; ul.className = grouped ? 'groups' : '';
    const go = id => { select(id); $('dossier').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' }); };
    $('rosterTitle').textContent = grouped ? `What happened to every space object on ${WORLDS[world].name}` : `Every space object on ${WORLDS[world].name}`;
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
          <div class="grows">${groups[k].map(it => `<button type="button" class="grow" data-id="${esc(it.id)}"><span class="gname">${esc(it.name)}</span><span class="glabel">${esc(it.fate?.label || it.status)}</span><span class="gyrs">${esc(yrs(it))}</span></button>`).join('')}</div>`;
        ul.appendChild(li);
      }
    }
    ul.querySelectorAll('button').forEach(b => b.onclick = () => go(b.dataset.id));
  }
  function select(id) {
    const it = byId(id);
    selected = it ? id : null;
    if (it && !seen.has(id)) { seen.add(id); saveSeen(); }
    stopLive();
    $('dossier').innerHTML = it ? dossier(it) : intro();
    $('announce').textContent = it ? `Opened ${it.name}` : `Showing ${WORLDS[world].name}`;
    stopLive = it && LIVE[it.id] ? startLive($('dossier'), LIVE[it.id]) || (() => {}) : () => {};
    $('dossier').scrollTop = 0;
    $('dossier').querySelector('[data-walk]')?.addEventListener('click', e => openGround(e.currentTarget.dataset.walk));
    if (it) geologyOf(id).then(g => { const w = g && selected === id && $('dossier').querySelector('[data-walk]'); if (w) w.insertAdjacentHTML('afterend', `<p class="geo"><i style="background:${hexOk(g.color)}"></i><b>Ground:</b> ${geoName(g)}. ${esc(g.kidText)} <span class="credit">USGS geologic map of Mars, Tanaka et al. 2014</span></p>`); });
    if (it) mountModel(modelKeyFor(it), it); else mv.key = null;
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
    cv.hidden = deep; $('pins').hidden = deep; $('gZoom').hidden = deep; $('fly3d').hidden = !deep; $('beyond').toggleAttribute('hidden', !deep); // SVG has no .hidden property
    $('hint').textContent = deep ? 'Directions and distances are approximate' : 'Drag to spin · +/− or Ctrl + scroll to zoom';
    buildTimeline();
    if (deep) { pins = []; drawBeyond(); } else { setTexture(w); buildPins(); }
    syncGeo();
    if (!keepSel) { select(null); history.replaceState(null, '', '#' + w); }
  }
  document.querySelectorAll('.worlds button').forEach(b => b.onclick = () => setWorld(b.dataset.world));
  $('year').oninput = e => { year = +e.target.value; stopPlay(); paint(); };
  let timer = null;
  function stopPlay() { clearInterval(timer); timer = null; $('play').innerHTML = `${ICON.play} Play history`; }
  $('exploredReset').onclick = () => { if (confirm('Clear the list of space objects you have explored?')) { seen.clear(); saveSeen(); paint(); } };
  $('play').onclick = () => {
    if (timer) return stopPlay();
    if (year >= 2026) year = 1959;
    $('play').innerHTML = `${ICON.pause} Pause`;
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
  if (G.R && (Math.abs(x) > G.ext[0] / 2 || Math.abs(z) > G.ext[1] / 2)) return (regionAt(x, z) ?? edgeFalloff(x, z)) - (x * x + z * z) / (2 * G.R); // curved ground beyond the tile
    const n = G.n, u = Math.max(0, Math.min(n - 1.001, (x / G.ext[0] + 0.5) * (n - 1))), v = Math.max(0, Math.min(n - 1.001, (z / G.ext[1] + 0.5) * (n - 1)));
    const c = u | 0, r = v | 0, fx = u - c, fy = v - r, i = r * n + c, H = G.h;
    return ((H[i] * (1 - fx) + H[i + 1] * fx) * (1 - fy) + (H[i + n] * (1 - fx) + H[i + n + 1] * fx) * fy) * G.exag;
  }
  // Regional elevation (optional region.png / far.png per site, Terrarium, same local frame as the tile).
async function loadGrid(url) {
  try {
    const img = new Image(); img.src = url; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, img.width, img.height).data, n = Math.min(img.width, img.height), h = new Float32Array(n * n);
    for (let r = 0; r < n; r++) for (let q = 0; q < n; q++) { const k = (r * img.width + q) * 4; h[r * n + q] = d[k] * 256 + d[k + 1] + d[k + 2] / 256 - 32768; }
    return { h, n };
  } catch { return null; }
}
async function loadRegion(base) {
  try {
    const j = await fetch(base + 'region.json').then(r => { if (!r.ok) throw 0; return r.json(); });
    const [g, far] = await Promise.all([loadGrid(base + 'region.png'), loadGrid(base + 'far.png')]);
    return g ? { g, ext: j.extent_m.map(Number), far, farExt: (j.far_extent_m || []).map(Number), src: j.source } : null;
  } catch { return null; }
}
function gridAt(g, ext, x, z) { // bilinear sample; x east, z south (metres from the site centre); null outside
  if (!g || !ext?.[0]) return null;
  const n = g.n, u = (x / ext[0] + 0.5) * (n - 1), v = (z / ext[1] + 0.5) * (n - 1);
  if (!(u >= 0 && v >= 0 && u <= n - 1.001 && v <= n - 1.001)) return null;
  const c = u | 0, r = v | 0, fx = u - c, fy = v - r, i = r * n + c, H = g.h;
  return (H[i] * (1 - fx) + H[i + 1] * fx) * (1 - fy) + (H[i + n] * (1 - fx) + H[i + n + 1] * fx) * fy;
}
// Fallback outside the tile: continue the nearest tile-edge height and ease it to the edge average over ~3 km (no fake cliffs).
function edgeFalloff(x, z) {
  const hx = G.ext[0] / 2 - 0.5, hz = G.ext[1] / 2 - 0.5, cx = Math.max(-hx, Math.min(hx, x)), cz = Math.max(-hz, Math.min(hz, z));
  const w = Math.exp(-Math.hypot(x - cx, z - cz) / 3000), eh = hAt(cx, cz);
  return (G.edgeY || 0) + (eh - (G.edgeY || 0)) * w;
}
const regionAt = (x, z) => G.region ? (gridAt(G.region.g, G.region.ext, x, z) ?? gridAt(G.region.far, G.region.farExt, x, z)) : null;
// Real orbital imagery beyond the sharp tile, streamed from NASA Trek (equirectangular WMTS: 2^(z+1) x 2^z tiles of 256 px,
// top-left -180/90). Each ring is one stitched canvas on a curved plane, so the planet falls away to a real horizon.
// Mars: the Caltech Murray Lab CTX global mosaic (~5 m/px, greyscale, 512 px tiles, same grid) is laid over Viking colour with a
// 'luminosity' blend, so Mars stays Mars-coloured; where a CTX tile is missing the Viking colour shows through.
const TREK = {
  mars: { layer: 'Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m', zmax: 7, R: 3389500, tint: 0xffb68a, rings: [5000, 20000, 60000, 210000], credit: 'NASA/USGS Viking MDIM 2.1 colour mosaic via NASA Mars Trek (public domain)',
    sharp: { url: (z, y, x) => `https://astro.arcgis.com/arcgis/rest/services/OnMars/CTX/MapServer/tile/${z}/${y}/${x}`, zmax: 12, credit: 'MRO CTX global mosaic beta01, ~5 m/px: NASA/JPL/MSSS/The Caltech Murray Lab/Esri (free use for all purposes), via NASA Mars Trek' } },
  moon: { layer: 'Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02', zmax: 8, R: 1737400, tint: 0xffffff, rings: [30000, 105000], credit: 'NASA/GSFC/ASU LRO WAC mosaic via NASA Moon Trek (public domain)' },
};
const loadImg = src => { const img = new Image(); img.crossOrigin = 'anonymous'; img.src = src; return img.decode().then(() => img, () => null); };
async function surroundRing(T, lat0, lon0, halfM, yOff, order, hfn, holeHalf) {
  const kx = T.R * Math.cos(lat0 * D) * D, ky = T.R * D, S = T.sharp, P = S ? 512 : 256;
  const dLat = halfM / ky, dLon = Math.min(179, halfM / Math.max(kx, 1));
  const z = Math.max(0, Math.min(S ? S.zmax : T.zmax, Math.floor(Math.log2(720 / (2 * Math.max(dLat, dLon)))))); // ~4 tiles across: sharp near, cheap far
  const tdeg = 180 / 2 ** z, cols = 2 ** (z + 1), rows = 2 ** z;
  const x0 = Math.floor((lon0 - dLon + 180) / tdeg), x1 = Math.floor((lon0 + dLon + 180) / tdeg);
  const y0 = Math.max(0, Math.floor((90 - (lat0 + dLat)) / tdeg)), y1 = Math.min(rows - 1, Math.floor((90 - (lat0 - dLat)) / tdeg));
  const nx = x1 - x0 + 1, ny = y1 - y0 + 1;
  if (nx * ny > 36) return null; // near the poles longitude explodes: skip rather than download half the planet
  const west = x0 * tdeg - 180, east = (x1 + 1) * tdeg - 180, north = 90 - y0 * tdeg, south = 90 - (y1 + 1) * tdeg;
  const cnv = document.createElement('canvas'); cnv.width = nx * P; cnv.height = ny * P;
  const ctx = cnv.getContext('2d'); ctx.fillStyle = '#1a120d'; ctx.fillRect(0, 0, cnv.width, cnv.height);
  const ppd = P / tdeg, zv = Math.min(T.zmax, z), tv = 180 / 2 ** zv, cv = 2 ** (zv + 1), jobs = []; // Viking colour layer, scaled into this canvas
  for (let y = Math.floor((90 - north) / tv); y <= Math.min(2 ** zv - 1, Math.floor((90 - south - 1e-9) / tv)); y++) for (let x = Math.floor((west + 180) / tv); x <= Math.floor((east + 180 - 1e-9) / tv); x++) jobs.push(
    loadImg(`https://trek.nasa.gov/tiles/${T.layer}/1.0.0/default/default028mm/${zv}/${y}/${((x % cv) + cv) % cv}.jpg`).then(img => img && ctx.drawImage(img, (x * tv - 180 - west) * ppd, (north - (90 - y * tv)) * ppd, tv * ppd, tv * ppd)));
  const sharp = [];
  if (S) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) sharp.push(loadImg(S.url(z, y, ((x % cols) + cols) % cols)).then(img => [img, x, y]));
  await Promise.all(jobs);
  ctx.globalCompositeOperation = 'luminosity';
  for (const [img, x, y] of await Promise.all(sharp)) if (img) ctx.drawImage(img, (x - x0) * P, (y - y0) * P, P, P);
  const geo = new THREE.PlaneGeometry((east - west) * kx, (north - south) * ky, 220, 220);
  geo.rotateX(-Math.PI / 2); geo.translate(((west + east) / 2 - lon0) * kx, 0, -((north + south) / 2 - lat0) * ky);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) { const X = pos.getX(i), Z = pos.getZ(i); pos.setY(i, (hfn ? hfn(X, Z) ?? yOff : yOff) - (X * X + Z * Z) / (2 * T.R)); }
  geo.computeVertexNormals();
  const tex = new THREE.CanvasTexture(cnv); tex.encoding = THREE.sRGBEncoding; tex.anisotropy = 8;
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0, color: T.tint, polygonOffset: true, polygonOffsetFactor: order, polygonOffsetUnits: order }));
  // Cut a hole where the sharp tile (or the next ring in) is, so a coarser ring never pokes up through finer ground.
  const hole = new THREE.Vector2(...holeHalf);
  m.material.onBeforeCompile = sh => {
    sh.uniforms.holeHalf = { value: hole };
    sh.vertexShader = 'varying vec2 vHoleXZ;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vHoleXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
    sh.fragmentShader = 'uniform vec2 holeHalf;\nvarying vec2 vHoleXZ;\n' + sh.fragmentShader.replace('void main() {', 'void main() {\n  if (abs(vHoleXZ.x) < holeHalf.x && abs(vHoleXZ.y) < holeHalf.y) discard;');
  };
  m.renderOrder = -order; return m;
}
async function addSurround(meta) {
  const T = TREK[meta.world], c = meta.center;
  if (!T || !Array.isArray(c)) return;
  // Sit the surround just under the tile's edge so the sharp tile always wins.
  G.surroundY = (G.edgeY || 0) - 0.4; G.R = T.R; G.surroundHalf = meta.world === 'mars' ? 60000 : 30000;
  const scene = G.scene;
  let hole = [G.ext[0] / 2 - 1, G.ext[1] / 2 - 1];
  for (const [i, half] of T.rings.entries()) { // each ring fills the hole of the next one out; outer rings sit a few metres lower where they overlap
    const sink = i * 3, order = 2 + i;
    const hfn = (X, Z) => (regionAt(X, Z) ?? edgeFalloff(X, Z)) - sink - 0.4;
    const ring = await surroundRing(T, +c[0], +c[1], half, G.surroundY - sink, order, hfn, hole);
    if (G.scene !== scene) return;
    if (ring) { scene.add(ring); hole = [half, half]; }
  }
  $('gCredit').querySelector('details')?.insertAdjacentHTML('beforeend', `<br>Surrounding area: ${T.sharp ? esc(T.sharp.credit) + ', coloured with ' : ''}${esc(T.credit)}${G.region?.src ? ` · regional elevation: ${esc(G.region.src.credit || '')} ${G.region.src.product ? '(' + esc(G.region.src.product) + ')' : ''}` : ''}`);
}
const flyMax = () => G.surroundHalf ? Math.min(15000, (G.surroundHalf * 3.5 * 0.85) ** 2 / (2 * G.R)) : Math.max(...G.ext) * 0.6; // above this you'd see the imagery's edge
// ---- Close-up ground realism: a tiling regolith detail texture and an instanced rock field around the walker ----
const hash3 = (i, j, k) => { let n = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(k, 1442695041); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967295; };
let detailTex = null;
function getDetailTex() { // seamless fractal value noise + pebble specks, centred on mid-grey so it modulates rather than recolours
  if (detailTex) return detailTex;
  const S = 512, c = document.createElement('canvas'); c.width = c.height = S;
  const ctx = c.getContext('2d'), img = ctx.createImageData(S, S), v = new Float32Array(S * S);
  for (const [cells, amp] of [[8, 0.45], [16, 0.28], [32, 0.16], [64, 0.1], [128, 0.06]]) {
    const step = S / cells, sm = t => t * t * (3 - 2 * t);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const gx = x / step, gy = y / step, x0 = Math.floor(gx), y0 = Math.floor(gy), fx = sm(gx - x0), fy = sm(gy - y0);
      const g = (a, b) => hash3(((a % cells) + cells) % cells, ((b % cells) + cells) % cells, cells);
      v[y * S + x] += amp * ((g(x0, y0) * (1 - fx) + g(x0 + 1, y0) * fx) * (1 - fy) + (g(x0, y0 + 1) * (1 - fx) + g(x0 + 1, y0 + 1) * fx) * fy - 0.5);
    }
  }
  for (let i = 0; i < 2600; i++) { // pebbles: small dark blobs with a lit edge
    const px = hash3(i, 7, 1) * S, py = hash3(i, 7, 2) * S, r = 0.8 + 3.5 * hash3(i, 7, 3) ** 3;
    for (let y = Math.floor(py - r - 1); y <= py + r + 1; y++) for (let x = Math.floor(px - r - 1); x <= px + r + 1; x++) {
      const d = Math.hypot(x - px, y - py) / r; if (d > 1) continue;
      const k = (((y % S) + S) % S) * S + (((x % S) + S) % S); v[k] += (y < py ? 0.12 : -0.22) * (1 - d);
    }
  }
  for (let i = 0; i < S * S; i++) { const g = Math.max(0, Math.min(255, 128 + v[i] * 230)); img.data.set([g, g, g, 255], i * 4); }
  ctx.putImageData(img, 0, 0);
  detailTex = new THREE.CanvasTexture(c); detailTex.wrapS = detailTex.wrapT = THREE.RepeatWrapping; detailTex.anisotropy = 8;
  return detailTex;
}
function addGroundDetail(mat) { // two scales of detail near the viewer (fades out by ~350 m) on top of the orbital image
  mat.onBeforeCompile = sh => {
    sh.uniforms.detailMap = { value: getDetailTex() };
    sh.uniforms.detailRep = { value: new THREE.Vector2(G.ext[0] / 4, G.ext[1] / 4) };
    sh.vertexShader = 'varying float vDist;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  vDist = -mvPosition.z;');
    sh.fragmentShader = 'uniform sampler2D detailMap;\nuniform vec2 detailRep;\nvarying float vDist;\n' + sh.fragmentShader.replace('#include <map_fragment>',
      '#include <map_fragment>\n  float dFade = clamp(1.0 - vDist / 350.0, 0.0, 1.0);\n  vec3 dA = texture2D(detailMap, vUv * detailRep).rgb, dB = texture2D(detailMap, vUv * detailRep * 6.7).rgb;\n  diffuseColor.rgb *= mix(vec3(1.0), (dA * 0.55 + dB * 0.45) * 2.0, 0.65 * dFade);');
  };
}
const ROCK_MAX = 2600, ROCK_R = 150, ROCK_CELL = 3;
function makeRocks(world) {
  const geo = new THREE.IcosahedronGeometry(1, 1), pos = geo.attributes.position; // lumpy, irregular rock
  for (let i = 0; i < pos.count; i++) { const k = 0.72 + 0.5 * hash3(Math.round(pos.getX(i) * 97), Math.round(pos.getY(i) * 89), Math.round(pos.getZ(i) * 83)); pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k * 0.8, pos.getZ(i) * k); }
  geo.computeVertexNormals();
  const col = { mars: 0x7e4f35, moon: 0x77746f }[world] || 0x5d5a57;
  const m = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: col, roughness: 0.95, flatShading: true }), ROCK_MAX);
  m.count = 0; m.frustumCulled = false; G.rockAt = null; G.rockDensity = world === 'mars' ? 0.3 : world === 'moon' ? 0.2 : 0.12;
  return m;
}
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
function scatterRocks(cx, cz) { // deterministic per 3 m cell, so the same spot always has the same rocks
  const R = G.rocks; if (!R) return;
  let k = 0;
  const i0 = Math.floor((cx - ROCK_R) / ROCK_CELL), i1 = Math.floor((cx + ROCK_R) / ROCK_CELL), j0 = Math.floor((cz - ROCK_R) / ROCK_CELL), j1 = Math.floor((cz + ROCK_R) / ROCK_CELL);
  for (let i = i0; i <= i1 && k < ROCK_MAX; i++) for (let j = j0; j <= j1 && k < ROCK_MAX; j++) {
    if (hash3(i, j, 1) > G.rockDensity) continue;
    const x = (i + hash3(i, j, 2)) * ROCK_CELL, z = (j + hash3(i, j, 3)) * ROCK_CELL;
    if (Math.hypot(x - cx, z - cz) > ROCK_R) continue;
    const sz = 0.05 + 1.3 * hash3(i, j, 4) ** 7; // mostly pebbles, a few boulders
    _e.set(hash3(i, j, 5) * 6.28, hash3(i, j, 6) * 6.28, hash3(i, j, 7) * 6.28); _q.setFromEuler(_e);
    _s.set(sz * (0.7 + 0.6 * hash3(i, j, 8)), sz * (0.45 + 0.4 * hash3(i, j, 9)), sz * (0.7 + 0.6 * hash3(i, j, 10)));
    _p.set(x, hAt(x, z) + sz * 0.12, z); _m4.compose(_p, _q, _s); R.setMatrixAt(k++, _m4);
  }
  R.count = k; R.instanceMatrix.needsUpdate = true; G.rockAt = [cx, cz];
}
function groundGeometry() {
    const n = G.n, seg = Math.min(511, n - 1), step = (n - 1) / seg; // full height-map resolution so small craters survive
    const geo = new THREE.PlaneGeometry(G.ext[0], G.ext[1], seg, seg), pos = geo.attributes.position;
    for (let r = 0; r <= seg; r++) for (let c = 0; c <= seg; c++) pos.setZ(r * (seg + 1) + c, G.h[Math.round(r * step) * n + Math.round(c * step)] * G.exag);
    geo.rotateX(-Math.PI / 2); geo.computeVertexNormals();
    return geo;
  }
  function labelSprite(text, color) {
    const c = document.createElement('canvas'), x = c.getContext('2d'), f = `600 28px ${getComputedStyle(document.documentElement).getPropertyValue('--mono').trim() || 'monospace'}`;
    x.font = f; const w = Math.ceil(x.measureText(text).width) + 28; c.width = w; c.height = 46;
    x.font = f; x.fillStyle = 'rgba(18,21,27,.92)'; x.fillRect(0, 0, w, 46); x.fillStyle = color; x.fillRect(0, 0, 6, 46);
    x.fillStyle = '#f3f5f8'; x.textBaseline = 'middle'; x.fillText(text, 16, 24);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), sizeAttenuation: false, depthTest: false }));
    s.scale.set(0.045 * w / 46, 0.045, 1); s.renderOrder = 9; return s;
  }
  function placeMachines() {
    const span = Math.max(...G.ext);
    for (const p of G.meta.places || []) {
      const it = byId(p.id); if (!it || !Number.isFinite(+p.x_m) || !Number.isFinite(+p.y_m)) continue;
      const x = +p.x_m, z = -p.y_m, y = hAt(x, z), col = getComputedStyle(document.documentElement).getPropertyValue(stateAt(it, 2026) === 'alive' ? '--signal' : stateAt(it, 2026) === 'echo' ? '--echo' : '--quiet').trim() || '#6b7280';
      const g = new THREE.Group(); g.position.set(x, y, z); G.scene.add(g); G.extras.push(g);
      const beamH = Math.max(25, span * 0.02);
      // 1-px marker line: findable from far away, never blocks the view up close
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, beamH, 0)]), new THREE.LineBasicMaterial({ color: col })));
      const lab = labelSprite(String(it.name).replace(/\s*\(.*?\)/g, ''), col); lab.position.y = beamH * 1.05; g.add(lab);
      const key = modelKeyFor(it), crashed = /impact|crash/i.test(it.type) || /crash|smash|plunge|impact/i.test(it.status || ''); // wrecks get a crater ring, not an intact model
      if (key && gltfLoader && !crashed) gltfLoader.load(MODELS[key].file, m => {
        const o = m.scene, box = new THREE.Box3().setFromObject(o), size = box.getSize(new THREE.Vector3()).length() || 1;
        o.scale.setScalar((REAL_SIZE[key] || +MODELS[key]?.size_m || 3) / size);
        const b2 = new THREE.Box3().setFromObject(o); o.position.y -= b2.min.y; o.position.x -= (b2.min.x + b2.max.x) / 2; o.position.z -= (b2.min.z + b2.max.z) / 2;
        tintFault(o, it, G.faults || (G.faults = []));
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
  const col = getComputedStyle(document.documentElement).getPropertyValue('--signal').trim() || '#4d94ff';
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
      const region = TREK[meta.world] ? await loadRegion(base) : null;
    if (TREK[meta.world]) { // blend the tile's border into the surrounding ground (regional elevation if we have it, else flat)
      let sum = 0; for (let i = 0; i < n; i++) sum += H[i] + H[(n - 1) * n + i] + H[i * n] + H[i * n + n - 1];
      const edgeY = sum / (4 * n), band = (n - 1) * 0.06;
      const ex = (meta.extent_m || [1000, 1000]).map(Number);
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) { const e = Math.min(r, c, n - 1 - r, n - 1 - c) / band; if (e < 1 && region) { const t = e * e * (3 - 2 * e);
        const tgt = region ? gridAt(region.g, region.ext, (c / (n - 1) - 0.5) * ex[0], (r / (n - 1) - 0.5) * ex[1]) ?? edgeY : edgeY;
        H[r * n + c] = tgt + (H[r * n + c] - tgt) * t; } }
      G.edgeY = edgeY;
    }
    Object.assign(G, { region, R: 0, surroundY: 0, surroundHalf: 0, meta, h: H, n, ext: (meta.extent_m || [1000, 1000]).map(Number), exag: 1, fly: false, goal: null, jump: 0, vy: 0, hop: false, extras: [] });
      if (!G.r) {
        G.r = new THREE.WebGLRenderer({ canvas: $('groundCv'), antialias: true, logarithmicDepthBuffer: true });
        G.r.outputEncoding = THREE.sRGBEncoding; G.r.setPixelRatio(Math.min(devicePixelRatio, 2));
        bindGroundControls();
      }
      const span = Math.max(...G.ext), mars = meta.world === 'mars' || /orange/.test(meta.sky || '');
      G.scene = new THREE.Scene();
      G.scene.background = new THREE.Color(mars ? 0xc8a07c : 0x000000);
      if (mars) G.scene.fog = new THREE.Fog(0xc8a07c, 25000, 190000);
      G.cam = new THREE.PerspectiveCamera(62, 1, 0.3, 600000);
      const tex = new THREE.TextureLoader().load(base + 'color.jpg'); tex.encoding = THREE.sRGBEncoding; tex.anisotropy = 8;
      G.mesh = new THREE.Mesh(groundGeometry(), new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0, color: mars ? 0xff7a38 : 0xffffff }));
      addGroundDetail(G.mesh.material);
    G.scene.add(G.mesh);
    G.rocks = makeRocks(meta.world); G.scene.add(G.rocks);
      const az = (Number.isFinite(meta.sunAzimuth_deg) ? meta.sunAzimuth_deg : 135) * D, el = (Number.isFinite(meta.sunElevation_deg) ? meta.sunElevation_deg : mars ? 24 : 14) * D; // low sun when unknown: relief and crater shadows read clearly
      const sunL = new THREE.DirectionalLight(0xfff4e6, mars ? 1.35 : 1.6); sunL.position.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)); G.scene.add(sunL);
      G.scene.add(new THREE.HemisphereLight(mars ? 0xffc9a0 : 0x8890a0, 0x3a2014, mars ? 0.7 : 0.18));
      // No stars on the sunlit Moon: like the Apollo photos, an eye or camera set for bright ground can't see them.
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
      if (!$('gGeo')) $('gHelp').insertAdjacentHTML('beforebegin', '<p class="gnote ggeo" id="gGeo" hidden></p>');
      $('gGeo').hidden = true;
      geologyOf(id).then(g => { if (!g || G.meta !== meta) return; $('gGeo').innerHTML = `<i style="background:${hexOk(g.color)}"></i><b>Ground:</b> ${geoName(g)}. ${esc(g.kidText)}`; $('gGeo').hidden = false;
        $('gCredit').querySelector('details')?.insertAdjacentHTML('beforeend', `<br>Geology: ${esc(g.source.title)}, ${esc(g.source.credit)} (${esc(g.source.license)})`); });
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
      if (far.length) $('gGo').insertAdjacentHTML('beyond' === world ? 'beforeend' : 'beforeend', `<details class="gfarbox"><summary class="gbtn">Elsewhere on ${esc(WORLDS[world].name)} (${far.length}) ${ICON.more}</summary><div class="gfarlist">` + far.map(({ o, km }) =>
        `<button class="gbtn gfar" type="button" data-travel="${esc(o.id)}" title="Not on this map: travel to its site">${esc(String(o.name).replace(/\s*\(.*?\)/g, ''))} <span>${km < 10 ? km.toFixed(1) : Math.round(km).toLocaleString()} km ${ICON.external}</span></button>`).join('') + '</div></details>');
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
  G.x = G.target[0]; G.z = G.target[1]; G.goal = null; G.jump = 0; G.vy = 0; G.hop = false; G.pitch = 0; G.yaw = -((az0 + hf / 2) * D);
  $('gHelp').innerHTML = `${esc(pano.caption || 'Real photo taken here')}${pano.taken ? ' · ' + esc(pano.taken) : ''} · <span class="credit">${esc(pano.credit || '')}${pano.license ? ' · ' + link(pano.licenseUrl, esc(pano.license)) : ''}${httpUrl(pano.source) ? ' · ' + link(pano.source, `source ${ICON.external}`) : ''}${Number.isFinite(+pano.left_azimuth_deg) && pano.left_azimuth_deg !== null ? '' : ' · compass direction approximate'}</span>`;
}
function closeGroundScene() {
    G.pano = null; G.photo = false; if (G.faults) dropFaultMats(G.faults);
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
    if (!G.photo) $('gHelp').textContent = G.look ? 'Mouse to look (move to an edge to keep turning) · W A S D or arrows to walk · tap Space to jump, hold it to fly up, C to go down · click or Esc to stop looking' : G.helpText;
  }
  c.addEventListener('mouseleave', () => { G.mx = 0.5; });
  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === c;
    if (!locked) G.unlockedAt = performance.now();
    c.style.cursor = locked ? 'none' : '';
    if (!G.photo) $('gHelp').textContent = locked ? 'Mouse to look · W A S D or arrows to walk (Shift runs) · tap Space to jump, hold it to fly up, C to go down · Esc to free the mouse' : G.helpText;
  });
    c.addEventListener('pointermove', e => {
      if (!G.drag) return;
      const dx = e.clientX - G.drag.x, dy = e.clientY - G.drag.y; G.drag = { x: e.clientX, y: e.clientY };
      if (G.fly) { G.orbit.yaw -= dx * 0.005; G.orbit.pitch = Math.max(0.08, Math.min(1.45, G.orbit.pitch + dy * 0.005)); }
      else { G.yaw += dx * 0.004; G.pitch = Math.max(-1.3, Math.min(1.3, G.pitch + dy * 0.004)); }
    });
    c.addEventListener('pointerup', () => { G.drag = null; });
    c.addEventListener('wheel', e => { if (!G.fly) return; e.preventDefault(); G.orbit.dist = Math.max(20, Math.min(G.surroundHalf ? G.surroundHalf * 0.6 : Math.max(...G.ext) * 1.5, G.orbit.dist * (1 + e.deltaY * 0.001))); }, { passive: false });
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

  function stepGround(t) {
    const dt = Math.min(0.05, (t - (G.last || t)) / 1000); G.last = t;
    if (!G.scene) return;
    const half = G.surroundHalf ? [G.surroundHalf * 0.95, G.surroundHalf * 0.95] : [G.ext[0] / 2 - 2, G.ext[1] / 2 - 2];
    if (G.fly) {
      const [tx, tz] = G.target, ty = hAt(tx, tz), o = G.orbit;
      G.cam.position.set(tx + Math.sin(o.yaw) * Math.cos(o.pitch) * o.dist, ty + Math.sin(o.pitch) * o.dist, tz + Math.cos(o.yaw) * Math.cos(o.pitch) * o.dist);
      G.cam.lookAt(tx, ty, tz);
    } else {
      const k = G.keys, shift = k.ShiftLeft || k.ShiftRight, fwd = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
      const strafe = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0), turn = (k.ArrowLeft ? 1 : 0) - (k.ArrowRight ? 1 : 0);
    // Shift runs (x5), and the longer Shift and a direction are held, the faster: doubling every second up to x30,
    // eased up and down so it never jerks. Letting go of either resets it.
    G.sprintT = shift && (fwd || strafe) ? (G.sprintT || 0) + dt : 0;
    const sprintGoal = G.sprintT ? Math.min(30, 5 * 2 ** G.sprintT) : 1;
    G.sprint = (G.sprint || 1) + (sprintGoal - (G.sprint || 1)) * (1 - Math.exp(-dt * (sprintGoal > (G.sprint || 1) ? 4 : 8)));
    const run = 5 * G.sprint;
    // Tap Space to hop (real gravity for this world); keep holding past 0.3 s to fly up instead.
    if (k.Space && !G.spaceWas && G.jump <= 0 && !G.photo) { G.vy = 2.6; G.hop = true; } // a hard astronaut hop is ~2.6 m/s
    G.spaceWas = !!k.Space; G.spaceT = k.Space ? (G.spaceT || 0) + dt : 0;
    const lift = (G.spaceT > 0.3 ? 1 : 0) - (k.KeyC || k.KeyQ ? 1 : 0);
    if (lift) { G.hop = false; G.vy = 0; }
    // Flying speeds up the longer a movement key is held (about 2x after 1 s, 6x after 2 s, capped at 25x); walking stays at walking pace.
    G.hold = fwd || strafe || lift ? (G.hold || 0) + dt : 0;
    const boost = (G.jump > 0.5 && !G.hop) || lift ? Math.min(25, 1 + 1.2 * G.hold * G.hold) : 1, spd = run * boost;
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
    if (G.hop) { G.jump += G.vy * dt; G.vy -= Math.max(GRAVITY[world] || 1.62, 0.4) * dt; if (G.jump <= 0) { G.jump = 0; G.vy = 0; G.hop = false; } } // ponytail: floor of 0.4 m/s² so asteroid hops come back down
      if (G.photo) { G.x = G.target[0]; G.z = G.target[1]; G.goal = null; }
    G.cam.position.set(G.x, hAt(G.x, G.z) + EYE + G.jump, G.z);
    if (G.rocks && (!G.rockAt || Math.hypot(G.x - G.rockAt[0], G.z - G.rockAt[1]) > 20)) scatterRocks(G.x, G.z);
    G.pano?.position.copy(G.cam.position);
      G.cam.rotation.order = 'YXZ'; G.cam.rotation.set(G.pitch, G.yaw, 0);
    }
    const head = ((G.fly ? -G.orbit.yaw + Math.PI : -G.yaw) / D % 360 + 360) % 360;
    $('gCompass').textContent = `${['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(head / 45) % 8]} ${Math.round(head)}°${!G.fly && G.sprint > 2 ? ` · ×${Math.round(G.sprint)}` : ''}`;
    G.r.render(G.scene, G.cam);
  }

  // The draggable explorer: drop it near a glowing pin (globe) or craft (deep space).
  const peg = $('peg');
  function nearestWalkable(cx, cy) {
    const els = world === 'beyond' ? [...$('beyond').querySelectorAll('.craft.walk')] : pins.filter(p => p.items.some(x => TERRAIN[x.id]) && !p.el.classList.contains('far')).map(p => p.el);
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
    const id = hit && (hit.dataset.id || pins.find(p => p.el === hit)?.items.find(x => TERRAIN[x.id])?.id);
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
    : '<li class="qnone">No space objects or places match</li>';
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
  ['fsBtn', 'gFs'].forEach(k => { const b = $(k); if (b) { b.innerHTML = on ? `${ICON.exitFullscreen} Exit full screen` : `${ICON.fullscreen} Full screen`; b.setAttribute('aria-pressed', on); } });
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
    loadSalvage().then(s => { SALV = s?.machines || {}; }).catch(() => {}),
    loadPhotosBy().then(p => { PHOTOS_BY = p || {}; }).catch(() => {}),
    loadLive().then(l => { LIVE = l || {}; }).catch(() => {}),
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
