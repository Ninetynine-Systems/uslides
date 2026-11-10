import { describe, expect, it } from 'vitest';
import { isDeckFontFile, isDeckFontStylesheet } from '../../src/fonts/cache';

describe('font runtime cache filters', () => {
  it('keeps preview stylesheets out of the deck CSS cache', () => {
    expect(isDeckFontStylesheet(new URL('https://fonts.googleapis.com/css2?family=Lora&text=Lora'))).toBe(false);
    expect(isDeckFontStylesheet(new URL('https://fonts.googleapis.com/css2?family=Lora'))).toBe(true);
  });

  it('keeps /l/ preview files out and accepts /s/ deck files', () => {
    expect(isDeckFontFile(new URL('https://fonts.gstatic.com/l/font?kit=preview'))).toBe(false);
    expect(isDeckFontFile(new URL('https://fonts.gstatic.com/s/lora/v37/lora.woff2'))).toBe(true);
  });
});
