import { MIN_FONT_PX } from '../config';

export type FitResult = { boxIndex: number | null; overflow: boolean }; // null = loose layer

const STEP = 0.05;

function overflows(el: HTMLElement): boolean {
  return el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth;
}

/** Lowers `--us-scale` on one area until its content fits, but never below MIN_FONT_PX. Returns true if it still overflows. */
function fitArea(el: HTMLElement): boolean {
  el.style.setProperty('--us-scale', '1');
  if (!overflows(el)) return false;

  const base = parseFloat(getComputedStyle(el).fontSize);
  // Round up so the computed size never lands a hair under the minimum.
  const floor = base > MIN_FONT_PX ? Math.ceil((MIN_FONT_PX / base) * 1000) / 1000 : 1;
  for (let step = 1; ; step++) {
    const scale = Math.max(floor, Math.round((1 - step * STEP) * 100) / 100);
    el.style.setProperty('--us-scale', String(scale));
    if (!overflows(el)) return false;
    if (scale === floor) return true;
  }
}

/** Shrinks text in each box, and in the loose layer if it has content, to fit. Call after the stage is in the DOM. */
export function fitSlide(stage: HTMLElement): FitResult[] {
  const results: FitResult[] = [];
  const loose = stage.querySelector<HTMLElement>(':scope > .us-loose');
  if (loose && loose.innerHTML.trim() !== '') {
    results.push({ boxIndex: null, overflow: fitArea(loose) });
  }
  for (const box of stage.querySelectorAll<HTMLElement>(':scope > .us-box')) {
    results.push({ boxIndex: Number(box.dataset.box), overflow: fitArea(box) });
  }
  return results;
}

/** Scales and centres a full-size stage inside a container, and keeps it fitted when the container resizes. */
export function mountScaled(stage: HTMLElement, container: HTMLElement): () => void {
  const w = parseFloat(stage.style.width);
  const h = parseFloat(stage.style.height);
  container.style.position = 'relative';
  container.style.overflow = 'hidden';
  stage.style.position = 'absolute';
  stage.style.transformOrigin = '0 0';
  container.append(stage);

  const update = () => {
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    if (cw === 0 || ch === 0) return;
    const scale = Math.min(cw / w, ch / h);
    stage.style.left = `${(cw - w * scale) / 2}px`;
    stage.style.top = `${(ch - h * scale) / 2}px`;
    stage.style.transform = `scale(${scale})`;
  };
  update();
  const observer = new ResizeObserver(update);
  observer.observe(container);
  return () => observer.disconnect();
}
