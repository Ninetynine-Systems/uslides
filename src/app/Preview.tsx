import { useEffect, useMemo, useRef } from 'react';
import type { Deck } from '../core/parse';
import type { Slide } from '../core/slide';
import { STAGE } from '../config';
import { fitSlide, mountScaled } from '../render/fit';
import { renderSlide } from '../render/renderSlide';

type Props = {
  deck: Deck | undefined;
  images?: Map<string, Blob>;
  showGrid: boolean;
  onShowGridChange(show: boolean): void;
  /** Called with the slide index when a slide is clicked. */
  onSelectSlide(index: number): void;
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
}) {
  const { slide, deck, urls, showGrid, onSelect } = props;
  const frame = useRef<HTMLDivElement>(null);
  const { w, h } = STAGE[deck.settings.aspect];

  useEffect(() => {
    const container = frame.current!;
    const stage = renderSlide(slide, deck.settings, {
      showGrid,
      resolveImage: (src) => urls.get(imageKey(src)),
    });
    const unmount = mountScaled(stage, container);
    fitSlide(stage);
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
    </figure>
  );
}

export function Preview({ deck, images, showGrid, onShowGridChange, onSelectSlide }: Props) {
  const urls = useImageUrls(images);
  return (
    <section className="preview" aria-label="Preview">
      <div className="preview-bar">
        <label>
          <input type="checkbox" checked={showGrid} onChange={(e) => onShowGridChange(e.target.checked)} /> Grid lines
        </label>
        <span className="muted">{deck ? `${deck.slides.length} slide${deck.slides.length === 1 ? '' : 's'}` : ''}</span>
      </div>
      <div className="preview-scroll">
        {deck?.slides.map((slide) => (
          <SlideCard
            key={slide.index}
            slide={slide}
            deck={deck}
            urls={urls}
            showGrid={showGrid}
            onSelect={() => onSelectSlide(slide.index)}
          />
        ))}
      </div>
    </section>
  );
}
