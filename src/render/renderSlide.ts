import { STAGE } from '../config';
import type { Box, Slide } from '../core/slide';
import type { DeckSettings } from '../core/settings';
import { renderMarkdown } from '../core/markdown';
import './themes.css';
import './slide.css';

export type RenderOptions = {
  /** Draw the grid lines over the slide (editor preview only). */
  showGrid?: boolean;
  /** Mark blank boxes so they stay visible in the editor preview. */
  markEmpty?: boolean;
  /** Mark loose blocks with their source line (editor preview only). */
  markLines?: boolean;
  resolveImage?: (src: string) => string | undefined;
  /** Replace web images with placeholders without requesting them. */
  blockExternal?: boolean;
};

/** True when the HTML is one paragraph that holds a single image and no text. */
function isImageOnly(container: HTMLElement): boolean {
  if (container.children.length !== 1) return false;
  const p = container.firstElementChild!;
  return (
    p.tagName === 'P' &&
    p.children.length === 1 &&
    p.firstElementChild!.tagName === 'IMG' &&
    (p.textContent ?? '').trim() === ''
  );
}

function fill(el: HTMLElement, markdown: string, opts: RenderOptions, sourceLines = false): void {
  el.innerHTML = renderMarkdown(markdown, {
    resolveImage: opts.resolveImage,
    sourceLines,
    blockExternal: opts.blockExternal,
  });
  if (isImageOnly(el)) el.classList.add('us-image-only');
}

/** Renders source-disconnected loose pieces separately so Markdown blocks never join across a box. */
function fillLoose(el: HTMLElement, slide: Slide, opts: RenderOptions): void {
  const lines = slide.loose.split('\n');
  let piece: { index: number; firstLine: number; lines: string[] } | undefined;
  const finish = () => {
    if (!piece) return;
    const template = document.createElement('template');
    template.innerHTML = renderMarkdown(piece.lines.join('\n'), {
      resolveImage: opts.resolveImage,
      sourceLines: opts.markLines,
      blockExternal: opts.blockExternal,
    });
    if (opts.markLines) {
      for (const marked of template.content.querySelectorAll<HTMLElement>('[data-line]')) {
        marked.dataset.line = String(piece.firstLine + Number(marked.dataset.line));
      }
    }
    el.append(template.content);
    piece = undefined;
  };

  for (const [line, text] of lines.entries()) {
    const offset = slide.looseLines[line];
    const index = offset === undefined
      ? -1
      : slide.looseRanges.findIndex((range) => range.from <= offset && offset < range.to);
    if (index < 0) {
      finish();
      continue;
    }
    if (piece && piece.index !== index) finish();
    piece ??= { index, firstLine: line, lines: [] };
    piece.lines.push(text);
  }
  finish();
  if (isImageOnly(el)) el.classList.add('us-image-only');
}

function renderBox(box: Box, index: number, opts: RenderOptions): HTMLElement {
  const el = document.createElement('div');
  el.className = `us-box us-align-${box.align} us-valign-${box.valign} us-fit-${box.fit}`;
  if (opts.markEmpty && box.markdown.trim() === '') el.classList.add('us-empty');
  el.dataset.box = String(index);
  el.style.setProperty('grid-column', `${box.col[0]} / ${box.col[1] + 1}`);
  el.style.setProperty('grid-row', `${box.row[0]} / ${box.row[1] + 1}`);
  el.style.zIndex = String(index + 1);
  if (box.bg) el.style.backgroundColor = box.bg;
  if (box.color) el.style.color = box.color;
  fill(el, box.markdown, opts);
  return el;
}

/** Builds one slide at full stage size. The caller puts it in the DOM, then calls `fitSlide`. */
export function renderSlide(slide: Slide, settings: DeckSettings, opts: RenderOptions = {}): HTMLElement {
  const { cols, rows } = slide.grid;
  const size = STAGE[settings.aspect];

  const stage = document.createElement('div');
  stage.className = `us-stage us-theme-${settings.theme}`;
  stage.style.width = `${size.w}px`;
  stage.style.height = `${size.h}px`;
  stage.style.display = 'grid';
  stage.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  stage.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
  if (slide.bg) stage.style.backgroundColor = slide.bg;
  if (slide.color) stage.style.color = slide.color;

  const loose = document.createElement('div');
  loose.className = 'us-loose us-align-left us-valign-top us-fit-contain';
  loose.style.setProperty('grid-column', `1 / ${cols + 1}`);
  loose.style.setProperty('grid-row', `1 / ${rows + 1}`);
  loose.style.zIndex = '0';
  fillLoose(loose, slide, opts);
  stage.append(loose);

  slide.boxes.forEach((box, i) => stage.append(renderBox(box, i, opts)));

  if (opts.showGrid) {
    const lines = document.createElement('div');
    lines.className = 'us-grid';
    lines.style.setProperty('--us-cols', String(cols));
    lines.style.setProperty('--us-rows', String(rows));
    stage.append(lines);
  }
  return stage;
}
