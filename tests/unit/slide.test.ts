import { describe, expect, it } from 'vitest';
import { parseDeck } from '../../src/core/parse';
import { parseSettings } from '../../src/core/settings';
import { splitSlides } from '../../src/core/split';
import { parseSlide } from '../../src/core/slide';

/** Parses the first slide of `src` with default deck settings. */
function slideOf(src: string, index = 0) {
  const { settings, bodyStart } = parseSettings(src);
  const raws = splitSlides(src, bodyStart);
  return parseSlide(raws[index]!, index, settings);
}

describe('slide comment', () => {
  it('reads grid, bg and color from the first non-blank line', () => {
    const { slide, warnings } = slideOf('\n<!-- slide grid=32x18 bg=#111111 color=white -->\n# Hi\n');
    expect(slide.grid).toEqual({ cols: 32, rows: 18 });
    expect(slide.bg).toBe('#111111');
    expect(slide.color).toBe('white');
    expect(slide.loose).toBe('# Hi');
    expect(warnings).toEqual([]);
  });

  it('ignores the same comment on a later line, without a warning', () => {
    const { slide, warnings } = slideOf('# Hi\n<!-- slide grid=32x18 -->\n');
    expect(slide.grid).toEqual({ cols: 12, rows: 6 });
    expect(warnings).toEqual([]);
  });

  it('warns about a bad grid, bad colour and unknown key', () => {
    const { slide, warnings } = slideOf('<!-- slide grid=big bg=url(x) foo=1 -->\n# Hi');
    expect(slide.grid).toEqual({ cols: 12, rows: 6 });
    expect(slide.bg).toBeUndefined();
    expect(warnings).toHaveLength(3);
  });
});

describe('notes', () => {
  it('collects notes and removes them from loose text and box markdown', () => {
    const { slide } = slideOf(
      '# A\n<!-- note: say hi -->\n::: box\ntext\n<!-- note: second -->\nmore\n:::\n',
    );
    expect(slide.notes).toEqual(['say hi', 'second']);
    expect(slide.loose).toBe('# A');
    expect(slide.boxes[0]!.markdown).toBe('text\nmore');
  });

  it('reads a note that spans several lines', () => {
    const { slide } = slideOf('# A\n<!-- note: line one\nline two -->\nB');
    expect(slide.notes).toEqual(['line one\nline two']);
    expect(slide.loose).toBe('# A\n\nB');
  });

  it('does not read notes inside code fences', () => {
    const { slide } = slideOf('```\n<!-- note: no -->\n```');
    expect(slide.notes).toEqual([]);
    expect(slide.loose).toContain('<!-- note: no -->');
  });
});

describe('unclosed note', () => {
  it('warns at the line where the note opened and keeps earlier text', () => {
    const src = '# A\n<!-- note: forgot\n::: box\n# Big\n:::\nmore';
    const { slide, warnings } = slideOf(src);
    expect(slide.loose).toBe('# A');
    expect(slide.notes).toHaveLength(1);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.message).toContain('not closed');
    expect(warnings[0]!.slideIndex).toBe(0);
    expect(src.slice(warnings[0]!.range.from, warnings[0]!.range.to)).toBe('<!-- note: forgot');
  });
});

describe('malformed slide comment', () => {
  it('warns and keeps the line when text follows the comment', () => {
    const src = '<!-- slide grid=16x9 --> # Title\nbody';
    const { slide, warnings } = slideOf(src);
    expect(slide.grid).toEqual({ cols: 12, rows: 6 });
    expect(slide.loose).toBe(src);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.message).toContain('one line');
    expect(src.slice(warnings[0]!.range.from, warnings[0]!.range.to)).toBe('<!-- slide grid=16x9 --> # Title');
  });

  it('warns and keeps the line when the comment spans lines', () => {
    const { slide, warnings } = slideOf('<!-- slide grid=16x9\n-->\nbody');
    expect(slide.loose).toContain('<!-- slide grid=16x9');
    expect(warnings).toHaveLength(1);
  });
});

describe('boxes', () => {
  it('records each free-flowing piece between boxes', () => {
    const src = '# Title\n\n::: box\nx\n:::\n\nMiddle\n\n::: box\ny\n:::\n';
    const d = parseDeck(src);
    expect(d.slides[0]!.looseRanges.map((r) => src.slice(r.from, r.to).trim())).toEqual(['# Title', 'Middle']);
  });

  it('maps every rendered loose line back to its source line', () => {
    const src = 'Intro\n::: box\nx\n:::\nTail';
    const slide = parseDeck(src).slides[0]!;
    expect(slide.loose).toBe('Intro\n\nTail');
    expect(slide.looseLines).toEqual([0, src.indexOf('::: box'), src.indexOf('Tail')]);
  });

  it('parses attributes, markdown and content range', () => {
    const src = '::: box col=1-7 row=2-6 bg=#1e3a8a color=white\n## T\n:::\n';
    const { slide, warnings } = slideOf(src);
    const box = slide.boxes[0]!;
    expect(box.col).toEqual([1, 7]);
    expect(box.row).toEqual([2, 6]);
    expect(box.bg).toBe('#1e3a8a');
    expect(box.color).toBe('white');
    expect(box.markdown).toBe('## T');
    expect(src.slice(box.contentRange.from, box.contentRange.to)).toBe('## T');
    expect(src.slice(box.range.from, box.range.to)).toBe(src.trimEnd());
    expect(warnings).toEqual([]);
  });

  it('reads font="Playfair Display" on a box', () => {
    const src = '::: box font="Playfair Display"\n## T\n:::\n';
    const { slide, warnings } = slideOf(src);
    const box = slide.boxes[0]!;
    expect(box.font).toBe('Playfair Display');
    expect(src.slice(box.fontRange!.from, box.fontRange!.to)).toBe('::: box font="Playfair Display"');
    expect(warnings).toEqual([]);
  });

  it('font=default means no font', () => {
    const { slide, warnings } = slideOf('::: box font=default\nx\n:::');
    expect(slide.boxes[0]!.font).toBeUndefined();
    expect(slide.boxes[0]!.fontRange).toBeUndefined();
    expect(warnings).toEqual([]);
  });

  it('refuses a font name that could break CSS', () => {
    const d = parseDeck('::: box font="a}b"\nHi\n:::\n');
    expect(d.slides[0]!.boxes[0]!.font).toBeUndefined();
    expect(d.warnings[0]!.message).toBe('Invalid font name "a}b". Font names use only letters, numbers and spaces.');
  });

  it('refuses a font name longer than 60 characters', () => {
    const name = 'A'.repeat(61);
    const d = parseDeck(`::: box font="${name}"\nHi\n:::\n`);
    expect(d.slides[0]!.boxes[0]!.font).toBeUndefined();
    expect(d.warnings[0]!.message).toBe(`Invalid font name "${name}". Font names use only letters, numbers and spaces.`);
  });

  it('uses defaults', () => {
    const { slide } = slideOf('::: box\nx\n:::');
    const box = slide.boxes[0]!;
    expect(box.col).toEqual([1, 12]);
    expect(box.row).toEqual([1, 6]);
    expect(box.align).toBe('left');
    expect(box.valign).toBe('top');
    expect(box.fit).toBe('contain');
    expect(box.bg).toBeUndefined();
  });

  it('uses the slide grid for defaults and clamping', () => {
    const { slide } = slideOf('<!-- slide grid=16x9 -->\n::: box col=3\nx\n:::');
    expect(slide.boxes[0]!.col).toEqual([3, 3]);
    expect(slide.boxes[0]!.row).toEqual([1, 9]);
  });

  it('keeps file order and puts outside text in loose', () => {
    const { slide } = slideOf('before\n::: box\nA\n:::\nmiddle\n::: box\nB\n:::\nafter');
    expect(slide.boxes.map((b) => b.markdown)).toEqual(['A', 'B']);
    expect(slide.loose).toBe('before\n\nmiddle\n\nafter');
  });

  it('clamps positions outside the grid with a warning', () => {
    const { slide, warnings } = slideOf('::: box col=10-15\nx\n:::');
    expect(slide.boxes[0]!.col).toEqual([10, 12]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.message).toContain('outside the grid');
    expect(warnings[0]!.slideIndex).toBe(0);
  });

  it('warns about a bad colour, unknown attribute and bad align', () => {
    const src = '::: box bg=url(x) foo=1 align=middle\nx\n:::';
    const { slide, warnings } = slideOf(src);
    expect(slide.boxes[0]!.bg).toBeUndefined();
    expect(slide.boxes[0]!.align).toBe('left');
    expect(warnings).toHaveLength(3);
    for (const w of warnings) expect(src.slice(w.range.from, w.range.to)).toBe(src.split('\n')[0]);
  });

  it('keeps a nested box as literal text and warns', () => {
    const src = '::: box\nouter\n::: box col=1\ninner\n:::\nafter\n:::\n';
    const { slide, warnings } = slideOf(src);
    expect(slide.boxes).toHaveLength(1);
    expect(slide.boxes[0]!.markdown).toBe('outer\n::: box col=1\ninner');
    expect(slide.loose).toBe('after\n:::');
    const nested = warnings.filter((w) => w.message.includes('nested'));
    expect(nested).toHaveLength(1);
    expect(src.slice(nested[0]!.range.from, nested[0]!.range.to)).toBe('::: box col=1');
  });

  it('runs an unclosed box to the end of the slide and warns', () => {
    const src = '::: box\n# A\n---\n# Next';
    const { slide, warnings } = slideOf(src);
    expect(slide.boxes[0]!.markdown).toBe('# A');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.message).toContain('not closed');
    expect(src.slice(warnings[0]!.range.from, warnings[0]!.range.to)).toBe('::: box');
    const next = slideOf(src, 1);
    expect(next.slide.loose).toBe('# Next');
    expect(next.slide.boxes).toEqual([]);
    expect(next.warnings).toEqual([]);
  });

  it('does not start a box inside a code fence', () => {
    const { slide, warnings } = slideOf('```\n::: box\nx\n:::\n```');
    expect(slide.boxes).toEqual([]);
    expect(slide.loose).toContain('::: box');
    expect(warnings).toEqual([]);
  });

  it('does not close a box at a fenced :::', () => {
    const { slide } = slideOf('::: box\n```\n:::\n```\n:::');
    expect(slide.boxes[0]!.markdown).toBe('```\n:::\n```');
  });

  it('treats ::: with another word as plain text and warns', () => {
    const { slide, warnings } = slideOf('::: note\nhello\n:::');
    expect(slide.boxes).toEqual([]);
    expect(slide.loose).toContain('::: note');
    expect(warnings.length).toBeGreaterThan(0);
  });
});
