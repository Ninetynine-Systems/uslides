import {
  lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType,
} from 'react';
import { ChevronLeft, ChevronRight, Code, CopyPlus, Rows3, Square, SquarePlus } from 'lucide-react';
import { insertBox, insertSlideAfter, type EditResult } from '../core/edit';
import { centredSpan, findFreeArea } from '../core/layout';
import type { Deck } from '../core/parse';
import type { Slide } from '../core/slide';
import { STAGE } from '../config';
import { fitSlide, mountScaled, type FitResult } from '../render/fit';
import { renderSlide } from '../render/renderSlide';
import { useDeckFonts } from '../fonts/load';
import { BOX_CUT_OFF, SLIDE_CUT_OFF } from './cutOff';
import { Overlay, type SelectionRequest } from './edit/Overlay';
import { hintDone, markHintDone } from './edit/hint';
import type { TypingAreaProps } from './edit/TypingArea';
import { IconButton, LabelButton } from './IconButton';

let typingAreaLoad: Promise<typeof import('./edit/TypingArea')> | undefined;

/** Keep CodeMirror out of the phone bundle, but start its request as soon as editing is available. */
function loadTypingArea(): Promise<typeof import('./edit/TypingArea')> {
  typingAreaLoad ??= import('./edit/TypingArea');
  return typingAreaLoad;
}

const TypingArea = lazy(() => loadTypingArea().then((m) => ({ default: m.TypingArea })));

export type PreviewView = 'all' | 'one';

type Props = {
  deck: Deck | undefined;
  images?: Map<string, Blob>;
  blockExternal: boolean;
  showGrid: boolean;
  onShowGridChange(show: boolean): void;
  view: PreviewView;
  onViewChange(view: PreviewView): void;
  currentSlide: number;
  onEdit(make: (deck: Deck) => EditResult | null, opts?: { userEvent?: string; focus?: boolean }): void;
  onMoveCursor(pos: number): void;
  getDeck(): Deck | undefined;
  getSource(): string;
  onUndo(): void;
  onRedo(): void;
  editable: boolean;
  /** True when the Markdown text beside the slides is hidden. */
  editorHidden: boolean;
  onToggleEditor(): void;
  showHint: boolean;
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
  blockExternal: boolean;
  active: boolean;
  editable: boolean;
  onEdit(make: (deck: Deck) => EditResult | null, opts?: { userEvent?: string; focus?: boolean }): void;
  onMoveCursor(pos: number): void;
  getDeck(): Deck | undefined;
  getSource(): string;
  onUndo(): void;
  onRedo(): void;
  onSelect(): void;
  selectionRequest?: SelectionRequest;
  onSelectionRequestHandled(id: number): void;
  showHint: boolean;
  onHintDone(): void;
  fontVersion: number;
  slideSelected: boolean;
  onSlideSelect(selected: boolean): void;
  onSlideSelectIndex(index: number | null): void;
  onFit?(slide: Slide, results: FitResult[]): void;
}) {
  const {
    slide, deck, urls, showGrid, blockExternal, active, editable, onEdit, onMoveCursor, getDeck, getSource, onUndo, onRedo, onSelect,
  } = props;
  const frame = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<HTMLElement | null>(null);
  const onFit = useRef(props.onFit);
  onFit.current = props.onFit;
  /** Warnings for text that is cut off even at the smallest size. Shown under the slide on every screen size. */
  const [cutOff, setCutOff] = useState<string[]>([]);
  const { w, h } = STAGE[deck.settings.aspect];

  // A layout effect, so the new slide and the selection drawn over it reach the screen in the same frame.
  useLayoutEffect(() => {
    const container = frame.current!;
    const stage = renderSlide(slide, deck.settings, {
      showGrid,
      markEmpty: true,
      markLines: true,
      blockExternal,
      resolveImage: (src) => urls.get(imageKey(src)),
    });
    const unmount = mountScaled(stage, container);
    setStage(stage);
    const results = fitSlide(stage);
    const messages = new Set(results.filter((r) => r.overflow).map((r) => (r.boxIndex === null ? SLIDE_CUT_OFF : BOX_CUT_OFF)));
    setCutOff([...messages]);
    onFit.current?.(slide, results);
    return () => {
      unmount();
      stage.remove();
    };
  }, [slide, deck.settings, urls, showGrid, blockExternal, props.fontVersion]);

  return (
    <figure className={`slide-card${active ? ' current' : ''}${props.slideSelected ? ' slide-selected' : ''}`}>
      <div
        className="slide-frame"
        ref={frame}
        style={{ aspectRatio: `${w} / ${h}` }}
        role={editable ? 'group' : 'button'}
        tabIndex={0}
        aria-label={`Slide ${slide.index + 1}`}
        onClick={editable ? undefined : onSelect}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget || e.defaultPrevented) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect();
          }
        }}
      >
        {editable && stage && (
          <Overlay
            stage={stage}
            slide={slide}
            grid={slide.grid}
            theme={deck.settings.theme}
            blocked={blockExternal}
            onEdit={onEdit}
            onMoveCursor={onMoveCursor}
            getDeck={getDeck}
            getSource={getSource}
            onUndo={onUndo}
            onRedo={onRedo}
            TypingArea={TypingArea as ComponentType<TypingAreaProps>}
            onSelectSlide={onSelect}
            active={active}
            selectionRequest={props.selectionRequest}
            onSelectionRequestHandled={props.onSelectionRequestHandled}
            showHint={props.showHint}
            onHintDone={props.onHintDone}
            slideSelected={props.slideSelected}
            onSlideSelect={props.onSlideSelect}
            onSlideSelectIndex={props.onSlideSelectIndex}
            slideCount={deck.slides.length}
            deckGrid={deck.settings.grid}
          />
        )}
      </div>
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
  deck, images, blockExternal, showGrid, onShowGridChange, view, onViewChange, currentSlide, onEdit, onMoveCursor,
  getDeck, getSource, onUndo, onRedo, editable, editorHidden, onToggleEditor, showHint, onSelectSlide, onFit,
}: Props) {
  useEffect(() => {
    if (editable) void loadTypingArea();
  }, [editable]);
  const urls = useImageUrls(images);
  const fontVersion = useDeckFonts(deck, blockExternal);
  const slideCount = deck?.slides.length ?? 0;
  const shownIndex = Math.min(Math.max(0, currentSlide), Math.max(0, slideCount - 1));
  const shownSlide = deck?.slides[shownIndex];
  const preview = useRef<HTMLElement>(null);
  const revealId = useRef(0);
  const [revealSlide, setRevealSlide] = useState<
    { id: number; index: number; slideCount: number } | undefined
  >();
  const requestId = useRef(0);
  const [selectionRequest, setSelectionRequest] = useState<
    { slideIndex: number; request: SelectionRequest } | undefined
  >();
  const [hintHidden, setHintHidden] = useState(hintDone);
  const finishHint = useCallback(() => {
    markHintDone();
    setHintHidden(true);
  }, []);
  const addBox = useCallback(() => {
    markHintDone();
    setHintHidden(true);
    onEdit((freshDeck) => {
      const slide = freshDeck.slides[shownIndex];
      if (!slide) return null;
      const area = findFreeArea(slide, 4, 2) ?? centredSpan(slide.grid, 4, 2);
      setSelectionRequest({
        slideIndex: slide.index,
        request: { id: ++requestId.current, box: slide.boxes.length, typing: true },
      });
      return insertBox(freshDeck.source, slide, area.col, area.row);
    });
  }, [onEdit, shownIndex]);
  const addSlide = useCallback((atEnd: boolean) => {
    onEdit((freshDeck) => {
      const slide = atEnd ? freshDeck.slides.at(-1) : freshDeck.slides[shownIndex];
      if (!atEnd && freshDeck.slides.length > 0 && !slide) return null;
      const index = slide ? slide.index + 1 : 0;
      setRevealSlide({ id: ++revealId.current, index, slideCount: freshDeck.slides.length + 1 });
      onSelectSlide(index);
      return insertSlideAfter(freshDeck.source, slide);
    }, { focus: true });
  }, [onEdit, onSelectSlide, shownIndex]);
  useEffect(() => {
    if (!revealSlide || slideCount !== revealSlide.slideCount || shownIndex !== revealSlide.index) return;
    const frame = preview.current?.querySelector<HTMLElement>(
      `.slide-frame[aria-label="Slide ${revealSlide.index + 1}"]`,
    );
    if (!frame) return;
    frame.scrollIntoView({ block: 'nearest' });
    setRevealSlide(undefined);
  }, [revealSlide, shownIndex, slideCount, view]);
  /** The slide that is selected as a whole, showing its settings bar. Only one at a time. */
  const [selectedSlide, setSelectedSlide] = useState<number | null>(null);
  const slideSelect = useCallback((index: number, on: boolean) => {
    setSelectedSlide((current) => (on ? index : current === index ? null : current));
  }, []);
  useEffect(() => {
    if (selectedSlide !== null && selectedSlide >= slideCount) setSelectedSlide(null);
  }, [selectedSlide, slideCount]);
  // A moved or copied slide stays selected, and in view.
  useEffect(() => {
    if (selectedSlide === null) return;
    const frame = preview.current?.querySelector<HTMLElement>(`.slide-frame[aria-label="Slide ${selectedSlide + 1}"]`);
    frame?.scrollIntoView({ block: 'nearest' });
    // A moved or copied slide's bar is a new one, so the button that was pressed is gone. Keep the keyboard
    // on the slide, so Escape and Ctrl+Z still work.
    if (frame && (document.activeElement === document.body || document.activeElement === null)) {
      frame.focus({ preventScroll: true });
    }
  }, [selectedSlide, slideCount]);
  const selectionRequestHandled = useCallback((id: number) => {
    setSelectionRequest((current) => current?.request.id === id ? undefined : current);
  }, []);
  return (
    <section className="preview" aria-label="Preview" ref={preview}>
      <div className="preview-bar">
        <div className="preview-controls">
          {editable && deck && <LabelButton label="Add slide" icon={CopyPlus} onClick={() => addSlide(false)} />}
          {editable && deck && <LabelButton label="Add box" icon={SquarePlus} onClick={addBox} />}
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
          <label className="preview-grid-toggle">
            <input type="checkbox" checked={showGrid} onChange={(e) => onShowGridChange(e.target.checked)} /> Grid lines
          </label>
        </div>
        <div className="preview-end">
          <span className="muted preview-count">{deck ? `${deck.slides.length} slide${deck.slides.length === 1 ? '' : 's'}` : ''}</span>
          {editable && (
            <IconButton
              label={editorHidden ? 'Show text editor' : 'Hide text editor'}
              icon={Code}
              aria-pressed={!editorHidden}
              onClick={onToggleEditor}
            />
          )}
        </div>
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
              blockExternal={blockExternal}
              active={slide.index === shownIndex}
              editable={editable}
              onEdit={onEdit}
              onMoveCursor={onMoveCursor}
              getDeck={getDeck}
              getSource={getSource}
              onUndo={onUndo}
              onRedo={onRedo}
              onSelect={() => onSelectSlide(slide.index)}
              selectionRequest={selectionRequest?.slideIndex === slide.index ? selectionRequest.request : undefined}
              onSelectionRequestHandled={selectionRequestHandled}
              showHint={showHint && !hintHidden}
              onHintDone={finishHint}
              fontVersion={fontVersion}
              onFit={onFit}
              slideSelected={selectedSlide === slide.index}
              onSlideSelect={(on) => slideSelect(slide.index, on)}
              onSlideSelectIndex={setSelectedSlide}
            />
          ))}
          {editable && deck && (
            <button
              type="button"
              className="add-slide-end"
              aria-label="Add slide at the end"
              onClick={() => addSlide(true)}
            >
              <CopyPlus size={18} aria-hidden />
              <span>Add slide</span>
            </button>
          )}
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
                blockExternal={blockExternal}
                active
                editable={editable}
                onEdit={onEdit}
                onMoveCursor={onMoveCursor}
                getDeck={getDeck}
                getSource={getSource}
                onUndo={onUndo}
                onRedo={onRedo}
                onSelect={() => onSelectSlide(shownIndex)}
                selectionRequest={selectionRequest?.slideIndex === shownIndex ? selectionRequest.request : undefined}
                onSelectionRequestHandled={selectionRequestHandled}
                showHint={showHint && !hintHidden}
                onHintDone={finishHint}
                fontVersion={fontVersion}
                onFit={onFit}
                slideSelected={selectedSlide === shownIndex}
                onSlideSelect={(on) => slideSelect(shownIndex, on)}
                onSlideSelectIndex={setSelectedSlide}
              />
            </>
          )}
        </div>
      )}
    </section>
  );
}
