import { describe, expect, it } from 'vitest';
import { cutOffWarnings } from '../../src/app/cutOff';
import { parseDeck } from '../../src/core/parse';

const BOX = 'Text in this box is cut off. Shorten it or make the box bigger.';
const SLIDE = 'Text on this slide is cut off. Shorten it or split the slide.';

describe('cutOffWarnings', () => {
  const src = '# One\n---\n\n\nLoose text\n---\n::: box col=1 row=1\nlong\n:::\n::: box col=2 row=2\nok\n:::\n';
  const deck = parseDeck(src);
  const text = (r: { from: number; to: number }) => deck.source.slice(r.from, r.to);

  it('gives nothing when nothing overflows', () => {
    const fits = new Map(deck.slides.map((s) => [s, [{ boxIndex: null, overflow: false }]]));
    expect(cutOffWarnings(deck, fits)).toEqual([]);
  });

  it('points a box warning at the box opening line', () => {
    const fits = new Map([[deck.slides[2]!, [{ boxIndex: 0, overflow: true }, { boxIndex: 1, overflow: false }]]]);
    const [w, ...rest] = cutOffWarnings(deck, fits);
    expect(rest).toEqual([]);
    expect(w!.message).toBe(BOX);
    expect(w!.slideIndex).toBe(2);
    expect(text(w!.range)).toBe('::: box col=1 row=1');
  });

  it('points a slide warning at the first non-blank line of the slide', () => {
    const fits = new Map([[deck.slides[1]!, [{ boxIndex: null, overflow: true }]]]);
    const [w] = cutOffWarnings(deck, fits);
    expect(w!.message).toBe(SLIDE);
    expect(w!.slideIndex).toBe(1);
    expect(text(w!.range)).toBe('Loose text');
  });

  it('ignores results for slides that are not in the deck', () => {
    const old = parseDeck(src).slides[0]!;
    expect(cutOffWarnings(deck, new Map([[old, [{ boxIndex: null, overflow: true }]]]))).toEqual([]);
  });

  it('lists warnings in slide order', () => {
    const fits = new Map([
      [deck.slides[2]!, [{ boxIndex: 1, overflow: true }]],
      [deck.slides[0]!, [{ boxIndex: null, overflow: true }]],
    ]);
    expect(cutOffWarnings(deck, fits).map((w) => w.slideIndex)).toEqual([0, 2]);
  });
});
