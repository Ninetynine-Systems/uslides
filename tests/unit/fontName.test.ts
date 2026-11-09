import { describe, expect, it } from 'vitest';
import { isValidFontName } from '../../src/core/fontName';

describe('isValidFontName', () => {
  it('accepts safe names up to 60 characters', () => {
    expect(isValidFontName('Playfair Display')).toBe(true);
    expect(isValidFontName('A'.repeat(60))).toBe(true);
  });

  it('refuses unsafe, empty and overlong names', () => {
    expect(isValidFontName('')).toBe(false);
    expect(isValidFontName('a}b')).toBe(false);
    expect(isValidFontName('A'.repeat(61))).toBe(false);
  });
});
