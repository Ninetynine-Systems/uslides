import { describe, expect, it } from 'vitest';
import { boxBlocks, boxClipboardText, pasteBoxes } from '../../src/core/boxClipboard';
import { parseDeck } from '../../src/core/parse';

function apply(source: string, result: { changes: { from: number; to: number; insert: string }[] }): string {
  return [...result.changes]
    .sort((a, b) => b.from - a.from)
    .reduce((text, c) => text.slice(0, c.from) + c.insert + text.slice(c.to), source);
}

describe('boxBlocks', () => {
  it('reads one or more boxes, and nothing else', () => {
    expect(boxBlocks('::: box col=1-2\nHi\n:::\n')).toEqual(['::: box col=1-2\nHi\n:::']);
    expect(boxBlocks('\n::: box\nA\n:::\n\n::: box bg=red\nB\n:::')).toEqual(['::: box\nA\n:::', '::: box bg=red\nB\n:::']);
    expect(boxBlocks('Hello')).toBeNull();
    expect(boxBlocks('Intro\n::: box\nA\n:::')).toBeNull();
    expect(boxBlocks('::: box\nnot closed')).toBeNull();
    expect(boxBlocks('')).toBeNull();
  });

  it('does not end a box at a ::: line inside a code block', () => {
    const text = '::: box\n```\n:::\n```\n:::';
    expect(boxBlocks(text)).toEqual([text]);
  });
});

describe('pasteBoxes', () => {
  const source = '# One\n\n::: box col=1-3 row=1-2 bg=#ffd43b\nA\n:::\n\n---\n\n# Two\n';

  it('copies a box as its Markdown, and pastes it on another slide in the same place', () => {
    const deck = parseDeck(source);
    const text = boxClipboardText(source, deck.slides[0]!.boxes[0]!);
    expect(text).toBe('::: box col=1-3 row=1-2 bg=#ffd43b\nA\n:::\n');
    const result = pasteBoxes(source, deck.slides[1]!, text)!;
    expect(result.count).toBe(1);
    expect(apply(source, result)).toBe(`${source}\n::: box col=1-3 row=1-2 bg=#ffd43b\nA\n:::\n`);
  });

  it('moves a pasted box off a box in the same place, one cell down and right', () => {
    const deck = parseDeck(source);
    const result = pasteBoxes(source, deck.slides[0]!, '::: box col=1-3 row=1-2 bg=#ffd43b\nA\n:::\n')!;
    expect(apply(source, result)).toContain(':::\n\n::: box col=2-4 row=2-3 bg=#ffd43b\nA\n:::\n\n---');
  });

  it('moves up and left instead when the box touches the right edge', () => {
    const edge = '::: box col=7-12 row=3-6\nA\n:::\n';
    const deck = parseDeck(edge);
    const next = apply(edge, pasteBoxes(edge, deck.slides[0]!, edge)!);
    expect(next).toContain('::: box col=6-11 row=2-5\nA\n:::');
  });

  it('cuts a box to a smaller grid', () => {
    const fine = '<!-- slide grid=24x12 -->\n\n# Fine\n\n---\n\n# Deck grid\n';
    const deck = parseDeck(fine);
    const next = apply(fine, pasteBoxes(fine, deck.slides[1]!, '::: box col=10-20 row=2-4\nB\n:::')!);
    expect(next).toContain('::: box col=10-12 row=2-4\nB\n:::');
  });

  it('is null for text that is not boxes', () => {
    const deck = parseDeck(source);
    expect(pasteBoxes(source, deck.slides[0]!, 'Just some words')).toBeNull();
  });
});
