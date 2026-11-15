// Who's exploring: the reading level the "How it worked" sections are written at, remembered in this browser.
// Shared by the tour (React) and the atlas (plain JS). Changing it fires a "gra-level" event on window.
export const LEVELS = [
  { id: 'explorer', label: 'Young explorer' },
  { id: 'student', label: 'Student' },
  { id: 'curious', label: 'High school and curious adults' },
  { id: 'enthusiast', label: 'Space enthusiast' },
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

// "Who's exploring?" free text -> the closest level. Ages and grades first, then words.
/** @type {[string, RegExp][]} */
const WORDS = [
  ['enthusiast', /\b(enthusiast|nerd|geek|engineer|scientist|physicist|astronom|astrophysic|expert|professional|aerospace|phd|graduate|researcher|pilot|rocket|ham radio)/],
  ['explorer', /\b(kid|child|children|little|young|elementary|primary|kindergarten|k-?5|grade school|junior school|first grade|second grade|third grade|fourth grade|fifth grade)/],
  ['curious', /\b(high school|secondary|teen|teenager|college|university|undergrad|adult|parent|teacher|educator|grown.?up|curious|general|beginner|casual|fan|family)/],
  ['student', /\b(middle school|junior high|intermediate|tween|pupil|student|sixth grade|seventh grade|eighth grade)/],
];
/** @param {string} text @returns {string | null} */
export function matchLevel(text) {
  const t = String(text || '').toLowerCase();
  if (!t.trim()) return null;
  const grade = t.match(/\b(?:grade\s*(\d{1,2})|(\d{1,2})(?:st|nd|rd|th)\s*grade|year\s*(\d{1,2}))\b/);
  if (grade) {
    const g = +(grade[1] || grade[2] || grade[3]);
    return g <= 5 ? 'explorer' : g <= 8 ? 'student' : 'curious';
  }
  const age = t.match(/\b(?:i'?m|i am|age|aged)?\s*(\d{1,2})\s*(?:years?|yrs?|yo|y\/o)?\b/);
  if (age && /\d/.test(t) && !/grade|year\s*\d/.test(t)) {
    const a = +age[1];
    if (a >= 3 && a <= 99) return a <= 10 ? 'explorer' : a <= 14 ? 'student' : 'curious';
  }
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
  const cases = { "I'm 8": 'explorer', '4th grade': 'explorer', 'grade 7': 'student', '12 years old': 'student', 'high school student': 'curious', 'teacher': 'curious', 'space nerd': 'enthusiast', 'aerospace engineer': 'enthusiast', 'elementary': 'explorer', 'middle school': 'student', '': null, 'banana': null };
  for (const [k, v] of Object.entries(cases)) if (matchLevel(k) !== v) throw new Error(`matchLevel(${JSON.stringify(k)}) = ${matchLevel(k)}, expected ${v}`);
  console.log('level.js ok');
}
