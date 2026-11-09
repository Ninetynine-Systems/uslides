import { describe, expect, it } from 'vitest';
import { parseSettings } from '../../src/core/settings';
import { splitSlides } from '../../src/core/split';

const split = (src: string) => splitSlides(src, parseSettings(src).bodyStart);

describe('splitSlides', () => {
  it('splits on ---', () => {
    const s = split('# A\n\n---\n\n# B');
    expect(s.map((x) => x.text.trim())).toEqual(['# A', '# B']);
  });
  it('does not split inside fences', () => {
    expect(split('```\n---\n```\n').length).toBe(1);
    expect(split('~~~\n---\n~~~\n').length).toBe(1);
    expect(split('````\n```\n---\n````\n---\nB').length).toBe(2);
  });
  it('does not treat text above --- as a heading', () => {
    expect(split('Some text\n---\n# B').map((x) => x.text)).toEqual(['Some text', '# B']);
  });
  it('only splits on exactly ---', () => {
    expect(split('a\n----\nb\n --- \nc').length).toBe(1);
  });
  it('handles empty body and trailing ---', () => {
    expect(split('')).toEqual([{ text: '', range: { from: 0, to: 0 } }]);
    expect(split('---\ntitle: T\n---\n')).toHaveLength(1);
    expect(split('# A\n---\n').map((x) => x.text.trim())).toEqual(['# A']);
  });
  it('skips a leading --- that is not settings', () => {
    expect(split('---\n# A\n---\n# B').map((x) => x.text.trim())).toEqual(['# A', '# B']);
  });
  it('starts after the settings block', () => {
    const src = '---\ngrid: 8x4\n---\n# A\n---\n# B';
    expect(split(src).map((x) => x.text.trim())).toEqual(['# A', '# B']);
  });
  it('ranges slice back to the slide text', () => {
    const src = '---\ntitle: T\n---\nOne\n\n---\nTwo\n---\n\nThree\n';
    const slides = split(src);
    expect(slides).toHaveLength(3);
    for (const s of slides) expect(src.slice(s.range.from, s.range.to)).toBe(s.text);
    expect(slides[1]!.text).toBe('Two');
  });
});
