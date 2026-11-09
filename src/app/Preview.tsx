import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Rows3, Square } from 'lucide-react';
import type { EditResult } from '../core/edit';
import type { Deck } from '../core/parse';
import type { Slide } from '../core/slide';
import { STAGE } from '../config';
import { fitSlide, mountScaled, type FitResult } from '../render/fit';
import { renderSlide } from '../render/renderSlide';
import { BOX_CUT_OFF, SLIDE_CUT_OFF } from './cutOff';
import { IconButton } from './IconButton';

export type PreviewView = 'all' | 'one';

type Props = {
  deck: Deck | undefined;
  images?: Map<string, Blob>;
  showGrid: boolean;
  onShowGridChange(show: boolean): void;
  view: PreviewView;
  onViewChange(view: PreviewView): void;
  currentSlide: number;
  onEdit(make: (deck: Deck) => EditResult | null, opts?: { userEvent?: string }): void;
  editable: boolean;
  /** Called with the slide index when a slide is clicked. */
  onSelectSlide(index: number): void;
  /** Called with fitSlide's results each time a slide is laid out. */
  onFit?(slide: Slide, results: FitResult[]): void;
};

export function imageKey(path: string): string {
  return path.split('/').filter((p) => p !== '' && p !== '.').join('/');
}

/** Object URLs for the deck's stored images. They are released when the images change. */
export function useImageUrls(images: Map<string, Blob> | undefined): Map<string, string> {
  const urls = useMemo(() => {
    const map = new Map<string, string>();
    for (const [path, blob] of images ?? []) map.set(path, URL.createObjectURL(blob));
    return map;
  }, [images]);
  useEffect(
    () => () => {
      for (const url of urls.values()) URL.revokeObjectURL(url);
    },
    [urls],
  );
  return urls;
}

function SlideCard(props: {
  slide: Slide;
  deck: Deck;
  urls: Map<string, string>;
  showGrid: boolean;
  onSelect(): void;
  onFit?(slide: Slide, results: FitResult[]): void;
}) {
  const { slide, deck, urls, showGrid, onSelect } = props;
  const frame = useRef<HTMLDivElement>(null);
  const onFit = useRef(props.onFit);
  onFit.current = props.onFit;
  /** Warnings for text that is cut off even at the smallest size. Shown under the slide on every screen size. */
  const [cutOff, setCutOff] = useState<string[]>([]);
  const { w, h } = STAGE[deck.settings.aspect];

  useEffect(() => {
    const container = frame.current!;
    const stage = renderSlide(slide, deck.settings, {
      showGrid,
      resolveImage: (src) => urls.get(imageKey(src)),
    });
    const unmount = mountScaled(stage, container);
    const results = fitSlide(stage);
    const messages = new Set(results.filter((r) => r.overflow).map((r) => (r.boxIndex === null ? SLIDE_CUT_OFF : BOX_CUT_OFF)));
    setCutOff([...messages]);
    onFit.current?.(slide, results);
    return () => {
      unmount();
      container.replaceChildren();
    };
  }, [slide, deck.settings, urls, showGrid]);

  return (
    <figure className="slide-card">
      <div
        className="slide-frame"
        ref={frame}
        style={{ aspectRatio: `${w} / ${h}` }}
        role="button"
        tabIndex={0}
        aria-label={`Slide ${slide.index + 1}`}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect();
          }
        }}
      />
      <figcaption>{slide.index + 1}</figcaption>
      {cutOff.map((m) => (
        <p key={m} className="slide-warning" role="status">
          {m}
        </p>
      ))}
    </figure>
  );
}

export function Preview({
  deck, images, showGrid, onShowGridChange, view, onViewChange, currentSlide, onSelectSlide, onFit,
}: Props) {
  const urls = useImageUrls(images);
  const slideCount = deck?.slides.length ?? 0;
  const shownIndex = Math.min(Math.max(0, currentSlide), Math.max(0, slideCount - 1));
  const shownSlide = deck?.slides[shownIndex];
  return (
    <section className="preview" aria-label="Preview">
      <div className="preview-bar">
        <div className="preview-controls">
          <label>
            <input type="checkbox" checked={showGrid} onChange={(e) => onShowGridChange(e.target.checked)} /> Grid lines
          </label>
          <div className="preview-view-switch" role="group" aria-label="Preview view">
            <IconButton
              label="All slides"
              icon={Rows3}
              aria-pressed={view === 'all'}
              onClick={() => onViewChange('all')}
            />
            <IconButton
              label="One slide"
              icon={Square}
              aria-pressed={view === 'one'}
              onClick={() => onViewChange('one')}
            />
          </div>
        </div>
        <span className="muted">{deck ? `${deck.slides.length} slide${deck.slides.length === 1 ? '' : 's'}` : ''}</span>
      </div>
      {view === 'all' ? (
        <div className="preview-scroll">
          {deck?.slides.map((slide) => (
            <SlideCard
              key={slide.index}
              slide={slide}
              deck={deck}
              urls={urls}
              showGrid={showGrid}
              onSelect={() => onSelectSlide(slide.index)}
              onFit={onFit}
            />
          ))}
        </div>
      ) : (
        <div className="one-slide">
          {deck && shownSlide && (
            <>
              <div className="one-slide-nav" aria-label="Slide navigation">
                <IconButton
                  label="Previous slide"
                  icon={ChevronLeft}
                  disabled={shownIndex === 0}
                  onClick={() => onSelectSlide(shownIndex - 1)}
                />
                <span className="slide-counter" aria-live="polite">{shownIndex + 1} / {slideCount}</span>
                <IconButton
                  label="Next slide"
                  icon={ChevronRight}
                  disabled={shownIndex === slideCount - 1}
                  onClick={() => onSelectSlide(shownIndex + 1)}
                />
              </div>
              <SlideCard
                slide={shownSlide}
                deck={deck}
                urls={urls}
                showGrid={showGrid}
                onSelect={() => onSelectSlide(shownIndex)}
                onFit={onFit}
              />
            </>
          )}
        </div>
      )}
    </section>
  );
}
