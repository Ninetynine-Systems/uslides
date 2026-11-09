import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { APP_ORIGIN } from '../../src/config';
import { MAX_DECK_BYTES, makeShareLink, readShareHash, ShareLinkError } from '../../src/share/link';

const deck = '---\ntitle: Salām\n---\n\n# Hello 👋🏽\n\nআমার সোনার বাংলা\n\n---\n\n- one\n- two\n';
const hashOf = (link: string) => link.slice(link.indexOf('#'));

describe('share links', () => {
  it('round-trips both modes with emoji, Bangla and newlines', async () => {
    for (const mode of ['z', 'md'] as const) {
      const link = await makeShareLink(deck, mode);
      expect(link.startsWith(`${APP_ORIGIN}/#${mode}=`)).toBe(true);
      expect(await readShareHash(hashOf(link))).toBe(deck);
    }
  });

  it('accepts the hash without the leading #', async () => {
    const link = await makeShareLink(deck, 'z');
    expect(await readShareHash(hashOf(link).slice(1))).toBe(deck);
  });

  it('makes #z= shorter than #md= for the boxes fixture', async () => {
    const boxes = readFileSync('skill/uslides/examples/boxes.md', 'utf8');
    const z = await makeShareLink(boxes, 'z');
    const md = await makeShareLink(boxes, 'md');
    expect(z.length).toBeLessThan(md.length);
    expect(z.slice(z.indexOf('#z=') + 3)).not.toMatch(/[+/=]/);
  });

  it('returns null for hashes that are not share links', async () => {
    expect(await readShareHash('#/deck/x')).toBeNull();
    expect(await readShareHash('')).toBeNull();
    expect(await readShareHash('#')).toBeNull();
  });

  it('throws ShareLinkError for damaged links', async () => {
    const valid = hashOf(await makeShareLink(deck, 'z'));
    await expect(readShareHash(valid.slice(0, -10))).rejects.toBeInstanceOf(ShareLinkError);
    await expect(readShareHash('#z=!!!')).rejects.toBeInstanceOf(ShareLinkError);
    await expect(readShareHash('#md=%E0%A4')).rejects.toBeInstanceOf(ShareLinkError);
    await expect(readShareHash('#z=')).rejects.toBeInstanceOf(ShareLinkError);
    await expect(readShareHash('#md=')).rejects.toBeInstanceOf(ShareLinkError);
  });

  it('rejects a #z= payload that inflates to invalid UTF-8', async () => {
    const cs = new Blob([new Uint8Array([0xff, 0xfe, 0xfd])]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    const bytes = new Uint8Array(await new Response(cs).arrayBuffer());
    const b64 = Buffer.from(bytes).toString('base64url');
    await expect(readShareHash(`#z=${b64}`)).rejects.toBeInstanceOf(ShareLinkError);
  });

  it('reads a link an agent built with plain encodeURIComponent', async () => {
    const hash = `#md=${encodeURIComponent(deck)}`;
    expect(await readShareHash(hash)).toBe(deck);
  });

  it('refuses a link that would inflate past the size cap, without inflating it all', async () => {
    const link = await makeShareLink('a'.repeat(MAX_DECK_BYTES + 1024 * 1024), 'z');
    const started = performance.now();
    await expect(readShareHash(hashOf(link))).rejects.toThrow('This link is too large to open');
    await expect(readShareHash(hashOf(link))).rejects.toBeInstanceOf(ShareLinkError);
    expect(performance.now() - started).toBeLessThan(2000);
  });

  it('refuses an #md= payload over the size cap', async () => {
    await expect(readShareHash(`#md=${'a'.repeat(MAX_DECK_BYTES + 1)}`)).rejects.toBeInstanceOf(ShareLinkError);
  });
});
