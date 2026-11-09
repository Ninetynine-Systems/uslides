import { useCallback, useEffect, useRef, useState } from 'react';
import { deckName } from '../core/settings';
import {
  createDeck, deleteDeck, duplicateDeck, listDecks, renameDeck,
} from '../storage/db';
import { DeckList, type DeckSummary } from './DeckList';
import { Editor, type EditorHandle } from './Editor';
import { Notices, useNotices } from './Notices';
import { Preview } from './Preview';
import { Toolbar } from './Toolbar';
import { deckHash, parseRoute } from './route';
import sample from './sample.md?raw';
import { useDeck } from './useDeck';
import './app.css';

const NEW_DECK = '# Untitled\n';

let boot: Promise<string> | undefined;

/** Picks the deck to show first: the one in the URL, else the newest, else a new copy of the sample. */
function pickInitialDeck(): Promise<string> {
  boot ??= (async () => {
    const decks = await listDecks();
    const wanted = parseRoute(location.hash).deckId;
    if (wanted && decks.some((d) => d.id === wanted)) return wanted;
    if (decks[0]) return decks[0].id;
    return (await createDeck(sample)).id;
  })();
  return boot;
}

export function App() {
  const [deckId, setDeckId] = useState<string>();
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [listOpen, setListOpen] = useState(() => window.matchMedia('(min-width: 768px)').matches);
  const [showGrid, setShowGrid] = useState(true);
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
      if (id) setDeckId(id);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    if (window.__uslides) window.__uslides.getSource = () => current.source;
  }, [current.source]);

  const name = ready ? deckName(current.source) : '';
  const selectDeck = (id: string) => {
    if (id !== deckId) location.hash = deckHash(id);
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
        onRename={rename}
        onDuplicate={duplicate}
        onDelete={remove}
      />
      <div className="decks" id="decks" hidden={!listOpen}>
        <DeckList decks={decks} activeId={deckId} onSelect={selectDeck} onNew={newDeck} />
      </div>
      <main className="workspace">
        <div className="editor-pane">
          {ready && (
            <Editor
              ref={editor}
              value={current.source}
              onChange={current.setSource}
              warnings={current.warnings}
            />
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
