import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Minus, MonitorUp, Pause, Play, Plus, RotateCcw, X } from 'lucide-react';
import { renderMarkdown } from '../core/markdown';
import type { Deck } from '../core/parse';
import type { Slide } from '../core/slide';
import { useDeckFonts } from '../fonts/load';
import { fitSlide, mountScaled } from '../render/fit';
import { slideTarget } from '../render/nav';
import { renderSlide } from '../render/renderSlide';
import { IconButton, LabelButton } from './IconButton';
import { imageKey, useImageUrls } from './Preview';

type Props = {
  deck: Deck;
  images: Map<string, Blob>;
  blockExternal: boolean;
  /** 1-based slide number. May be out of range; the view then shows the nearest slide and reports the fix. */
  slide: number;
  onGo(slide: number): void;
  onExit(): void;
  /** Opens the window the audience sees. Resolves to false when the browser blocked it. */
  onOpenAudience(): Promise<boolean>;
  /** True while an audience window is open. */
  audienceOpen: boolean;
};

const NOTES_SIZE_KEY = 'uslides.presenter.notesSize';

function SlideFrame({ slide, deck, urls, blockExternal, fontVersion, label }: {
  slide: Slide;
  deck: Deck;
  urls: Map<string, string>;
  blockExternal: boolean;
  fontVersion: number;
  label: string;
}) {
  const frame = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = frame.current!;
    const stage = renderSlide(slide, deck.settings, {
      blockExternal,
      resolveImage: (src) => urls.get(imageKey(src)),
    });
    const unmount = mountScaled(stage, container);
    fitSlide(stage);
    return () => {
      unmount();
      container.replaceChildren();
    };
  }, [slide, deck.settings, urls, blockExternal, fontVersion]);
  return <div className="presenter-slide" ref={frame} role="img" aria-label={label} />;
}

function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${two(m)}:${two(s)}`;
}

/** A stopwatch that starts with the presenter view, and can be paused and reset. */
function useStopwatch() {
  const [started, setStarted] = useState(() => Date.now());
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, []);
  const elapsed = (pausedAt ?? now) - started;
  return {
    elapsed: Math.max(0, elapsed),
    paused: pausedAt !== null,
    now,
    toggle: () => {
      if (pausedAt === null) setPausedAt(Date.now());
      else {
        setStarted((s) => s + (Date.now() - pausedAt));
        setPausedAt(null);
      }
    },
    reset: () => {
      setStarted(Date.now());
      setPausedAt((p) => (p === null ? null : Date.now()));
      setNow(Date.now());
    },
  };
}

/** The presenter's screen: the current slide, the next one, speaker notes and a timer. */
export function PresenterView({ deck, images, blockExternal, slide, onGo, onExit, onOpenAudience, audienceOpen }: Props) {
  const urls = useImageUrls(images);
  const fontVersion = useDeckFonts(deck, blockExternal);
  const count = deck.slides.length;
  const current = Math.min(Math.max(1, slide), count);
  const shown = deck.slides[current - 1]!;
  const next = deck.slides[current];
  const clock = useStopwatch();
  const [blocked, setBlocked] = useState(false);
  const [notesSize, setNotesSize] = useState(() => {
    try {
      const saved = Number(localStorage.getItem(NOTES_SIZE_KEY));
      return saved >= 14 && saved <= 48 ? saved : 22;
    } catch {
      return 22;
    }
  });
  const root = useRef<HTMLDivElement>(null);

  const latest = useRef({ current, count, onGo, onExit });
  latest.current = { current, count, onGo, onExit };

  useEffect(() => {
    if (current !== slide) onGo(current);
  }, [current, slide, onGo]);

  useEffect(() => {
    root.current?.focus();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(NOTES_SIZE_KEY, String(notesSize));
    } catch {
      // The size still applies for now.
    }
  }, [notesSize]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.target instanceof Element && e.target.closest('button') && (e.key === ' ' || e.key === 'Enter')) return;
      const { current: at, count: n, onGo: go, onExit: exit } = latest.current;
      if (e.key === 'Escape') {
        e.preventDefault();
        return exit();
      }
      const target = slideTarget(e.key, at, n);
      if (target === undefined) return;
      e.preventDefault();
      if (target !== at) go(target);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  const openAudience = () => {
    void onOpenAudience().then((ok) => setBlocked(!ok));
  };

  const notes = shown.notes.join('\n\n').trim();
  const time = new Date(clock.now).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  return (
    <div className="presenter" ref={root} tabIndex={-1} role="region" aria-label={`Presenter view, slide ${current} of ${count}`}>
      <header className="presenter-top">
        <span className="presenter-count" aria-live="polite">Slide {current} of {count}</span>
        <div className="presenter-timer" role="timer" aria-label={`Time presenting ${formatTime(clock.elapsed)}`}>
          <span className={clock.paused ? 'presenter-time paused' : 'presenter-time'}>{formatTime(clock.elapsed)}</span>
          <IconButton label={clock.paused ? 'Resume timer' : 'Pause timer'} icon={clock.paused ? Play : Pause} onClick={clock.toggle} />
          <IconButton label="Reset timer" icon={RotateCcw} onClick={clock.reset} />
        </div>
        <span className="presenter-clock">{time}</span>
        <div className="presenter-top-end">
          {audienceOpen ? (
            <span className="presenter-status">Audience window is open</span>
          ) : (
            <LabelButton label="Open audience window" icon={MonitorUp} onClick={openAudience} />
          )}
          <LabelButton label="End" icon={X} onClick={onExit} />
        </div>
      </header>
      {blocked && !audienceOpen && (
        <p className="presenter-blocked" role="alert">
          The browser blocked the audience window. Allow pop-ups for this site, then click Open audience window again.
        </p>
      )}
      <div className="presenter-main">
        <section className="presenter-current" aria-label="Current slide">
          <SlideFrame slide={shown} deck={deck} urls={urls} blockExternal={blockExternal} fontVersion={fontVersion} label={`Slide ${current}`} />
        </section>
        <aside className="presenter-side">
          <section className="presenter-next" aria-label="Next slide">
            <h2>Next</h2>
            {next ? (
              <SlideFrame slide={next} deck={deck} urls={urls} blockExternal={blockExternal} fontVersion={fontVersion} label={`Slide ${current + 1}`} />
            ) : (
              <div className="presenter-end">End of the deck</div>
            )}
          </section>
          <section className="presenter-notes" aria-label="Speaker notes">
            <div className="presenter-notes-head">
              <h2>Notes</h2>
              <IconButton label="Smaller notes" icon={Minus} disabled={notesSize <= 14} onClick={() => setNotesSize((s) => Math.max(14, s - 2))} />
              <IconButton label="Larger notes" icon={Plus} disabled={notesSize >= 48} onClick={() => setNotesSize((s) => Math.min(48, s + 2))} />
            </div>
            {notes ? (
              <div
                className="presenter-notes-text"
                style={{ fontSize: notesSize }}
                // Notes are rendered by the same safe Markdown renderer as slides, with web images blocked.
                dangerouslySetInnerHTML={{ __html: renderMarkdown(notes, { blockExternal: true }) }}
              />
            ) : (
              <p className="presenter-notes-empty">
                No notes on this slide. Add one in the text with <code>{'<!-- note: what to say -->'}</code>.
              </p>
            )}
          </section>
        </aside>
      </div>
      <footer className="presenter-bottom">
        <LabelButton label="Previous" icon={ChevronLeft} disabled={current <= 1} onClick={() => onGo(current - 1)} />
        <LabelButton label="Next" icon={ChevronRight} className="primary" disabled={current >= count} onClick={() => onGo(current + 1)} />
      </footer>
    </div>
  );
}
