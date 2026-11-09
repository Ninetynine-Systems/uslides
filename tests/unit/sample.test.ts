import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseDeck } from '../../src/core/parse';
import { deckName } from '../../src/core/settings';

const sample = readFileSync('src/app/sample.md', 'utf8');

describe('sample.md', () => {
  it('parses with zero warnings and 3-4 slides', () => {
    const deck = parseDeck(sample);
    expect(deck.warnings).toEqual([]);
    expect(deck.slides.length).toBeGreaterThanOrEqual(3);
    expect(deck.slides.length).toBeLessThanOrEqual(4);
  });
  it('has a title setting that names the deck', () => {
    expect(parseDeck(sample).settings.title).toBeTruthy();
    expect(deckName(sample)).not.toBe('Untitled');
  });
  it('shows a box slide and a note', () => {
    const deck = parseDeck(sample);
    expect(deck.slides.some((s) => s.boxes.length > 0)).toBe(true);
    expect(deck.slides.some((s) => s.notes.length > 0)).toBe(true);
  });
});
