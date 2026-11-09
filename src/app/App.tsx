import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { deckName } from '../core/settings';
import {
  createDeck, deleteDeck, duplicateDeck, listDecks, renameDeck,
} from '../storage/db';
import { DeckList, type DeckSummary } from './DeckList';
import type { EditorHandle } from './Editor';
import { Notices, useNotices } from './Notices';
import { Present } from './Present';
import { Preview } from './Preview';
import { Toolbar } from './Toolbar';
import { deckHash, parseRoute } from './route';
import sample from './sample.md?raw';
import { useDeck } from './useDeck';
import './app.css';

// The editor (CodeMirror) is a separate chunk, so phones, which hide it, never download it.
const Editor = lazy(() => import('./Editor').then((m) => ({ default: m.Editor })));

const NEW_DECK = '# Untitled\n';

let boot: Promise<string> | undefined;

/** Returns `wanted` if that deck exists, else the newest deck, else a new copy of the sample. */
async function resolveDeck(wanted: string | undefined): Promise<string> {
  const decks = await listDecks();
  if (wanted && decks.some((d) => d.id === wanted)) return wanted;
  if (decks[0]) return decks[0].id;
  return (await createDeck(sample)).id;
}

/** The first deck to show. Cached so React's double effect in development cannot create two samples. */
function pickInitialDeck(): Promise<string> {
  boot ??= resolveDeck(parseRoute(location.hash).deckId);
  return boot;
}

/** True when the screen is wide enough to show the editor. */
function useWide(): boolean {
  const query = '(min-width: 768px)';
  const [wide, setWide] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setWide(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return wide;
}

export function App() {
  const [deckId, setDeckId] = useState<string>();
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [listOpen, setListOpen] = useState(() => window.matchMedia('(min-width: 768px)').matches);
  const [showGrid, setShowGrid] = useState(true);
  const wide = useWide();
  const { notices, notify, dismiss } = useNotices();
  const editor = useRef<EditorHandle>(null);
  /** 1-based slide shown in present mode, or undefined when not presenting. */
  const [presenting, setPresenting] = useState<number | undefined>(() => parseRoute(location.hash).present);

  const refreshList = useCallback(() => {
    void listDecks().then(setDecks);
  }, []);

  const current = useDeck(deckId, { onNotice: notify, onChanged: refreshList });
  const { flush, discard, adopt } = current;
  const ready = current.record?.id === deckId;

  /** Shows a deck and updates the URL without adding a history entry. */
  const openDeck = useCallback((id: string) => {
    setDeckId(id);
    const route = parseRoute(location.hash);
    if (!location.hash || (route.deckId !== undefined && route.deckId !== id)) {
      history.replaceState(null, '', deckHash(id));
      setPresenting(undefined);
    }
  }, []);

  useEffect(() => {
    void pickInitialDeck().then((id) => {
      openDeck(id);
      refreshList();
    });
  }, [openDeck, refreshList]);

  // Back and forward, or a pasted deck link.
  useEffect(() => {
    const onHash = () => {
      const route = parseRoute(location.hash);
      const id = route.deckId;
      if (!id) return;
      setPresenting(route.present);
      // A link to a deck that no longer exists (for example Back after deleting it) shows another deck.
      void resolveDeck(id).then((found) => {
        if (found !== id) {
          history.replaceState(null, '', deckHash(found));
          setPresenting(undefined);
        }
        setDeckId(found);
        refreshList();
      });
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [refreshList]);

  useEffect(() => {
    if (window.__uslides) window.__uslides.getSource = () => current.source;
  }, [current.source]);

  const slideCount = ready ? current.deck?.slides.length : undefined;

  /** Starts presenting. Adds a history entry, so Back leaves present mode. */
  const startPresenting = useCallback(
    (slide: number) => {
      if (!deckId || !slideCount) return;
      history.pushState({ present: true }, '', deckHash(deckId, slide));
      setPresenting(slide);
    },
    [deckId, slideCount],
  );

  /** Changes slide while presenting. Replaces the history entry, so Back does not step through slides. */
  const goToSlide = useCallback(
    (slide: number) => {
      if (!deckId) return;
      history.replaceState(history.state, '', deckHash(deckId, slide));
      setPresenting(slide);
    },
    [deckId],
  );

  const stopPresenting = useCallback(() => {
    if (!deckId) return;
    if ((history.state as { present?: boolean } | null)?.present) {
      history.back(); // the hashchange handler then clears present mode
    } else {
      history.replaceState(null, '', deckHash(deckId));
    }
    setPresenting(undefined);
  }, [deckId]);

  /** The slide the editor cursor is in: the one whose range holds it, else the last one starting before it. */
  const slideAtCursor = useCallback((): number => {
    const slides = current.deck?.slides;
    const at = editor.current?.getCursor();
    if (!slides || at === undefined) return 1;
    let found = 0;
    slides.forEach((slide, i) => {
      if (slide.range.from <= at) found = i;
    });
    return found + 1;
  }, [current.deck]);

  // Ctrl/Cmd+Enter starts presenting. Runs before the editor sees the key, which would insert a line.
  useEffect(() => {
    if (presenting !== undefined) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      e.preventDefault();
      e.stopPropagation();
      startPresenting(slideAtCursor());
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [presenting, startPresenting, slideAtCursor]);

  const name = ready ? deckName(current.source) : '';
  const selectDeck = (id: string) => {
    if (id !== deckId) location.hash = deckHash(id);
  };

  /** Runs a toolbar action and reports a storage error as a notice instead of an unhandled rejection. */
  const guarded =
    (action: () => Promise<void>) =>
    () => {
      action().catch((err: unknown) => notify(`Something went wrong: ${err instanceof Error ? err.message : String(err)}`));
    };

  const newDeck = async () => {
    await flush();
    openDeck((await createDeck(NEW_DECK)).id);
    refreshList();
  };

  const rename = async () => {
    if (!deckId || !ready) return;
    const title = window.prompt('Rename deck', name);
    if (title === null || title.trim() === '') return;
    await flush();
    adopt(await renameDeck(deckId, title.trim()));
    refreshList();
  };

  const duplicate = async () => {
    if (!deckId) return;
    await flush();
    openDeck((await duplicateDeck(deckId)).id);
    refreshList();
  };

  const remove = async () => {
    if (!deckId || !ready) return;
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    const id = deckId;
    discard();
    const next = (await listDecks()).find((d) => d.id !== id);
    const nextId = next ? next.id : (await createDeck(NEW_DECK)).id;
    openDeck(nextId); // switch first so the deck being deleted is not saved again
    await deleteDeck(id);
    refreshList();
  };

  const showPresent = presenting !== undefined && ready && current.deck !== undefined;

  return (
    <>
    {/* inert: while presenting, nothing behind the slide can take focus or keys. */}
    <div className={listOpen ? 'app list-open' : 'app'} inert={showPresent}>
      <Toolbar
        listOpen={listOpen}
        onToggleList={() => setListOpen((o) => !o)}
        name={name}
        onRename={guarded(rename)}
        onDuplicate={guarded(duplicate)}
        onDelete={guarded(remove)}
        onPresent={() => startPresenting(1)}
      />
      <div className="decks" id="decks" hidden={!listOpen}>
        <DeckList decks={decks} activeId={deckId} onSelect={selectDeck} onNew={guarded(newDeck)} />
      </div>
      <main className="workspace">
        <div className="editor-pane">
          {ready && wide && (
            <Suspense fallback={null}>
            <Editor
              ref={editor}
              value={current.source}
              onChange={current.setSource}
              warnings={current.warnings}
            />
            </Suspense>
          )}
        </div>
        <Preview
          deck={ready ? current.deck : undefined}
          images={current.images}
          showGrid={showGrid}
          onShowGridChange={setShowGrid}
          onSelectSlide={(i) => {
            const slide = current.deck?.slides[i];
            if (slide) editor.current?.moveCursorTo(slide.range.from);
          }}
        />
      </main>
      <Notices notices={notices} onDismiss={dismiss} />
    </div>
    {showPresent && (
      <Present
        deck={current.deck!}
        images={current.images}
        slide={presenting}
        onGo={goToSlide}
        onExit={stopPresenting}
      />
    )}
    </>
  );
}
