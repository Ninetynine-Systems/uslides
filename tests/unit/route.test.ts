import { describe, expect, it } from 'vitest';
import { deckHash, parseRoute } from '../../src/app/route';

describe('route', () => {
  it('builds and parses a deck hash', () => {
    expect(deckHash('abc')).toBe('#/deck/abc');
    expect(parseRoute('#/deck/abc')).toEqual({ deckId: 'abc' });
  });
  it('reads the slide number from a present suffix', () => {
    expect(deckHash('abc', 3)).toBe('#/deck/abc/present/3');
    expect(parseRoute('#/deck/abc/present/3')).toEqual({ deckId: 'abc', present: 3 });
    expect(parseRoute('#/deck/abc/present/x')).toEqual({ deckId: 'abc' });
    expect(parseRoute('#/deck/abc/present/0')).toEqual({ deckId: 'abc', present: 1 });
  });
  it('leaves unknown forms alone', () => {
    expect(parseRoute('')).toEqual({});
    expect(parseRoute('#z=abcdef')).toEqual({});
    expect(parseRoute('#md=%23%20Hi')).toEqual({});
  });
});
