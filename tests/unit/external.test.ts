import { describe, expect, it } from 'vitest';
import { externalHosts } from '../../src/core/external';
import { parseDeck } from '../../src/core/parse';

describe('externalHosts', () => {
  it('lists the hosts of web images, once each, and skips code and data images', () => {
    const d = parseDeck('![a](https://a.example/x.png)\n\n`![b](https://b.example/y.png)`\n\n![c](https://a.example/z.png)\n\n![d](data:image/png;base64,AA==)\n');
    expect(externalHosts(d)).toEqual(['a.example']);
  });

  it('includes images in boxes and sorts the host names', () => {
    const d = parseDeck('![z](http://z.example/x.png)\n\n::: box\n![a](https://a.example/y.png)\n:::\n');
    expect(externalHosts(d)).toEqual(['a.example', 'z.example']);
  });
});
