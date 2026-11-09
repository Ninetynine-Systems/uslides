import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseDeck } from '../../src/core/parse';

const fixture = (name: string) => readFileSync(`skill/uslides/examples/${name}.md`, 'utf8');

describe('parseDeck on the example decks', () => {
  it('parses plain.md', () => {
    const deck = parseDeck(fixture('plain'));
    expect(deck.warnings).toEqual([]);
    expect(deck.settings.title).toBeTruthy();
    expect(deck.slides).toHaveLength(3);
    expect(deck.slides.every((s) => s.boxes.length === 0)).toBe(true);
    expect(deck.slides.flatMap((s) => s.notes).length).toBeGreaterThan(0);
  });

  it('parses boxes.md', () => {
    const deck = parseDeck(fixture('boxes'));
    expect(deck.warnings).toEqual([]);
    expect(deck.settings.grid).toEqual({ cols: 12, rows: 6 });
    expect(deck.slides).toHaveLength(2);
    expect(deck.slides[0]!.boxes).toHaveLength(0);
    expect(deck.slides[1]!.boxes).toHaveLength(4);
    expect(deck.slides[1]!.boxes[3]!.col).toEqual([9, 12]);
    expect(deck.slides[1]!.boxes[3]!.row).toEqual([6, 6]);
  });

  it('parses pixels.md', () => {
    const deck = parseDeck(fixture('pixels'));
    expect(deck.warnings).toEqual([]);
    expect(deck.slides).toHaveLength(2);
    expect(deck.slides[0]!.grid).toEqual({ cols: 16, rows: 9 });
    expect(deck.slides[0]!.bg).toBe('#0f172a');
    const n = deck.slides[0]!.boxes.length;
    expect(n).toBe(24);
    for (const b of deck.slides[0]!.boxes) {
      expect(b.col[0]).toBe(b.col[1]);
      expect(b.row[0]).toBe(b.row[1]);
    }
    expect(deck.slides[1]!.loose).toContain('heart');
  });
});

describe('parseDeck warnings', () => {
  const messy = '---\ntitle: T\nbogus: 1\n---\n\n# A\n---\n::: box col=99\nx\n---\n::: note\n';

  it('puts settings warnings first, then slide warnings, all with valid ranges', () => {
    const deck = parseDeck(messy);
    expect(deck.warnings.length).toBeGreaterThanOrEqual(3);
    expect(deck.warnings[0]!.slideIndex).toBeUndefined();
    const slideWarnings = deck.warnings.slice(1);
    for (const w of slideWarnings) expect(w.slideIndex).toBeDefined();
    const indexes = slideWarnings.map((w) => w.slideIndex!);
    expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
    for (const w of deck.warnings) {
      expect(w.range.from).toBeGreaterThanOrEqual(0);
      expect(w.range.to).toBeLessThanOrEqual(deck.source.length);
      expect(w.range.from).toBeLessThanOrEqual(w.range.to);
    }
  });

  it('normalizes line endings so ranges index the stored source', () => {
    const deck = parseDeck('# A\r\n::: box col=99\r\nx\r\n:::\r\n');
    expect(deck.source).not.toContain('\r');
    const w = deck.warnings[0]!;
    expect(deck.source.slice(w.range.from, w.range.to)).toBe('::: box col=99');
  });
});
