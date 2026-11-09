import { afterEach, describe, expect, it, vi } from 'vitest';
import { escapeForScript, unescapeFromScript } from '../../src/core/embed';
import { buildHtml, exportHtml, fetchPlayerScript, fileSlug, PlayerMissingError } from '../../src/export/download';
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
  it('the exported page allows data fonts and nothing else from the network', () => {
    const html = buildHtml('# A', 'A', '', "@font-face { font-family: 'Lora'; }");
    expect(html).toContain("font-src data:");
    expect(html).toContain(`<style id="fonts">@font-face { font-family: 'Lora'; }</style>`);
  });

  it('makes one file with no external references', () => {
    const html = buildHtml('# Hi <b>', 'A "Deck" <1>', player);
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('name="viewport"');
    expect(html).toContain('<title>A &quot;Deck&quot; &lt;1&gt;</title>');
    expect(html).toContain("default-src 'none'; img-src data: blob:; font-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'");
    expect(html).not.toMatch(/<script[^>]*\ssrc=/);
    expect(html).not.toMatch(/<link[^>]*href=/);
    // Only our two script elements may close.
    expect(html.match(/<\/script/gi)).toHaveLength(2);
  });
});

describe('exportHtml', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('embeds catalog fonts and reports no font failures', async () => {
    const requests: string[] = [];
    vi.stubGlobal('fetch', async (input: string | URL | Request) => {
      const url = String(input);
      requests.push(url);
      if (url.startsWith('https://fonts.googleapis.com/')) {
        return new Response(`@font-face {
  font-family: 'Lora';
  font-style: normal;
  font-weight: 400;
  src: url('https://fonts.gstatic.com/lora.woff2') format('woff2');
}`);
      }
      if (url === 'https://fonts.gstatic.com/lora.woff2') {
        return new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'font/woff2' } });
      }
      return new Response('', { status: 404 });
    });

    const { blob, failedFonts } = await exportHtml(
      '---\nfont: Lora\n---\n\n# A\n',
      async () => null,
      async () => '/* player */',
    );

    expect(failedFonts).toEqual([]);
    expect(requests).toHaveLength(2);
    const html = await blob.text();
    expect(html).toContain("url('data:font/woff2;base64,AQID')");
    expect(html).not.toContain('https://fonts.gstatic.com');
  });

  it('packs images, reports failures and keeps them as links', async () => {
    const png = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
    const source = '![a](a.png)\n\n![b](missing.png)\n\n```\n</script>\n```\n';
    const { blob, failed, tooLarge, failedFonts } = await exportHtml(
      source,
      async (src) => (src === 'a.png' ? png : null),
      async () => '/* player */',
    );
    const html = await blob.text();
    expect(failed).toEqual(['missing.png']);
    expect(tooLarge).toEqual([]);
    expect(failedFonts).toEqual([]);
    expect(html).toContain('data:image/png;base64,AQID');
    expect(html).toContain('missing.png');
    expect(html).not.toContain('a.png');
  });
});

describe('fetchPlayerScript', () => {
  afterEach(() => vi.unstubAllGlobals());
  const reply = (body: string, type: string | null, status = 200) =>
    vi.stubGlobal('fetch', async () => new Response(body, { status, headers: type ? { 'Content-Type': type } : {} }));

  it('returns a JavaScript response', async () => {
    reply('console.log(1)', 'text/javascript; charset=utf-8');
    expect(await fetchPlayerScript()).toBe('console.log(1)');
    reply('console.log(2)', 'application/javascript');
    expect(await fetchPlayerScript()).toBe('console.log(2)');
  });

  it('rejects an HTML fallback page served with a 200', async () => {
    reply('<!doctype html><html></html>', 'text/html');
    await expect(fetchPlayerScript()).rejects.toBeInstanceOf(PlayerMissingError);
  });

  it('rejects a body that starts with "<" even with a JavaScript content type', async () => {
    reply('  <!doctype html>', 'text/javascript');
    await expect(fetchPlayerScript()).rejects.toBeInstanceOf(PlayerMissingError);
  });

  it('rejects a 404 and a response with no content type', async () => {
    reply('nope', 'text/javascript', 404);
    await expect(fetchPlayerScript()).rejects.toBeInstanceOf(PlayerMissingError);
    reply('x', null);
    await expect(fetchPlayerScript()).rejects.toBeInstanceOf(PlayerMissingError);
  });

  it('says what to do', () => {
    expect(new PlayerMissingError().message).toBe('The offline player is missing. Reload the app and try again.');
  });
});
