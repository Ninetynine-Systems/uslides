import { describe, expect, it } from 'vitest';
import { parseAttrs, parseGrid, parseSpan, scanAttrs } from '../../src/core/attrs';
import { sanitizeColor } from '../../src/core/colors';

describe('parseAttrs', () => {
  it('parses plain and quoted values', () => {
    expect(parseAttrs('col=1-7 row=2 bg="#1e3a8a"')).toEqual({
      attrs: { col: '1-7', row: '2', bg: '#1e3a8a' },
      errors: [],
    });
  });
  it('keeps spaces inside quotes', () => {
    expect(parseAttrs('title="a b  c" x=1').attrs).toEqual({ title: 'a b  c', x: '1' });
  });
  it('reports an unterminated quote', () => {
    expect(parseAttrs('bg="unterminated').errors).toHaveLength(1);
  });
  it('reports a bare key', () => {
    expect(parseAttrs('col').errors).toHaveLength(1);
  });
  it('handles empty input', () => {
    expect(parseAttrs('  ')).toEqual({ attrs: {}, errors: [] });
  });
});

describe('scanAttrs', () => {
  it('returns offsets for bare and quoted attribute values', () => {
    expect(scanAttrs('col=1 row="2-3"')).toEqual([
      { key: 'col', from: 0, to: 5, valueFrom: 4, valueTo: 5 },
      { key: 'row', from: 6, to: 15, valueFrom: 10, valueTo: 15 },
    ]);
  });
});

describe('parseSpan', () => {
  it('parses single, range and undefined', () => {
    expect(parseSpan('3', 12).span).toEqual([3, 3]);
    expect(parseSpan('1-7', 12).span).toEqual([1, 7]);
    expect(parseSpan(undefined, 6).span).toEqual([1, 6]);
    expect(parseSpan('1-7', 12).clamped).toBe(false);
  });
  it('clamps to the grid', () => {
    const r = parseSpan('10-15', 12);
    expect(r.span).toEqual([10, 12]);
    expect(r.clamped).toBe(true);
  });
  it('clamps a start below 1', () => {
    const r = parseSpan('0-3', 12);
    expect(r.span).toEqual([1, 3]);
    expect(r.clamped).toBe(true);
  });
  it('clamps a span wholly outside the grid', () => {
    const r = parseSpan('20-25', 12);
    expect(r.span).toEqual([12, 12]);
    expect(r.clamped).toBe(true);
  });
  it('swaps a reversed range without error', () => {
    const r = parseSpan('7-3', 12);
    expect(r.span).toEqual([3, 7]);
    expect(r.error).toBeUndefined();
  });
  it('falls back to the full span on bad input', () => {
    const r = parseSpan('abc', 12);
    expect(r.span).toEqual([1, 12]);
    expect(r.error).toBeDefined();
  });
});

describe('parseGrid', () => {
  it('parses valid grids', () => {
    expect(parseGrid('32x18')).toEqual({ cols: 32, rows: 18 });
    expect(parseGrid('12x6')).toEqual({ cols: 12, rows: 6 });
    expect(parseGrid('200x1')).toEqual({ cols: 200, rows: 1 });
  });
  it('rejects invalid grids', () => {
    expect(parseGrid('0x5')).toBeNull();
    expect(parseGrid('12')).toBeNull();
    expect(parseGrid('300x2')).toBeNull();
    expect(parseGrid('2x201')).toBeNull();
    expect(parseGrid('1.5x2')).toBeNull();
  });
});

describe('sanitizeColor', () => {
  it('accepts hex and lower-cases', () => {
    expect(sanitizeColor('#FFF')).toBe('#fff');
    expect(sanitizeColor('#1e3a8a')).toBe('#1e3a8a');
    expect(sanitizeColor('#1E3A8A80')).toBe('#1e3a8a80');
  });
  it('accepts named colours case-insensitively', () => {
    expect(sanitizeColor('white')).toBe('white');
    expect(sanitizeColor('RebeccaPurple')).toBe('rebeccapurple');
  });
  it('trims whitespace', () => {
    expect(sanitizeColor('  #FFF ')).toBe('#fff');
  });
  it('rejects unsafe or malformed values', () => {
    expect(sanitizeColor('red;background:url(x)')).toBeNull();
    expect(sanitizeColor('#12')).toBeNull();
    expect(sanitizeColor('expression(1)')).toBeNull();
    expect(sanitizeColor('')).toBeNull();
  });
});
