// Who's exploring: the level the "How it worked" sections are written at, remembered in this browser. Levels go by
// how much you know about space, not age or school year: a young space fan can be a pro.
// Shared by the tour (React) and the atlas (plain JS). Changing it fires a "gra-level" event on window.
// The ids are keys in public/data/science.json and in saved choices, so they stay as they are; only labels changed.
export const LEVELS = [
  { id: 'explorer', label: 'Space beginner', who: 'New to space, simple words' },
  { id: 'student', label: 'Space novice', who: 'Know the basics, ready for more' },
  { id: 'curious', label: 'Space enthusiast', who: 'Real terms, explained' },
  { id: 'enthusiast', label: 'Space pro', who: 'Full technical detail' },
];
const KEY = 'gra-level';
const ids = new Set(LEVELS.map(l => l.id));

/** @returns {string} */
export function getLevel() {
  try {
    const v = localStorage.getItem(KEY);
    if (v && ids.has(v)) return v;
  } catch { /* storage blocked: default level */ }
  return 'student';
}
export function hasChosenLevel() {
  try { return ids.has(localStorage.getItem(KEY)); } catch { return false; }
}
export function setLevel(id) {
  if (!ids.has(id)) return;
  try { localStorage.setItem(KEY, id); } catch { /* lasts this visit */ }
  window.dispatchEvent(new CustomEvent('gra-level', { detail: id }));
}

// "Who's exploring?" free text -> the closest level, by how much space you know. Ages and school years are not
// used: anyone can be a beginner or a pro. Checked in order, so "pro" words win over "enthusiast" words, and so on.
/** @type {[string, RegExp][]} */
const WORDS = [
  ['enthusiast', /\b(pro\b|professional|expert|engineer|scientist|physicist|astronom|astrophysic|aerospace|phd|researcher|pilot|rocket|orbital mechanic|ham radio|work (at|for) nasa)/],
  ['curious', /\b(enthusiast|nerd|geek|fan\b|obsess|love space|amateur|stargaz|telescope|know (a )?lot|lots)/],
  ['explorer', /\b(beginner|new\b|never|nothing|no idea|don'?t know|just curious|first time|starting|curious)/],
  ['student', /\b(novice|basics?|some|a bit|a little|learning|intermediate|okay|ok\b|average|planets)/],
];
/** @param {string} text @returns {string | null} */
export function matchLevel(text) {
  const t = String(text || '').toLowerCase();
  if (!t.trim()) return null;
  for (const [id, re] of WORDS) if (re.test(t)) return id;
  return null;
}

// One delegated listener: any reading-level <select class="sci-level"> on the page changes the level.
if (typeof document !== 'undefined' && !window.__graLevelWired) {
  window.__graLevelWired = true;
  document.addEventListener('change', e => {
    const el = e.target;
    if (el instanceof HTMLSelectElement && el.classList.contains('sci-level')) setLevel(el.value);
  });
}

// Self-check (run: node app/atlas/level.js): free text lands on the expected level.
if (typeof process !== 'undefined' && process.argv?.[1]?.endsWith('level.js')) {
  const cases = { 'brand new to space': 'explorer', 'just curious': 'explorer', 'I know the basics': 'student', 'I know my planets': 'student', 'space nerd': 'curious', 'I have a telescope': 'curious', 'aerospace engineer': 'enthusiast', 'rocket scientist': 'enthusiast', "I'm 8": null, '': null, 'banana': null };
  for (const [k, v] of Object.entries(cases)) if (matchLevel(k) !== v) throw new Error(`matchLevel(${JSON.stringify(k)}) = ${matchLevel(k)}, expected ${v}`);
  console.log('level.js ok');
}
