import { beforeAll, describe, expect, it } from 'vitest';
import { loadCatalog } from '../../src/fonts/catalog';
import { embedFonts } from '../../src/fonts/embed';

describe('embedFonts', () => {
  beforeAll(() => loadCatalog());

  it('embedFonts inlines the woff2 files as data URIs and keeps only latin', async () => {
    const css = `
/* cyrillic */
@font-face {
  font-family: 'Wrong name';
  font-style: normal;
  font-weight: 400;
  src: url(https://fonts.gstatic.com/lora-cyrillic.woff2) format('woff2');
}
/* latin */
@font-face {
  font-family: 'Wrong name';
  font-style: normal;
  font-weight: 400;
  src: url('https://fonts.gstatic.com/lora-latin.woff2') format('woff2');
}
`;
    const textUrls: string[] = [];
    const byteUrls: string[] = [];

    const result = await embedFonts(
      ['lora'],
      async (url) => {
        textUrls.push(url);
        return css;
      },
      async (url) => {
        byteUrls.push(url);
        return new Blob([new Uint8Array([1, 2, 3])], { type: 'font/woff2' });
      },
    );

    expect(textUrls).toHaveLength(1);
    expect(byteUrls).toEqual(['https://fonts.gstatic.com/lora-latin.woff2']);
    expect(result).toEqual({
      css: expect.stringContaining("font-family: 'Lora'"),
      failed: [],
    });
    expect(result.css).toContain("url('data:font/woff2;base64,AQID') format('woff2')");
    expect(result.css).not.toContain('cyrillic');
    expect(result.css).not.toContain('https://');
  });

  it('embedFonts lists a font whose CSS could not be fetched', async () => {
    const result = await embedFonts(
      ['Lora', 'Not In The Catalog'],
      async () => null,
      async () => {
        throw new Error('font files must not be requested without CSS');
      },
    );

    expect(result).toEqual({ css: '', failed: ['Lora'] });
  });

  it('lists a font when its CSS has no usable font faces', async () => {
    const result = await embedFonts(
      ['Lora'],
      async () => '/* latin */',
      async () => new Blob(),
    );

    expect(result).toEqual({ css: '', failed: ['Lora'] });
  });

  it('keeps every font face when the CSS has no subset comments', async () => {
    const css = `
@font-face { font-family: 'Lora'; src: url('https://fonts.gstatic.com/regular.woff2') format('woff2'); }
@font-face { font-family: 'Lora'; font-style: italic; src: url('https://fonts.gstatic.com/italic.woff2') format('woff2'); }
`;
    const result = await embedFonts(
      ['Lora'],
      async () => css,
      async () => new Blob([new Uint8Array([4, 5, 6])], { type: 'font/woff2' }),
    );

    expect(result.failed).toEqual([]);
    expect(result.css.match(/@font-face/g)).toHaveLength(2);
    expect(result.css.match(/data:font\/woff2;base64,BAUG/g)).toHaveLength(2);
  });
});
