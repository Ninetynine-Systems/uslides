import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '../../src/core/markdown';

describe('renderMarkdown', () => {
  it('renders normal markdown', () => {
    expect(renderMarkdown('# Title')).toContain('<h1>Title</h1>');
    expect(renderMarkdown('- a\n- b')).toContain('<li>a</li>');
    expect(renderMarkdown('**bold**')).toContain('<strong>bold</strong>');
    expect(renderMarkdown('|a|b|\n|-|-|\n|1|2|')).toContain('<table>');
    expect(renderMarkdown('```js\nlet x = 1;\n```')).toContain('<pre><code class="language-js">');
  });

  it('marks top-level block openings with their source line only when asked', () => {
    const source = '# Title\n\n- one\n- two';
    const marked = renderMarkdown(source, { sourceLines: true });
    expect(marked).toContain('<h1 data-line="0">');
    expect(marked).toContain('<ul data-line="2">');
    expect(marked).not.toMatch(/<li[^>]*data-line/);
    expect(renderMarkdown(source)).not.toContain('data-line=');
  });

  it('renders *** as a horizontal rule', () => {
    expect(renderMarkdown('***')).toContain('<hr>');
  });

  it('escapes raw HTML', () => {
    const out = renderMarkdown('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;script&gt;');
  });

  it('hides HTML comments, inline and block', () => {
    const inline = renderMarkdown('a <!-- hidden --> b');
    expect(inline).not.toContain('hidden');
    expect(inline).not.toContain('&lt;!--');
    expect(inline).toContain('a');
    expect(inline).toContain('b');
    expect(renderMarkdown('<!-- x -->\n\n# T').trim()).toBe('<h1>T</h1>');
    expect(renderMarkdown('# T\n\n<!-- slide layout=x -->\n\ntext')).not.toContain('slide layout');
  });

  describe('links', () => {
    it('drops javascript: hrefs and keeps the text', () => {
      const out = renderMarkdown('[x](javascript:alert(1))');
      expect(out).not.toContain('javascript:');
      expect(out).not.toContain('<a');
      expect(out).toContain('x');
    });
    it('rejects other schemes and data: and protocol-relative', () => {
      for (const u of ['data:text/html,hi', 'vbscript:x', 'file:///etc/passwd', '//evil.com', 'JaVaScRiPt:alert(1)']) {
        expect(renderMarkdown(`[x](${u})`)).not.toContain('<a');
      }
    });
    it('allows https, http, mailto, relative and anchors with target/rel', () => {
      for (const u of ['https://a.com/x', 'http://a.com', 'mailto:a@b.com', './x.md', '#top']) {
        const out = renderMarkdown(`[x](${u})`);
        expect(out).toContain(`href="${u}"`);
        expect(out).toContain('target="_blank" rel="noopener noreferrer"');
      }
    });
    it('autolinks http(s) URLs with target/rel', () => {
      const out = renderMarkdown('see https://example.com now');
      expect(out).toContain('href="https://example.com"');
      expect(out).toContain('rel="noopener noreferrer"');
    });
  });

  describe('images', () => {
    it('draws a blocked web image as a placeholder with its alt text', () => {
      expect(renderMarkdown('![Sales chart](https://x.example/c.png)', { blockExternal: true }))
        .toContain('<span class="us-blocked" role="img" aria-label="Sales chart">Sales chart</span>');
    });
    it('never blocks data images or stored images', () => {
      expect(renderMarkdown('![data](data:image/png;base64,AA==)', { blockExternal: true })).toContain('<img');
      expect(renderMarkdown('![stored](./chart.png)', {
        blockExternal: true,
        resolveImage: () => 'blob:stored',
      })).toContain('<img src="blob:stored"');
    });
    it('uses Image for an empty blocked image description and escapes descriptions', () => {
      expect(renderMarkdown('![](https://x.example/empty.png)', { blockExternal: true }))
        .toContain('aria-label="Image">Image</span>');
      const out = renderMarkdown('![a"><b>](https://x.example/evil.png)', { blockExternal: true });
      expect(out).not.toContain('<b>');
      expect(out).toContain('aria-label="a&quot;&gt;&lt;b&gt;"');
      expect(out).not.toContain('https://x.example');
    });
    it('drops data:text/html images', () => {
      expect(renderMarkdown('![x](data:text/html,<script>alert(1)</script>)')).not.toContain('<img');
    });
    it('drops javascript: and protocol-relative images', () => {
      expect(renderMarkdown('![x](javascript:alert(1))')).not.toContain('<img');
      expect(renderMarkdown('![x](//evil.com/x.png)')).not.toContain('<img');
    });
    it('keeps data:image/png, case-insensitive, and svg+xml', () => {
      expect(renderMarkdown('![x](data:image/png;base64,AAA)')).toContain('<img src="data:image/png;base64,AAA"');
      expect(renderMarkdown('![x](DATA:IMAGE/PNG;base64,AAA)')).toContain('<img');
      expect(renderMarkdown('![x](data:image/svg+xml;base64,AAA)')).toContain('<img');
    });
    it('keeps https images', () => {
      expect(renderMarkdown('![a](https://a.com/p.png)')).toContain('src="https://a.com/p.png"');
    });
    it('resolves relative paths with the resolver', () => {
      const out = renderMarkdown('![c](./chart.png)', { resolveImage: () => 'blob:abc' });
      expect(out).toContain('src="blob:abc"');
      expect(out).toContain('alt="c"');
    });
    it('does not call the resolver for absolute URLs', () => {
      const out = renderMarkdown('![c](https://a.com/p.png)', {
        resolveImage: () => {
          throw new Error('should not be called');
        },
      });
      expect(out).toContain('https://a.com/p.png');
    });
    it('renders a placeholder when the resolver returns undefined, escaped', () => {
      const out = renderMarkdown('![c](./chart.png)', { resolveImage: () => undefined });
      expect(out).toContain('<span class="us-missing" data-src="./chart.png">Image not found: ./chart.png</span>');
      expect(out).not.toContain('<img');
      const evil = renderMarkdown('![c](<./a"><b>.png>)', { resolveImage: () => undefined });
      expect(evil).not.toContain('<b>');
      expect(evil).toContain('&quot;');
    });
    it('keeps the original relative src without a resolver', () => {
      expect(renderMarkdown('![c](./chart.png)')).toContain('src="./chart.png"');
    });
    it('escapes alt text', () => {
      const out = renderMarkdown('![a"><b>](https://a.com/p.png)');
      expect(out).not.toContain('<b>');
    });
  });

  describe('review regressions', () => {
    it('hides a multi-line comment with a blank line right after paragraph text', () => {
      const out = renderMarkdown('Intro\n<!-- note: a\n\nb -->');
      expect(out).not.toContain('note');
      expect(out).not.toContain('&lt;!--');
      expect(out).toContain('Intro');
    });
    it('does not linkify bare email addresses', () => {
      const out = renderMarkdown('mail a@b.com now');
      expect(out).not.toContain('<a');
      expect(out).toContain('a@b.com');
    });
    it('rejects an unsafe value returned by the resolver', () => {
      const out = renderMarkdown('![c](./chart.png)', { resolveImage: () => 'javascript:alert(1)' });
      expect(out).not.toContain('<img');
      expect(out).not.toContain('javascript:');
      expect(out).toContain('us-missing');
    });
    it('accepts blob: and data:image values from the resolver', () => {
      expect(renderMarkdown('![c](./a.png)', { resolveImage: () => 'blob:x' })).toContain('src="blob:x"');
      expect(renderMarkdown('![c](./a.png)', { resolveImage: () => 'data:image/png;base64,AA' })).toContain('<img');
    });
    it('blocks javascript: via entities, references and autolinks; does not linkify ftp', () => {
      expect(renderMarkdown('[x](javascript&colon;alert(1))')).not.toContain('<a');
      expect(renderMarkdown('[x][r]\n\n[r]: javascript:alert(1)')).not.toContain('<a');
      expect(renderMarkdown('![x][r]\n\n[r]: javascript:alert(1)')).not.toContain('<img');
      expect(renderMarkdown('<javascript:alert(1)>')).not.toContain('<a');
      expect(renderMarkdown('ftp://x.com')).not.toContain('<a');
    });
  });
});
