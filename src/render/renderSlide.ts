import { STAGE } from '../config';
import type { Box, Slide } from '../core/slide';
import type { DeckSettings } from '../core/settings';
import { renderMarkdown } from '../core/markdown';
import './themes.css';
import './slide.css';

export type RenderOptions = {
  /** Draw the grid lines over the slide (editor preview only). */
  showGrid?: boolean;
  resolveImage?: (src: string) => string | undefined;
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

function fill(el: HTMLElement, markdown: string, opts: RenderOptions): void {
  el.innerHTML = renderMarkdown(markdown, { resolveImage: opts.resolveImage });
  if (isImageOnly(el)) el.classList.add('us-image-only');
}

function renderBox(box: Box, index: number, opts: RenderOptions): HTMLElement {
  const el = document.createElement('div');
  el.className = `us-box us-align-${box.align} us-valign-${box.valign} us-fit-${box.fit}`;
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
  fill(loose, slide.loose, opts);
  stage.append(loose);

  slide.boxes.forEach((box, i) => stage.append(renderBox(box, i, opts)));

  if (opts.showGrid) {
    const lines = document.createElement('div');
    lines.className = 'us-gridlines';
    lines.style.setProperty('--us-cols', String(cols));
    lines.style.setProperty('--us-rows', String(rows));
    stage.append(lines);
  }
  return stage;
}
