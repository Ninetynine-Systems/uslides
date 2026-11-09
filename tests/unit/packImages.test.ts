import { describe, expect, it } from 'vitest';
import { blobToDataUri, dataUriKb, packImages } from '../../src/export/packImages';

const png = (bytes = [1, 2, 3]) => new Blob([new Uint8Array(bytes)], { type: 'image/png' });
const b64 = (bytes: number[]) => Buffer.from(bytes).toString('base64');

describe('packImages', () => {
  it('rewrites relative and web images, keeping alt text and title', async () => {
    const source = '# A\n\n![one](./a.png)\n\n![two](https://x.test/b.png "Title")\n';
    const seen: string[] = [];
    const out = await packImages(source, async (src) => {
      seen.push(src);
      return png();
    });
    const uri = `data:image/png;base64,${b64([1, 2, 3])}`;
    expect(out.source).toBe(`# A\n\n![one](${uri})\n\n![two](${uri} "Title")\n`);
    expect(out.failed).toEqual([]);
    expect(seen).toEqual(['./a.png', 'https://x.test/b.png']);
  });

  it('lists images that cannot be fetched and leaves their text alone', async () => {
    const source = '![ok](ok.png) ![bad](https://x.test/missing.png)';
    const out = await packImages(source, async (src) => (src === 'ok.png' ? png() : null));
    expect(out.source).toContain('![bad](https://x.test/missing.png)');
    expect(out.source).toContain('![ok](data:image/png;base64,');
    expect(out.failed).toEqual(['https://x.test/missing.png']);
  });

  it('treats a type the renderer does not allow, or a throwing fetch, as failed', async () => {
    const source = '![a](a.bmp) ![b](b.png)';
    const out = await packImages(source, async (src) => {
      if (src === 'b.png') throw new Error('boom');
      return new Blob(['x'], { type: 'image/bmp' });
    });
    expect(out.source).toBe(source);
    expect(out.failed).toEqual(['a.bmp', 'b.png']);
  });

  it('leaves images inside code fences, data: images and other schemes alone', async () => {
    const source = ['```', '![x](in-fence.png)', '```', '![d](data:image/png;base64,AAAA)', '![j](javascript:alert(1))', '![r](r.png)'].join('\n');
    const calls: string[] = [];
    const out = await packImages(source, async (src) => {
      calls.push(src);
      return png();
    });
    expect(calls).toEqual(['r.png']);
    expect(out.source).toContain('![x](in-fence.png)');
    expect(out.source).toContain('![d](data:image/png;base64,AAAA)');
    expect(out.source).toContain('![j](javascript:alert(1))');
  });

  it('fetches a repeated src once, and strips content-type parameters', async () => {
    let n = 0;
    const out = await packImages('![a](x.svg) ![b](x.svg)', async () => {
      n += 1;
      return new Blob(['<svg/>'], { type: 'image/svg+xml; charset=utf-8' });
    });
    expect(n).toBe(1);
    expect(out.source.match(/data:image\/svg\+xml;base64,/g)).toHaveLength(2);
  });

  it('encodes a large blob without overflowing the stack', async () => {
    const bytes = new Uint8Array(1_000_000).fill(7);
    const uri = await blobToDataUri(new Blob([bytes], { type: 'image/png' }));
    expect(uri).toBe(`data:image/png;base64,${Buffer.from(bytes).toString('base64')}`);
  });
});

describe('dataUriKb', () => {
  it('is the decoded size in KB, rounded', () => {
    const payload = 'A'.repeat(4096); // 3072 bytes
    expect(dataUriKb(`data:image/png;base64,${payload}`)).toBe(3);
    expect(dataUriKb(`data:image/png;base64,${'A'.repeat(4 * 1024 * 3)}`)).toBe(9);
  });
});
