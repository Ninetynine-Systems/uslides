import { describe, expect, it } from 'vitest';
import { deckName, normalizeSource, parseSettings, setTitle } from '../../src/core/settings';

const defaults = { grid: { cols: 12, rows: 6 }, aspect: '16:9', theme: 'light' };

describe('parseSettings', () => {
  it('reads a valid block and points bodyStart at the body', () => {
    const src = '---\ngrid: 32x18\ntheme: dark\n---\n# Hi';
    const r = parseSettings(src);
    expect(r.settings.grid).toEqual({ cols: 32, rows: 18 });
    expect(r.settings.theme).toBe('dark');
    expect(src[r.bodyStart]).toBe('#');
    expect(r.warnings).toEqual([]);
  });

  it('uses defaults without a block', () => {
    const r = parseSettings('# Hi');
    expect(r.settings).toEqual(defaults);
    expect(r.bodyStart).toBe(0);
  });

  it('is lenient about a leading --- that is not settings', () => {
    for (const src of ['---\n# Title slide\n\n- a\n', '---\nfoo: bar\n---\n# X']) {
      const r = parseSettings(src);
      expect(r.settings).toEqual(defaults);
      expect(r.bodyStart).toBe(0);
    }
  });

  it('warns about unknown keys, pointing at their line', () => {
    const src = '---\ngrid: 12x6\nfoo: 1\n---\nx';
    const r = parseSettings(src);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]!.message).toContain('foo');
    expect(src.slice(r.warnings[0]!.range.from, r.warnings[0]!.range.to)).toBe('foo: 1');
    expect(r.warnings[0]!.slideIndex).toBeUndefined();
  });

  it('falls back with a warning for invalid grid and aspect', () => {
    const a = parseSettings('---\ngrid: banana\n---\n');
    expect(a.settings.grid).toEqual({ cols: 12, rows: 6 });
    expect(a.warnings).toHaveLength(1);
    const b = parseSettings('---\naspect: 3:2\n---\n');
    expect(b.settings.aspect).toBe('16:9');
    expect(b.warnings).toHaveLength(1);
    expect(parseSettings('---\naspect: 4:3\n---\n').settings.aspect).toBe('4:3');
  });

  it('warns about an unknown theme and uses light', () => {
    const r = parseSettings('---\ntheme: gaia\n---\n');
    expect(r.settings.theme).toBe('light');
    expect(r.warnings.map((w) => w.message)).toEqual(['Unknown theme "gaia". Use light or dark.']);
    expect(parseSettings('---\ntheme: default\n---\n').settings.theme).toBe('light');
    expect(parseSettings('---\ntheme: Dark\n---\n').warnings).toHaveLength(1);
    expect(parseSettings('---\ntheme: dark\n---\n').warnings).toEqual([]);
    expect(parseSettings('---\ntheme: light\n---\n').warnings).toEqual([]);
    expect(parseSettings('---\ntheme: 5\n---\n').settings.theme).toBe('light');
  });

  it('words the aspect warning the same way', () => {
    const r = parseSettings('---\naspect: 3:2\n---\n');
    expect(r.warnings.map((w) => w.message)).toEqual(['Invalid aspect "3:2". Use 16:9 or 4:3. Using 16:9.']);
  });

  it('warns when a block with a known key is not valid YAML, and reads it as slides', () => {
    const src = '---\ntitle: Q3 review: what changed\ngrid: 12x6\n---\n# X';
    const r = parseSettings(src);
    expect(r.settings).toEqual(defaults);
    expect(r.bodyStart).toBe(0);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]!.message).toMatch(/^The settings block at the top is not valid YAML: .+/);
    expect(r.warnings[0]!.range).toEqual({ from: 0, to: src.indexOf('\n---\n#') });
  });

  it('gives no YAML warning for a leading --- block without any known key', () => {
    expect(parseSettings('---\nSome: text: here\n---\n# X').warnings).toEqual([]);
  });

  it('reads a quoted title that contains a colon', () => {
    const r = parseSettings('---\ntitle: "Q3 review: what changed"\n---\n# X');
    expect(r.settings.title).toBe('Q3 review: what changed');
    expect(r.warnings).toEqual([]);
  });

  it('warns about an empty title, such as one that starts with #', () => {
    const r = parseSettings('---\ntitle: #1 priority\n---\n# X');
    expect(r.settings.title).toBeUndefined();
    expect(r.warnings.map((w) => w.message)).toEqual([
      'The title is empty. If it starts with # or contains ": ", wrap it in double quotes.',
    ]);
  });

  it('parses normalized CRLF + BOM input', () => {
    const r = parseSettings(normalizeSource('﻿---\r\ngrid: 8x4\r\n---\r\n# A'));
    expect(r.settings.grid).toEqual({ cols: 8, rows: 4 });
  });

  it('handles a block closed at end of file', () => {
    const src = '---\ntheme: dark\n---';
    expect(parseSettings(src).bodyStart).toBe(src.length);
  });
});

describe('deckName', () => {
  it('prefers the title', () => expect(deckName('---\ntitle: My deck\n---\n# H')).toBe('My deck'));
  it('uses the first heading with Markdown stripped', () =>
    expect(deckName('text\n# **Bold** idea\n')).toBe('Bold idea'));
  it('skips headings in code fences', () =>
    expect(deckName('```\n# no\n```\n## Yes')).toBe('Yes'));
  it('falls back to Untitled', () => expect(deckName('just text')).toBe('Untitled'));
});

describe('setTitle', () => {
  it('adds a block when there is none', () =>
    expect(setTitle('# A', 'Q3')).toBe('---\ntitle: Q3\n---\n\n# A'));
  it('replaces an existing title and keeps other keys in order', () => {
    expect(setTitle('---\ngrid: 8x4\ntitle: Old\ntheme: dark\n---\n# A', 'New')).toBe(
      '---\ngrid: 8x4\ntitle: New\ntheme: dark\n---\n# A',
    );
  });
  it('inserts a title into a block without one', () =>
    expect(setTitle('---\ngrid: 8x4\n---\n# A', 'T')).toBe('---\ntitle: T\ngrid: 8x4\n---\n# A'));
  it('quotes titles containing a colon, and round-trips', () => {
    const out = setTitle('# A', 'Q3: plan');
    expect(out).toBe('---\ntitle: "Q3: plan"\n---\n\n# A');
    expect(parseSettings(out).settings.title).toBe('Q3: plan');
  });
});
