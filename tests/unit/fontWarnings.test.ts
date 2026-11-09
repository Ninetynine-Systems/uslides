import { describe, expect, it } from 'vitest';
import { fontWarnings } from '../../src/app/fontWarnings';
import { parseDeck } from '../../src/core/parse';
import type { Family } from '../../src/fonts/catalog';

const known = new Set(['inter', 'playfair display']);
const find = (name: string): Family | undefined =>
  known.has(name.toLowerCase())
    ? { name, group: 'sans-serif', weights: [400], italicWeights: [] }
    : undefined;

describe('fontWarnings', () => {
  it('warns about an unknown font with the exact message', () => {
    const source = '---\nfont: Missing Deck\n---\n::: box font="Missing Box"\nText\n:::\n';
    const warnings = fontWarnings(parseDeck(source), find);

    expect(warnings.map((warning) => warning.message)).toEqual([
      'Unknown font "Missing Deck". Pick one from the font menu, or check the spelling on fonts.google.com.',
      'Unknown font "Missing Box". Pick one from the font menu, or check the spelling on fonts.google.com.',
    ]);
    expect(source.slice(warnings[0]!.range.from, warnings[0]!.range.to)).toBe('font: Missing Deck');
    expect(source.slice(warnings[1]!.range.from, warnings[1]!.range.to)).toBe('::: box font="Missing Box"');
    expect(warnings[0]!.slideIndex).toBeUndefined();
    expect(warnings[1]!.slideIndex).toBe(0);
  });

  it('does not warn about known fonts, ignoring case', () => {
    const deck = parseDeck('---\nfont: INTER\n---\n::: box font="Playfair Display"\nText\n:::');
    expect(fontWarnings(deck, find)).toEqual([]);
  });
});
