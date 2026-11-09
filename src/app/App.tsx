import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { deckName } from '../core/settings';
import {
  createDeck, deleteDeck, duplicateDeck, listDecks, renameDeck,
} from '../storage/db';
import { DeckList, type DeckSummary } from './DeckList';
import type { EditorHandle } from './Editor';
import { Notices, useNotices } from './Notices';
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

  const refreshList = useCallback(() => {
    void listDecks().then(setDecks);
  }, []);

  const current = useDeck(deckId, { onNotice: notify, onChanged: refreshList });
  const { flush, discard, adopt } = current;
  const ready = current.record?.id === deckId;

  /** Shows a deck and updates the URL without adding a history entry. */
  const openDeck = useCallback((id: string) => {
    setDeckId(id);
    if (!location.hash || parseRoute(location.hash).deckId !== undefined) {
      history.replaceState(null, '', deckHash(id));
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
      const id = parseRoute(location.hash).deckId;
      if (!id) return;
      // A link to a deck that no longer exists (for example Back after deleting it) shows another deck.
      void resolveDeck(id).then((found) => {
        if (found !== id) history.replaceState(null, '', deckHash(found));
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

  return (
    <div className={listOpen ? 'app list-open' : 'app'}>
      <Toolbar
        listOpen={listOpen}
        onToggleList={() => setListOpen((o) => !o)}
        name={name}
        onRename={guarded(rename)}
        onDuplicate={guarded(duplicate)}
        onDelete={guarded(remove)}
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
  );
}
