// "How it worked" for one space object, as HTML: the breakthrough, the hardware and science, tech facts, where the
// technology lives on, and something to try. Shared by the tour's mission file (React) and the atlas dossier.
// Data: public/data/science.json, keyed by atlas id. The base text is the Student level; `levels.<id>` rewrites
// any field for another reading level (same order of tech and facts, same sources).
import { LEVELS } from './level.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const httpUrl = u => /^https?:\/\//.test(u || '');
const cite = s => (s && httpUrl(s.url) ? ` <a class="sci-src" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)} ↗</a>` : '');

let cache = null;
export const loadScience = () => (cache ??= fetch('/data/science.json').then(r => (r.ok ? r.json() : {})).catch(() => ({})));

export function scienceHTML(e, level) {
  if (!e) return '';
  const v = (e.levels && e.levels[level]) || {};
  const tech = e.tech.map((t, i) => ({ ...t, ...(v.tech?.[i] || {}) }));
  const facts = e.facts.map((f, i) => ({ ...f, text: v.facts?.[i] ?? f.text }));
  const legacy = e.legacy && { ...e.legacy, text: v.legacy ?? e.legacy.text };
  const tryIt = v.tryIt ?? e.tryIt;
  const picker = `<label class="sci-pick"><span>Reading level</span><select class="sci-level" aria-label="Reading level">${LEVELS.map(l => `<option value="${l.id}"${l.id === level ? ' selected' : ''}>${esc(l.label)}</option>`).join('')}</select></label>`;
  return `<section class="sci">
    <div class="sci-head"><p class="eyebrow">How it worked</p>${picker}</div>
    <p class="sci-lead">${esc(v.breakthrough ?? e.breakthrough)}</p>
    <ol class="sci-tech">${tech.map(t => `<li><h3>${esc(t.title)}</h3><p>${esc(t.text)}</p>${cite(t.source)}</li>`).join('')}</ol>
    ${facts.length ? `<div class="sci-facts"><p class="eyebrow">Cool tech facts</p><ul>${facts.map(f => `<li>${esc(f.text)}${cite(f.source)}</li>`).join('')}</ul></div>` : ''}
    ${legacy ? `<div class="sci-legacy"><p class="eyebrow">Still with us</p><p>${esc(legacy.text)}${cite(legacy.source)}</p></div>` : ''}
    ${tryIt ? `<div class="sci-try"><p class="eyebrow">Try it yourself</p><p>${esc(tryIt)}</p></div>` : ''}
  </section>`;
}
