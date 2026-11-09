import { parseDeck } from '../core/parse';
import { unescapeFromScript } from '../core/embed';
import { fitSlide, mountScaled } from '../render/fit';
import { slideTarget } from '../render/nav';
import { renderSlide } from '../render/renderSlide';

// The player in an exported .html file: the deck source sits in <script type="text/markdown" id="deck">.
// It shows one slide at a time, scaled to the window. Speaker notes are not shown.

const source = unescapeFromScript(document.getElementById('deck')?.textContent ?? '');
const deck = parseDeck(source);
const count = deck.slides.length;

const frame = document.getElementById('player') ?? document.body.appendChild(document.createElement('div'));
let current = 1;
let unmount: (() => void) | undefined;

function show(n: number): void {
  current = n;
  unmount?.();
  frame.replaceChildren();
  const stage = renderSlide(deck.slides[n - 1]!, deck.settings);
  unmount = mountScaled(stage, frame);
  fitSlide(stage);
  frame.setAttribute('aria-label', `Slide ${n} of ${count}`);
}

window.addEventListener('keydown', (e) => {
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  const target = slideTarget(e.key, current, count);
  if (target === undefined) return;
  e.preventDefault();
  if (target !== current) show(target);
});

frame.addEventListener('click', (e) => {
  if ((e.target as Element).closest('a')) return; // a link in the slide is followed
  if (current < count) show(current + 1);
});

show(1);
