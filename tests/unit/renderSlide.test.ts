// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import { parseDeck } from '../../src/core/parse';
import { loadCatalog } from '../../src/fonts/catalog';
import { renderSlide } from '../../src/render/renderSlide';

beforeAll(() => loadCatalog());

function render(src: string, opts?: Parameters<typeof renderSlide>[2]) {
  const deck = parseDeck(src);
  return renderSlide(deck.slides[0]!, deck.settings, opts);
}

/** Follows the same rendered-line mapping that a loose-text double-click uses. */
function sourcePieceForText(source: string, text: string): number | undefined {
  const deck = parseDeck(source);
  const slide = deck.slides[0]!;
  const stage = renderSlide(slide, deck.settings, { markLines: true });
  const marked = [...stage.querySelectorAll<HTMLElement>('.us-loose [data-line]')]
    .filter((element) => element.textContent?.trim() === text)
    .at(-1);
  const line = Number(marked?.dataset.line);
  const offset = Number.isInteger(line) ? slide.looseLines[line] : undefined;
  if (offset === undefined) return undefined;
  const piece = slide.looseRanges.findIndex((range) => range.from <= offset && offset < range.to);
  return piece < 0 ? undefined : piece;
}

describe('renderSlide', () => {
  it('builds a themed stage with a grid', () => {
    const stage = render('# Hi');
    expect(stage.className).toContain('us-stage');
    expect(stage.classList.contains('us-theme-light')).toBe(true);
    expect(stage.style.width).toBe('1920px');
    expect(stage.style.height).toBe('1080px');
    expect(stage.style.display).toBe('grid');
    expect(stage.style.gridTemplateColumns).toBe('repeat(12, 1fr)');
    expect(stage.style.gridTemplateRows).toBe('repeat(6, 1fr)');
  });

  it('uses the deck theme and the 4:3 stage size', () => {
    const stage = render('---\naspect: 4:3\ntheme: dark\n---\n# Hi');
    expect(stage.style.width).toBe('1440px');
    expect(stage.style.height).toBe('1080px');
    expect(stage.classList.contains('us-theme-dark')).toBe(true);
  });

  it('the box font wins over the deck font', () => {
    const stage = render('---\nfont: Inter\n---\n::: box font=Lora\nA\n:::');
    const box = stage.querySelector<HTMLElement>('.us-box')!;
    expect(stage.style.fontFamily).toBe('"Inter", var(--us-font)');
    expect(box.style.fontFamily).toBe('"Lora", var(--us-font)');
  });

  it('uses the theme font for catalog fonts when outside requests are blocked', () => {
    const stage = render('---\nfont: Inter\n---\n::: box font=Lora\nA\n:::', { blockExternal: true });
    expect(stage.style.fontFamily).toBe('');
    expect(stage.querySelector<HTMLElement>('.us-box')!.style.fontFamily).toBe('');
  });

  it('keeps local and system fonts when outside requests are blocked', () => {
    const stage = render('---\nfont: Georgia\n---\n::: box font=Georgia\nA\n:::', { blockExternal: true });
    expect(stage.style.fontFamily).toBe('"Georgia", var(--us-font)');
    expect(stage.querySelector<HTMLElement>('.us-box')!.style.fontFamily).toBe('"Georgia", var(--us-font)');
  });

  it('places boxes on the grid with increasing z-index', () => {
    const stage = render('::: box col=1-7 row=2-6\nA\n:::\n\n::: box\nB\n:::\n\nloose');
    const boxes = stage.querySelectorAll<HTMLElement>('.us-box');
    expect(boxes).toHaveLength(2);
    expect(boxes[0]!.dataset.box).toBe('0');
    expect(boxes[0]!.style.gridColumn).toBe('1 / 8');
    expect(boxes[0]!.style.gridRow).toBe('2 / 7');
    expect(boxes[0]!.style.zIndex).toBe('1');
    expect(boxes[1]!.style.zIndex).toBe('2');
    const loose = stage.querySelector<HTMLElement>('.us-loose')!;
    expect(loose.style.zIndex).toBe('0');
    expect(loose.textContent).toContain('loose');
  });

  it('sets box and slide colours inline', () => {
    const stage = render('<!-- slide bg=#112233 color=white -->\n\n::: box bg=#ff0000 color=black\nA\n:::');
    expect(stage.style.backgroundColor).toBe('rgb(17, 34, 51)');
    expect(stage.style.color).toBe('white');
    const box = stage.querySelector<HTMLElement>('.us-box')!;
    expect(box.style.backgroundColor).toBe('rgb(255, 0, 0)');
    expect(box.style.color).toBe('black');
  });

  it('adds alignment and fit classes', () => {
    const stage = render('::: box align=center valign=bottom fit=cover\nA\n:::');
    const box = stage.querySelector('.us-box')!;
    expect(box.classList.contains('us-align-center')).toBe(true);
    expect(box.classList.contains('us-valign-bottom')).toBe(true);
    expect(box.classList.contains('us-fit-cover')).toBe(true);
  });

  it('shows grid lines only when asked', () => {
    expect(render('# Hi').querySelector('.us-grid')).toBeNull();
    expect(render('# Hi', { showGrid: false }).querySelector('.us-grid')).toBeNull();
    expect(render('# Hi', { showGrid: true }).querySelector('.us-grid')).not.toBeNull();
  });

  it('marks empty boxes only when asked', () => {
    const source = '::: box col=1-3 row=1-2\n  \n:::\n';
    expect(render(source, { markEmpty: true }).querySelector('.us-box')!.classList.contains('us-empty')).toBe(true);
    expect(render(source).querySelector('.us-box')!.classList.contains('us-empty')).toBe(false);
  });

  it('renders markdown and resolves images', () => {
    const stage = render('![a](./x.png)', { resolveImage: () => 'https://example.com/x.png' });
    expect(stage.querySelector('img')!.getAttribute('src')).toBe('https://example.com/x.png');
  });

  it('marks source lines only on loose preview blocks when asked', () => {
    const source = '# Loose\n\n::: box\n# Box\n:::';
    const marked = render(source, { markLines: true });
    expect(marked.querySelector('.us-loose > h1')!.getAttribute('data-line')).toBe('0');
    expect(marked.querySelector('.us-box [data-line]')).toBeNull();
    expect(render(source).querySelector('[data-line]')).toBeNull();
  });

  it('keeps a paragraph joined across a speaker note', () => {
    const loose = render('Line one\n<!-- note: hidden -->\nLine two').querySelector('.us-loose')!;
    expect(loose.querySelectorAll('p')).toHaveLength(1);
    expect(loose.querySelector('p')!.textContent).toBe('Line one\nLine two');
  });

  it('resolves a reference whose definition is after a box', () => {
    const source = '[Read more][details]\n\n::: box\nBox\n:::\n\n[details]: https://example.com';
    const link = render(source).querySelector<HTMLAnchorElement>('.us-loose a');
    expect(link?.textContent).toBe('Read more');
    expect(link?.href).toBe('https://example.com/');
  });

  it('puts a fenced code source line on pre instead of code', () => {
    const loose = render('```ts\nconst n = 1;\n```', { markLines: true }).querySelector('.us-loose')!;
    expect(loose.querySelector('pre')!.dataset.line).toBe('0');
    expect(loose.querySelector('pre > code')!.getAttribute('data-line')).toBeNull();
  });

  it.each([
    ['- a\n  - a1\n\n::: box col=1-6\nx\n:::\n\n- b', 'b', 1],
    ['one `co\nde` two\nthree\n::: box col=1-6\nx\n:::\nfour', 'four', 1],
    ['- a\n::: box col=1-6\nx\n:::\nTail', 'Tail', 1],
    ['a\\\nb\nc\n::: box col=1-6\nx\n:::\nd', 'c', 0],
    ['a\\\nb\nc\n::: box col=1-6\nx\n:::\nd', 'd', 1],
  ])('maps rendered text in %s to its loose source piece', (source, text, piece) => {
    expect(sourcePieceForText(source, text)).toBe(piece);
  });
});
