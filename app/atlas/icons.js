// Lucide icons as SVG strings for the atlas's plain-JS templates. The React side uses lucide-react; both carry the
// class "lucide", which app/icons.css sizes to the surrounding text.
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, ChevronDown, Maximize, Minimize, Minus, Pause, Play, Plus } from 'lucide';

const attrs = a => Object.entries(a).map(([k, v]) => `${k}="${v}"`).join(' ');
const svg = node => `<svg class="lucide" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${node.map(([tag, a]) => `<${tag} ${attrs(a)}/>`).join('')}</svg>`;

export const ICON = {
  back: svg(ArrowLeft),
  go: svg(ArrowRight),
  external: svg(ArrowUpRight),
  check: svg(Check),
  more: svg(ChevronDown),
  fullscreen: svg(Maximize),
  exitFullscreen: svg(Minimize),
  zoomIn: svg(Plus),
  zoomOut: svg(Minus),
  play: svg(Play),
  pause: svg(Pause),
};
