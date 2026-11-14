import { describe, expect, it } from 'vitest';
import { slideDividers } from '../../src/core/dividers';

describe('slideDividers', () => {
  it('finds each line that starts a slide, with the slide number and its first heading', () => {
    const src = '# One\n\n---\n\n## Two ##\ntext\n\n---\n\nno heading here\n';
    expect(slideDividers(src)).toEqual([
      { pos: 7, slide: 2, title: 'Two' },
      { pos: 28, slide: 3, title: '' },
    ]);
  });

  it('does not count the settings block', () => {
    const src = '---\ntitle: Talk\n---\n\n# One\n\n---\n\n# Two\n';
    const found = slideDividers(src);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ slide: 2, title: 'Two' });
    expect(src.slice(found[0]!.pos, found[0]!.pos + 3)).toBe('---');
    expect(found[0]!.pos).toBe(src.lastIndexOf('---'));
  });

  it('skips a leading --- that is not a settings block', () => {
    expect(slideDividers('---\n# One\n---\n# Two\n').map((d) => d.slide)).toEqual([2]);
  });

  it('ignores --- and headings inside a code block', () => {
    const src = '# One\n\n```\n---\n# not a title\n```\n\n---\n\n```\n# code\n```\n# Real\n';
    expect(slideDividers(src)).toEqual([{ pos: src.lastIndexOf('---'), slide: 2, title: 'Real' }]);
  });

  it('labels a new slide as soon as its --- is typed', () => {
    expect(slideDividers('# One\n\n---\n')).toEqual([{ pos: 7, slide: 2, title: '' }]);
  });

  it('returns nothing for a deck with one slide', () => {
    expect(slideDividers('# Only\n')).toEqual([]);
  });
});
