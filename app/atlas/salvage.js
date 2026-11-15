// Salvageability block for the atlas dossier: grade, factor bars, what needs repair, engineers' approaches and a
// "think like an engineer" prompt with a private notes box. Data: public/data/salvage.json (rubric + one entry per machine id).
import { ICON } from './icons.js';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const httpUrl = u => /^https?:\/\//.test(u || '');
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return 'source'; } };
const src = (u, t) => httpUrl(u) ? `<a class="salv-a" href="${esc(u)}" target="_blank" rel="noopener">${esc(t || host(u))} ${ICON.external}</a>` : '';

const FACTORS = [['reach', 'Reachability'], ['condition', 'Condition'], ['usefulness', 'Usefulness'], ['fixability', 'Fixability']];
const MEANING = { A: 'Great salvage target', B: 'Good target', C: 'Possible, but hard', D: 'Very hard', F: 'Not salvageable' };
const KEY = id => `gra-salvage-idea:${id}`;

let once;
// Fetches salvage.json once; resolves to { rubric, machines } (machines keyed by id), or null if missing.
export function loadSalvage() {
  return once ||= fetch('data/salvage.json').then(r => (r.ok ? r.json() : null)).catch(() => null);
}

const readIdea = id => { try { return localStorage.getItem(KEY(id)) || ''; } catch { return ''; } };
// One delegated listener saves every "Your idea" box; the page never sends it anywhere.
if (typeof document !== 'undefined') {
  document.addEventListener('input', e => {
    const t = e.target;
    if (!(t instanceof HTMLTextAreaElement) || !t.dataset.salvIdea) return;
    try { if (t.value) localStorage.setItem(KEY(t.dataset.salvIdea), t.value); else localStorage.removeItem(KEY(t.dataset.salvIdea)); } catch { /* private mode: idea lasts this visit */ }
  });
}

// entry = one value of salvage.json "machines". Returns '' when there is no entry.
export function salvageBlock(entry) {
  if (!entry || !entry.id) return '';
  const id = String(entry.id), uid = id.replace(/[^\w-]/g, '_');
  const g = /^[A-F]$/.test(entry.grade || '') ? entry.grade : null;
  const score = Number.isFinite(entry.score) ? Math.max(0, Math.min(100, entry.score)) : null;

  const head = entry.working || !g || score == null
    ? `<p class="salv-working"><b>${esc(entry.note || 'Still working — not salvage, it’s a mission.')}</b></p>`
    : `<div class="salv-card">
        <p class="salv-grade"><span class="salv-letter"><span class="salv-vh">Grade </span>${g}</span>
          <span class="salv-score"><b>${score}</b> / 100<span class="salv-meaning">${esc(MEANING[g])}</span></span></p>
        <div class="salv-bar" role="img" aria-label="Salvage score ${score} out of 100"><b style="width:${score}%"></b></div>
        <dl class="salv-factors">${FACTORS.map(([k, label]) => {
          const v = Math.max(0, Math.min(25, Number(entry.factors?.[k]) || 0));
          return `<div><dt>${label}</dt><dd><span class="salv-mini" aria-hidden="true"><b style="width:${v * 4}%"></b></span><span class="salv-n">${v}<small>/25</small></span></dd></div>`;
        }).join('')}</dl>
      </div>`;

  const needs = (entry.needsRepair || []).filter(n => n && n.part);
  const ways = (entry.approaches || []).filter(a => a && a.text);
  const sources = [...new Set((entry.sources || []).filter(httpUrl))];
  const idea = readIdea(id);

  return `<section class="salv salv-g${g || 'W'}" aria-labelledby="salv-h-${uid}">
    <h3 id="salv-h-${uid}">Could we salvage it?</h3>
    ${head}
    ${entry.heritage ? `<p class="salv-heritage"><b>Look, don’t touch.</b> ${esc(entry.heritage)}</p>` : ''}
    ${needs.length ? `<h4 class="salv-h">Needs repair</h4><ul class="salv-fix">${needs.map(n => `<li><b>${esc(n.part)}:</b> ${esc(n.problem)}</li>`).join('')}</ul>` : ''}
    ${ways.length ? `<h4 class="salv-h">How engineers might tackle it</h4><ul class="salv-ways">${ways.map(a => {
      const real = a.kind === 'real' && httpUrl(a.source);
      return `<li><span class="salv-tag ${real ? 'is-real' : 'is-idea'}">${real ? 'Tried for real' : 'Idea'}</span><span>${esc(a.text)}${real ? ` ${src(a.source, 'source')}` : ''}</span></li>`;
    }).join('')}</ul>` : ''}
    ${entry.prompt ? `<div class="salv-prompt">
      <p class="salv-q"><b>Think like an engineer</b>${esc(entry.prompt)}</p>
      ${entry.engineersSay ? `<details><summary>See how engineers think about it</summary><p>${esc(entry.engineersSay)} ${src(entry.engineersSource, 'source')}</p></details>` : ''}
      <label for="salv-idea-${uid}">Your idea</label>
      <textarea id="salv-idea-${uid}" data-salv-idea="${esc(id)}" rows="3" placeholder="How would you solve it?" aria-describedby="salv-note-${uid}">${esc(idea)}</textarea>
      <p class="salv-note" id="salv-note-${uid}">Saved only in this browser. Nobody else can see it.</p>
    </div>` : ''}
    ${sources.length ? `<p class="salv-src">Sources: ${sources.map(u => src(u)).join(' · ')}</p>` : ''}
  </section>`;
}
