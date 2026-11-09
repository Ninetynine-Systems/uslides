import { beforeAll, describe, expect, it } from 'vitest';
import { deckFonts, externalHosts } from '../../src/core/external';
import { parseDeck } from '../../src/core/parse';
import { loadCatalog } from '../../src/fonts/catalog';

beforeAll(() => loadCatalog());

describe('externalHosts', () => {
  it('lists the hosts of web images, once each, and skips code and data images', () => {
    const d = parseDeck('![a](https://a.example/x.png)\n\n`![b](https://b.example/y.png)`\n\n![c](https://a.example/z.png)\n\n![d](data:image/png;base64,AA==)\n');
    expect(externalHosts(d)).toEqual(['a.example']);
  });

  it('includes images in boxes and sorts the host names', () => {
    const d = parseDeck('![z](http://z.example/x.png)\n\n::: box\n![a](https://a.example/y.png)\n:::\n');
    expect(externalHosts(d)).toEqual(['a.example', 'z.example']);
  });

  it('does not count an image inside a comment', () => {
    const d = parseDeck('<!-- ![c](https://h.example/x.png) -->\n');
    expect(externalHosts(d)).toEqual([]);
  });

  it('lists deck and box fonts once, with catalog spelling when known', () => {
    const d = parseDeck([
      '---',
      'font: playfair display',
      '---',
      '::: box font="Playfair Display"',
      'A',
      ':::',
      '::: box font=Lora',
      'B',
      ':::',
      '::: box font="Not A Catalog Font"',
      'C',
      ':::',
    ].join('\n'));

    expect(deckFonts(d)).toEqual(['Playfair Display', 'Lora', 'Not A Catalog Font']);
  });

  it('adds both Google font hosts when the deck uses a known font', () => {
    const d = parseDeck('::: box font=Lora\nA\n:::\n');
    expect(externalHosts(d)).toEqual(['fonts.googleapis.com', 'fonts.gstatic.com']);
  });
});
