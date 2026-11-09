import { describe, expect, it } from 'vitest';
import { deckHash, parseRoute } from '../../src/app/route';

describe('route', () => {
  it('builds and parses a deck hash', () => {
    expect(deckHash('abc')).toBe('#/deck/abc');
    expect(parseRoute('#/deck/abc')).toEqual({ deckId: 'abc' });
  });
  it('ignores a present suffix when reading the id', () => {
    expect(parseRoute('#/deck/abc/present/3')).toEqual({ deckId: 'abc' });
  });
  it('leaves unknown forms alone', () => {
    expect(parseRoute('')).toEqual({});
    expect(parseRoute('#z=abcdef')).toEqual({});
    expect(parseRoute('#md=%23%20Hi')).toEqual({});
  });
});
