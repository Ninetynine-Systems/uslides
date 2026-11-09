import { useEffect, useRef } from 'react';
import type { Deck } from '../core/parse';
import { fitSlide, mountScaled } from '../render/fit';
import { renderSlide } from '../render/renderSlide';
import { imageKey, useImageUrls } from './Preview';

type Props = {
  deck: Deck;
  images: Map<string, Blob>;
  /** 1-based slide number. May be out of range; the view then shows the nearest slide and reports the fix. */
  slide: number;
  /** Asks to show another slide (1-based). Not called for the slide already shown. */
  onGo(slide: number): void;
  onExit(): void;
};

const HIDE_CURSOR_MS = 2000;
const NEXT = new Set(['ArrowRight', 'ArrowDown', ' ', 'PageDown']);
const PREVIOUS = new Set(['ArrowLeft', 'ArrowUp', 'PageUp']);

export function Present({ deck, images, slide, onGo, onExit }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const urls = useImageUrls(images);
  const count = deck.slides.length;
  const current = Math.min(Math.max(1, slide), count);

  // Always read the latest props from handlers that are attached only once.
  const latest = useRef({ current, count, onGo, onExit });
  latest.current = { current, count, onGo, onExit };

  // An out-of-range number (a typed URL, or slides removed meanwhile) is corrected.
  useEffect(() => {
    if (current !== slide) onGo(current);
  }, [current, slide, onGo]);

  // Draw the slide. Runs again if the deck changes underneath.
  const shown = deck.slides[current - 1]!;
  useEffect(() => {
    const container = frame.current!;
    const stage = renderSlide(shown, deck.settings, { resolveImage: (src) => urls.get(imageKey(src)) });
    const unmount = mountScaled(stage, container);
    fitSlide(stage);
    return () => {
      unmount();
      container.replaceChildren();
    };
  }, [shown, deck.settings, urls]);

  // Fullscreen: ask on entry (the click or key that opened us counts as the user gesture).
  // If it is refused, this stays a full-window view.
  useEffect(() => {
    const el = root.current!;
    let entered = false;
    const onChange = () => {
      if (document.fullscreenElement === el) entered = true;
      else if (entered) latest.current.onExit(); // the browser left fullscreen itself (Esc)
    };
    document.addEventListener('fullscreenchange', onChange);
    if (document.fullscreenEnabled) el.requestFullscreen().catch(() => undefined);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      if (document.fullscreenElement === el) void document.exitFullscreen().catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const { current: at, count: n, onGo: go, onExit: exit } = latest.current;
      let target: number | undefined;
      if (e.key === 'Escape') return exit();
      else if (NEXT.has(e.key)) target = Math.min(at + 1, n);
      else if (PREVIOUS.has(e.key)) target = Math.max(at - 1, 1);
      else if (e.key === 'Home') target = 1;
      else if (e.key === 'End') target = n;
      else return;
      e.preventDefault();
      if (target !== at) go(target);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  // Hide the mouse pointer after a short time without movement.
  useEffect(() => {
    const el = root.current!;
    let timer: ReturnType<typeof setTimeout>;
    const wake = () => {
      el.classList.remove('idle');
      clearTimeout(timer);
      timer = setTimeout(() => el.classList.add('idle'), HIDE_CURSOR_MS);
    };
    wake();
    el.addEventListener('mousemove', wake);
    return () => {
      clearTimeout(timer);
      el.removeEventListener('mousemove', wake);
    };
  }, []);

  return (
    <div
      className="present"
      ref={root}
      role="region"
      aria-label={`Presenting slide ${current} of ${count}`}
      onClick={(e) => {
        // A link in the slide is followed; anything else goes forward.
        if ((e.target as Element).closest('a')) return;
        const { current: at, count: n, onGo: go } = latest.current;
        if (at < n) go(at + 1);
      }}
    >
      <div className="present-frame" ref={frame} />
    </div>
  );
}
