import { describe, expect, it } from 'vitest';
import {
  bringToFront,
  deleteBox,
  duplicateBox,
  insertBox,
  insertSlideAfter,
  sendToBack,
  setBoxAttrs,
  setBoxSpan,
  setDeckFont,
  type Edit,
  type EditResult,
} from '../../src/core/edit';
import { parseDeck, type Deck } from '../../src/core/parse';
import type { Box, Slide } from '../../src/core/slide';

function apply(source: string, result: EditResult): string;
function apply(source: string, result: Edit[]): string;
function apply(source: string, result: EditResult | Edit[]): string {
  const changes = Array.isArray(result) ? result : result.changes;
  return [...changes]
    .sort((a, b) => b.from - a.from)
    .reduce((text, change) => text.slice(0, change.from) + change.insert + text.slice(change.to), source);
}

function renderedSlide(slide: Slide) {
  return {
    loose: slide.loose,
    boxes: slide.boxes.map((item) => item.markdown),
    notes: slide.notes,
  };
}

function expectSlideInserted(source: string, targetIndex?: number) {
  const before = parseDeck(source);
  const target = targetIndex === undefined ? undefined : before.slides[targetIndex]!;
  const result = insertSlideAfter(before.source, target);
  const changed = apply(before.source, result);
  const after = parseDeck(changed);
  const insertedAt = target === undefined ? 0 : target.index + 1;
  const previousSlides = target === undefined ? [] : before.slides;
  const inserted = after.slides[insertedAt]!;

  expect(after.slides).toHaveLength(previousSlides.length + 1);
  expect(inserted.index).toBe(insertedAt);
  expect(inserted.loose).toBe('# New slide');
  expect(changed.slice(result.select, result.selectTo)).toBe('New slide');
  expect(after.slides.filter((_, index) => index !== insertedAt).map(renderedSlide)).toEqual(
    previousSlides.map(renderedSlide),
  );

  return { after, changed, result };
}

function box(deck: Deck): Box {
  return deck.slides[0]!.boxes[0]!;
}

function run(source: string, edit: (deck: Deck) => EditResult): string {
  const deck = parseDeck(source);
  return apply(deck.source, edit(deck).changes);
}

describe('slide source edits', () => {
  it('inserts after a middle slide', () => {
    expectSlideInserted('# A\n\n---\n\n# B\n', 0);
  });

  it('inserts after the last slide with one final line break', () => {
    const { changed } = expectSlideInserted('# A\n\n---\n\n# B\n', 1);

    expect(changed.endsWith('# New slide\n')).toBe(true);
    expect(changed.includes('\n\n\n')).toBe(false);
  });

  it('inserts after the last slide when the source has no final line break', () => {
    expectSlideInserted('# A\n\n---\n\n# B', 1);
  });

  it('keeps a speaker note with its slide', () => {
    const { after } = expectSlideInserted('# A\n\n<!-- note: say hi -->\n\n---\n\n# B\n', 0);

    expect(after.slides[0]!.notes).toEqual(['say hi']);
    expect(after.slides[1]!.notes).toEqual([]);
  });

  it('leaves the settings block unchanged', () => {
    const source = '---\ntitle: T\n---\n\n# A\n';
    const { changed } = expectSlideInserted(source, 0);

    expect(changed.split('\n').slice(0, 5)).toEqual(source.split('\n').slice(0, 5));
  });

  it('keeps a box on the preceding slide', () => {
    const { after } = expectSlideInserted('# A\n\n::: box col=1-6 row=2-6\nhi\n:::\n', 0);

    expect(after.slides[0]!.boxes).toHaveLength(1);
  });

  it('creates the first slide in an empty deck', () => {
    expectSlideInserted('');
  });

  it('closes an open backtick fence before inserting a slide', () => {
    const source = '# A\n\n```js\ncode\n';
    const before = parseDeck(source);
    const result = insertSlideAfter(before.source, before.slides[0]);
    const changed = apply(before.source, result);
    const after = parseDeck(changed);

    expect(before.slides).toHaveLength(1);
    expect(after.slides).toHaveLength(2);
    expect(after.slides[1]!.loose).toBe('# New slide');
    expect(after.slides[0]!.loose).toContain('code');
    expect(changed.slice(result.select, result.selectTo)).toBe('New slide');
  });

  it('closes an open tilde fence before inserting a slide', () => {
    const source = '# A\n\n~~~js\ncode\n';
    const before = parseDeck(source);
    const result = insertSlideAfter(before.source, before.slides[0]);
    const changed = apply(before.source, result);
    const after = parseDeck(changed);

    expect(before.slides).toHaveLength(1);
    expect(after.slides).toHaveLength(2);
    expect(after.slides[1]!.loose).toBe('# New slide');
    expect(after.slides[0]!.loose).toContain('code');
    expect(changed.slice(result.select, result.selectTo)).toBe('New slide');
  });

  it('keeps a separator inside an open four-backtick fence', () => {
    const source = '# A\n\n````\ncode\n\n---\n\nmore\n';
    const before = parseDeck(source);
    const result = insertSlideAfter(before.source, before.slides[0]);
    const changed = apply(before.source, result);
    const after = parseDeck(changed);

    expect(before.slides).toHaveLength(1);
    expect(after.slides).toHaveLength(2);
    expect(after.slides[1]!.loose).toBe('# New slide');
    expect(after.slides[0]!.loose).toContain('---');
    expect(after.slides[0]!.loose).toContain('more');
    expect(changed.slice(result.select, result.selectTo)).toBe('New slide');
  });

  it('does not add a fence line after a closed fence', () => {
    const source = '# A\n\n```\ncode\n```\n';
    const before = parseDeck(source);
    const result = insertSlideAfter(before.source, before.slides[0]);
    const changed = apply(before.source, result);

    expect(changed).toBe('# A\n\n```\ncode\n```\n\n---\n\n# New slide\n');
  });
});

describe('box source edits', () => {
  it('replaces an attribute value in place and keeps everything else', () => {
    const src = '::: box   col=2  row="1-3" data-x=keep bg=red\nHi\n:::\n';
    expect(run(src, (d) => setBoxAttrs(d.source, box(d), { bg: '#2563eb' }))).toBe(
      '::: box   col=2  row="1-3" data-x=keep bg=#2563eb\nHi\n:::\n',
    );
  });

  it('adds a new attribute at the end of the opening line', () => {
    expect(run('::: box col=1-6\nHi\n:::\n', (d) => setBoxAttrs(d.source, box(d), { align: 'center' }))).toBe(
      '::: box col=1-6 align=center\nHi\n:::\n',
    );
  });

  it('removes an attribute and the one space before it', () => {
    expect(run('::: box col=1-6 bg=red row=2\nHi\n:::\n', (d) => setBoxAttrs(d.source, box(d), { bg: null }))).toBe(
      '::: box col=1-6 row=2\nHi\n:::\n',
    );
  });

  it('removes every occurrence of a repeated attribute', () => {
    expect(run('::: box bg=red bg=blue\nx\n:::\n', (d) => setBoxAttrs(d.source, box(d), { bg: null }))).toBe(
      '::: box\nx\n:::\n',
    );
  });

  it('removes an attribute from a tab-separated opening line', () => {
    expect(run('::: box\tcol=1\tbg=red\nx\n:::\n', (d) => setBoxAttrs(d.source, box(d), { bg: null }))).toBe(
      '::: box\tcol=1\nx\n:::\n',
    );
  });

  it('removes a quoted attribute', () => {
    expect(run('::: box col=1 bg="#ff0000"\nx\n:::\n', (d) => setBoxAttrs(d.source, box(d), { bg: null }))).toBe(
      '::: box col=1\nx\n:::\n',
    );
  });

  it('quotes a value that contains a space', () => {
    expect(run('::: box\nHi\n:::\n', (d) => setBoxAttrs(d.source, box(d), { font: 'Playfair Display' }))).toBe(
      '::: box font="Playfair Display"\nHi\n:::\n',
    );
  });

  it('refuses attribute and span edits when the opening line has an unterminated quote', () => {
    const deck = parseDeck('::: box bg="broken\nx\n:::\n');
    const target = box(deck);

    expect(setBoxAttrs(deck.source, target, { bg: 'red' })).toEqual({ changes: [] });
    expect(setBoxSpan(deck.source, target, [2, 3], [2, 2], deck.settings.grid)).toEqual({ changes: [] });
  });

  it('refuses values containing a newline or carriage return', () => {
    const deck = parseDeck('::: box bg=red\nx\n:::\n');
    const target = box(deck);

    expect(setBoxAttrs(deck.source, target, { bg: 'blue\ncolor=red' })).toEqual({ changes: [] });
    expect(setBoxAttrs(deck.source, target, { bg: 'blue\rcolor=red' })).toEqual({ changes: [] });
  });

  it('moving a box changes only col and row', () => {
    const src = '<!-- slide bg=#000 -->\n\n::: box row=2 col=1-3 color=white\n**Hi**\n:::\n';
    expect(run(src, (d) => setBoxSpan(d.source, box(d), [4, 6], [3, 3], d.settings.grid))).toBe(
      '<!-- slide bg=#000 -->\n\n::: box row=3 col=4-6 color=white\n**Hi**\n:::\n',
    );
  });

  it('inserts an empty box at the end of the slide and selects its empty line', () => {
    const src = '# A\n\n---\n\n# B\n';
    const d = parseDeck(src);
    const r = insertBox(d.source, d.slides[0]!, [1, 3], [1, 2]);
    expect(apply(src, r.changes)).toBe('# A\n\n::: box col=1-3 row=1-2\n\n:::\n\n---\n\n# B\n');
    expect(r.select).toBe('# A\n\n::: box col=1-3 row=1-2\n'.length);
  });

  it('deletes a box block and one blank line after it', () => {
    const src = '# A\n\n::: box\nx\n:::\n\nTail\n';
    expect(run(src, (d) => deleteBox(d.source, box(d)))).toBe('# A\n\nTail\n');
  });

  it('deletes the last box without leaving an extra blank line', () => {
    const src = '# A\n\n::: box\nx\n:::\n';
    expect(run(src, (d) => deleteBox(d.source, box(d)))).toBe('# A\n');
  });

  it('bring to front moves the block after the last box; send to back before the first', () => {
    const src = '::: box\na\n:::\n\n::: box\nb\n:::\n\n::: box\nc\n:::\n';
    const front = parseDeck(src);
    expect(apply(front.source, bringToFront(front.source, front.slides[0]!, front.slides[0]!.boxes[0]!).changes)).toBe(
      '::: box\nb\n:::\n\n::: box\nc\n:::\n\n::: box\na\n:::\n',
    );

    const back = parseDeck(src);
    expect(apply(back.source, sendToBack(back.source, back.slides[0]!, back.slides[0]!.boxes[2]!).changes)).toBe(
      '::: box\nc\n:::\n\n::: box\na\n:::\n\n::: box\nb\n:::\n',
    );

    expect(bringToFront(front.source, front.slides[0]!, front.slides[0]!.boxes[2]!)).toEqual({ changes: [] });
  });

  it('keeps free-flowing text when moving boxes to the front or back', () => {
    const src = '::: box\na\n:::\n\nBetween\n\n::: box\nb\n:::\n';
    const front = parseDeck(src);
    expect(apply(front.source, bringToFront(front.source, front.slides[0]!, front.slides[0]!.boxes[0]!).changes)).toBe(
      'Between\n\n::: box\nb\n:::\n\n::: box\na\n:::\n',
    );

    const back = parseDeck(src);
    expect(apply(back.source, sendToBack(back.source, back.slides[0]!, back.slides[0]!.boxes[1]!).changes)).toBe(
      '::: box\nb\n:::\n\n::: box\na\n:::\n\nBetween\n',
    );
  });

  it('duplicate puts the copy after the last box, one cell right and down', () => {
    const src = '::: box col=1-2 row=1 data-x=keep\na\n:::\n\n::: box col=8 row=4\nb\n:::\n';
    const d = parseDeck(src);
    expect(apply(d.source, duplicateBox(d.source, d.slides[0]!, d.slides[0]!.boxes[0]!, d.settings.grid).changes)).toBe(
      '::: box col=1-2 row=1 data-x=keep\na\n:::\n\n::: box col=8 row=4\nb\n:::\n\n' +
        '::: box col=2-3 row=2 data-x=keep\na\n:::\n',
    );
  });

  it('works on a source that had CRLF line endings', () => {
    const d = parseDeck('::: box col=1\r\nHi\r\n:::\r\n');
    expect(apply(d.source, setBoxAttrs(d.source, d.slides[0]!.boxes[0]!, { bg: 'red' }).changes)).toBe(
      '::: box col=1 bg=red\nHi\n:::\n',
    );
  });

  it('accepts a box opened as ":::box"', () => {
    expect(run(':::box col=1\nHi\n:::\n', (d) => setBoxAttrs(d.source, box(d), { bg: 'red' }))).toBe(
      ':::box col=1 bg=red\nHi\n:::\n',
    );
  });
});

describe('deck font source edits', () => {
  const slideSources = (deck: Deck) => deck.slides.map((slide) =>
    deck.source.slice(slide.range.from, slide.range.to));

  it('adds a font line to an existing settings block', () => {
    const source = '---\ntitle: A deck\n---\n\n# A\n';

    expect(apply(source, setDeckFont(source, 'Lora').changes)).toBe(
      '---\nfont: Lora\ntitle: A deck\n---\n\n# A\n',
    );
  });

  it('replaces an existing font line', () => {
    const source = '---\ntitle: A deck\nfont: Inter\ntheme: dark\n---\n\n# A\n';

    expect(apply(source, setDeckFont(source, 'Playfair Display').changes)).toBe(
      '---\ntitle: A deck\nfont: Playfair Display\ntheme: dark\n---\n\n# A\n',
    );
  });

  it('replaces only the font value and keeps a trailing YAML comment', () => {
    const source = '---\nfont: Lora # c\ntheme: dark\n---\n\n# A\n';

    expect(apply(source, setDeckFont(source, 'Open Sans').changes)).toBe(
      '---\nfont: Open Sans # c\ntheme: dark\n---\n\n# A\n',
    );
  });

  it('removes an existing font line', () => {
    const source = '---\ntitle: A deck\nfont: Inter\ntheme: dark\n---\n\n# A\n';

    expect(apply(source, setDeckFont(source, null).changes)).toBe(
      '---\ntitle: A deck\ntheme: dark\n---\n\n# A\n',
    );
  });

  it('removes a settings block that only contains the font', () => {
    const source = '---\nfont: Inter\n---\n\n# A\n';

    expect(apply(source, setDeckFont(source, null).changes)).toBe('# A\n');
  });

  it('keeps a comment-only settings block from becoming a slide separator', () => {
    const source = '---\n# Keep this note.\nfont: Lora\n---\n\n# A\n\n---\n\n# B\n';
    const before = parseDeck(source);
    const changed = apply(source, setDeckFont(source, null).changes);
    const after = parseDeck(changed);

    expect(after.settings.font).toBeUndefined();
    expect(slideSources(after)).toEqual(slideSources(before));
    expect(changed).toContain('# Keep this note.');
  });

  it('keeps an unknown setting from becoming a slide separator', () => {
    const source = '---\nfont: Lora\ncustom: keep\n---\n\n# A\n\n---\n\n# B\n';
    const before = parseDeck(source);
    const changed = apply(source, setDeckFont(source, null).changes);
    const after = parseDeck(changed);

    expect(after.settings.font).toBeUndefined();
    expect(slideSources(after)).toEqual(slideSources(before));
    expect(changed).toContain('custom: keep');
  });

  it('creates a settings block when the deck has none', () => {
    const source = '# A\n';

    expect(apply(source, setDeckFont(source, 'Inter').changes)).toBe(
      '---\nfont: Inter\n---\n\n# A\n',
    );
  });

  it('does nothing when removing a missing deck font', () => {
    expect(setDeckFont('# A\n', null)).toEqual({ changes: [] });
  });

  it('does nothing when setting the current deck font', () => {
    const source = '---\nfont: Lora\n---\n\n# A\n';

    expect(setDeckFont(source, 'Lora')).toEqual({ changes: [] });
  });
});
