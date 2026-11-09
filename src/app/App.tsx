import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { deckName } from '../core/settings';
import { LONG_LINK_CHARS, makeShareLink, readShareHash, ShareLinkError } from '../share/link';
import {
  createDeck, deleteDeck, duplicateDeck, getImages, listDecks, renameDeck,
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

export const LONG_LINK_NOTICE =
  'This link is very long and some chat apps may cut it off. Download the deck as a file to share it instead.';
export const IMAGES_NOTICE = 'Images stored in this browser are not included in links';

/** `damaged` holds the notice text when the link in the URL could not be opened. */
type Boot = { id: string; damaged?: string };

let boot: Promise<Boot> | undefined;

/** Returns `wanted` if that deck exists, else the newest deck, else a new copy of the sample. */
async function resolveDeck(wanted: string | undefined): Promise<string> {
  const decks = await listDecks();
  if (wanted && decks.some((d) => d.id === wanted)) return wanted;
  if (decks[0]) return decks[0].id;
  return (await createDeck(sample)).id;
}

/**
 * The first deck to show. A share link in the URL becomes a new deck; a damaged one is reported and
 * the normal pick is used instead. Cached so React's double effect in development cannot create two decks.
 */
function pickInitialDeck(): Promise<Boot> {
  boot ??= (async () => {
    let damaged: string | undefined;
    try {
      const shared = await readShareHash(location.hash);
      if (shared !== null) return { id: (await createDeck(shared)).id, damaged };
    } catch (err) {
      if (!(err instanceof ShareLinkError)) throw err;
      damaged = err.message;
    }
    return { id: await resolveDeck(parseRoute(location.hash).deckId), damaged };
  })();
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
    // Also replaces a share link or any other hash that is not a deck route.
    if (route.deckId !== id) {
      history.replaceState(null, '', deckHash(id));
      setPresenting(undefined);
    }
  }, []);

  useEffect(() => {
    void pickInitialDeck().then((first) => {
      openDeck(first.id);
      refreshList();
      if (first.damaged) {
        const text = first.damaged;
        first.damaged = undefined; // report once even if this effect runs twice
        notify(text);
      }
    });
  }, [openDeck, refreshList, notify]);

  const deckIdRef = useRef(deckId);
  deckIdRef.current = deckId;

  // Back and forward, or a pasted deck link.
  useEffect(() => {
    /** Handles a pasted share link. Returns true if the hash was one (good or damaged). */
    const onShareHash = async (hash: string): Promise<boolean> => {
      try {
        const shared = await readShareHash(hash);
        if (shared === null) return false;
        const id = (await createDeck(shared)).id;
        history.replaceState(null, '', deckHash(id));
        setPresenting(undefined);
        setDeckId(id);
      } catch (err) {
        if (!(err instanceof ShareLinkError)) throw err;
        notify(err.message); // "damaged or incomplete", or "too large to open"
        const keep = deckIdRef.current;
        if (keep) history.replaceState(null, '', deckHash(keep));
      }
      refreshList();
      return true;
    };
    const onHash = () => {
      if (/^#(z|md)=/.test(location.hash)) {
        onShareHash(location.hash).catch((err: unknown) =>
          notify(`Something went wrong: ${err instanceof Error ? err.message : String(err)}`),
        );
        return;
      }
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
  }, [refreshList, notify]);

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

  /** Copies a `#z=` link to the clipboard. Returns the link when the clipboard refused, so the user can copy it by hand. */
  const copyLink = async (): Promise<string | undefined> => {
    if (!deckId || !ready) return undefined;
    await flush();
    let link: string;
    let copied = false;
    try {
      link = await makeShareLink(current.source, 'z');
    } catch (err) {
      notify(`Could not make a link: ${err instanceof Error ? err.message : String(err)}`);
      return undefined;
    }
    try {
      await navigator.clipboard.writeText(link);
      copied = true;
      notify('Link copied');
    } catch {
      // The menu shows the link so the user can copy it by hand; the warnings below still apply.
    }
    if (link.length > LONG_LINK_CHARS) notify(LONG_LINK_NOTICE);
    if ((await getImages(deckId)).size > 0) notify(IMAGES_NOTICE);
    return copied ? undefined : link;
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
        onCopyLink={copyLink}
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
