import { describe, expect, it } from 'vitest';
import { escapeForScript, unescapeFromScript } from '../../src/core/embed';
import { buildHtml, exportHtml, fileSlug } from '../../src/export/download';
import { slideTarget } from '../../src/render/nav';

describe('fileSlug', () => {
  it('lower-cases and joins words with dashes', () => {
    expect(fileSlug('My Great Deck!')).toBe('my-great-deck');
  });
  it('keeps letters from other scripts', () => {
    expect(fileSlug('Café 日本語')).toBe('café-日本語');
  });
  it('falls back to "deck" when nothing is left', () => {
    expect(fileSlug('???')).toBe('deck');
    expect(fileSlug('')).toBe('deck');
  });
});

describe('script escaping', () => {
  const samples = [
    'plain',
    '```html\n<script>alert(1)</script>\n```',
    '<!-- slide -->\n<script>x</script>',
    'literal <\\/script> already',
    '<\\\\/SCRIPT and <\\!-- and </Script',
    '<!--',
  ];
  for (const s of samples) {
    it(`round-trips ${JSON.stringify(s)}`, () => {
      const escaped = escapeForScript(s);
      expect(escaped).not.toMatch(/<\/script/i);
      expect(escaped).not.toMatch(/<script/i);
      expect(escaped).not.toContain('<!--');
      expect(unescapeFromScript(escaped)).toBe(s);
    });
  }
});

describe('slideTarget', () => {
  it('maps present-mode keys', () => {
    expect(slideTarget('ArrowRight', 2, 5)).toBe(3);
    expect(slideTarget(' ', 5, 5)).toBe(5);
    expect(slideTarget('PageUp', 1, 5)).toBe(1);
    expect(slideTarget('ArrowUp', 3, 5)).toBe(2);
    expect(slideTarget('Home', 4, 5)).toBe(1);
    expect(slideTarget('End', 1, 5)).toBe(5);
    expect(slideTarget('a', 1, 5)).toBeUndefined();
  });
});

describe('buildHtml', () => {
  const player = 'var x="</script>";/* player */';
  it('makes one file with no external references', () => {
    const html = buildHtml('# Hi <b>', 'A "Deck" <1>', player);
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('name="viewport"');
    expect(html).toContain('<title>A &quot;Deck&quot; &lt;1&gt;</title>');
    expect(html).toContain("default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline'");
    expect(html).not.toMatch(/<script[^>]*\ssrc=/);
    expect(html).not.toMatch(/<link[^>]*href=/);
    // Only our two script elements may close.
    expect(html.match(/<\/script/gi)).toHaveLength(2);
  });
});

describe('exportHtml', () => {
  it('packs images, reports failures and keeps them as links', async () => {
    const png = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
    const source = '![a](a.png)\n\n![b](missing.png)\n\n```\n</script>\n```\n';
    const { blob, failed, tooLarge } = await exportHtml(
      source,
      async (src) => (src === 'a.png' ? png : null),
      async () => '/* player */',
    );
    const html = await blob.text();
    expect(failed).toEqual(['missing.png']);
    expect(tooLarge).toEqual([]);
    expect(html).toContain('data:image/png;base64,AQID');
    expect(html).toContain('missing.png');
    expect(html).not.toContain('a.png');
  });
});
