import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { deckName } from '../core/settings';
import { pickFolder, pickMarkdownFile, readFolderImage, supportsFileLink, supportsFolderLink } from '../files/fileLink';
import { downloadMarkdown, exportHtml, fileSlug, printDeck, saveBlob } from '../export/download';
import { baseType, packImages } from '../export/packImages';
import { importFiles, importFromFolder, NO_MARKDOWN, openFolder, readDrop } from '../files/importFiles';
import { LONG_LINK_CHARS, makeShareLink, readShareHash, ShareLinkError } from '../share/link';
import {
  createDeck, deleteDeck, duplicateDeck, getImages, listDecks, renameDeck,
} from '../storage/db';
import { DeckList, type DeckSummary } from './DeckList';
import type { EditorHandle } from './Editor';
import { exportBackup, importBackup } from '../storage/backup';
import { dismissSafariNote, requestPersistence, SAFARI_NOTE, shouldShowSafariNote } from '../storage/persist';
import { registerSW } from 'virtual:pwa-register';
import { ConflictDialog, FilePicker } from './FileDialogs';
import { isImageDrop } from './editor/dropMarker';
import { pasteImage } from './editor/pasteImage';
import { Notices, useNotices } from './Notices';
import { Present } from './Present';
import { imageKey, Preview, useImageUrls } from './Preview';
import { Toolbar } from './Toolbar';
import { deckHash, parseRoute } from './route';
import sample from './sample.md?raw';
import { useDeck } from './useDeck';
import { useFileSync } from './useFileSync';
import { useFolderImages } from './useFolderImages';
import './app.css';

// The editor (CodeMirror) is a separate chunk, so phones, which hide it, never download it.
const Editor = lazy(() => import('./Editor').then((m) => ({ default: m.Editor })));

const NEW_DECK = '# Untitled\n';

/** Media types by file extension, for stored images that came without one. */
const EXT_TYPES: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', svg: 'image/svg+xml', avif: 'image/avif',
};

/** The notice for images that could not be embedded, shared by Pack images and Download .html. */
function failedImagesNotice(failed: string[], tooLarge: string[]): string {
  const label = (src: string) => (tooLarge.includes(src) ? `${src} (over 5 MB)` : src);
  return `Could not embed ${failed.length === 1 ? 'this image' : `these ${failed.length} images`}: ${failed.map(label).join(', ')}`;
}

export const LONG_LINK_NOTICE =
  'This link is very long and some chat apps may cut it off. Use Download .html or Download .md to share it as a file instead.';
export const IMAGES_NOTICE = 'Images stored in this browser are not included in links';

/** `damaged` holds the notice text when the link in the URL could not be opened. */
type Boot = { id: string; damaged?: string };

let boot: Promise<Boot> | undefined;
let pwaStarted = false;

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
  const sync = useFileSync(current, notify);
  const folderImages = useFolderImages(sync.folder, current.source, ready && !sync.needsAccess, sync.version);
  // Folder first, then images stored in the browser; a path in neither shows the "not found" placeholder.
  const images = useMemo(
    () => (folderImages.size === 0 ? current.images : new Map([...current.images, ...folderImages])),
    [current.images, folderImages],
  );
  const fileInput = useRef<HTMLInputElement>(null);
  const [folderChoice, setFolderChoice] = useState<{ dir: FileSystemDirectoryHandle; files: FileSystemFileHandle[] }>();
  const [dragging, setDragging] = useState(false);

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

  const flushRef = useRef(flush);
  flushRef.current = flush;

  // Once per page load: ask for permanent storage, show the Safari note, and watch for a new version.
  useEffect(() => {
    if (pwaStarted) return;
    pwaStarted = true;
    void requestPersistence();
    if (shouldShowSafariNote()) notify(SAFARI_NOTE, { sticky: true, onDismiss: dismissSafariNote });
    let applying = false;
    const updateSW = registerSW({
      onNeedRefresh() {
        const apply = () => {
          if (applying) return; // ignore repeat clicks
          applying = true;
          // Save what was typed in the last moment first: the reload would drop it.
          flushRef.current().catch(() => undefined).then(() => updateSW(true), () => undefined);
        };
        notify('', { sticky: true, action: { label: 'Update available — reload', run: apply } });
      },
    });
  }, [notify]);

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

  /** Makes a deck from whatever `make` reads, then shows it. */
  const openImported = useCallback(
    async (make: () => Promise<string | undefined>) => {
      await flush();
      const id = await make();
      if (!id) return;
      openDeck(id);
      refreshList();
    },
    [flush, openDeck, refreshList],
  );

  const reportError = useCallback(
    (err: unknown) => notify(err instanceof Error ? err.message : `Something went wrong: ${String(err)}`),
    [notify],
  );

  const openFile = () => {
    if (!supportsFileLink()) {
      fileInput.current?.click();
      return;
    }
    openImported(async () => {
      const handle = await pickMarkdownFile();
      return handle ? importFiles([handle]) : undefined;
    }).catch(reportError);
  };

  const openFolderClick = () => {
    openImported(async () => {
      const dir = await pickFolder();
      if (!dir) return undefined;
      const found = await openFolder(dir);
      if (found.kind === 'none') notify(NO_MARKDOWN);
      if (found.kind === 'choose') setFolderChoice({ dir, files: found.files });
      return found.kind === 'one' ? found.id : undefined;
    }).catch(reportError);
  };

  // Dropping files anywhere on the window opens them.
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files') ?? false;
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth += 1;
      setDragging(true);
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const onOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      if (isImageDrop(e)) return; // the editor took the images and inserted them into the deck
      const dropped = readDrop(e.dataTransfer!); // must start inside the event
      openImported(async () => importFiles(await dropped)).catch(reportError);
    };
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('dragover', onOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('drop', onDrop);
    };
  }, [openImported, reportError]);

  /** Extensions for the editor, fixed for its life. Notices are the only thing they need from the app. */
  const editorExtensions = useMemo(() => [pasteImage({ onNotice: notify })], [notify]);

  const sourceRef = useRef(current.source);
  sourceRef.current = current.source;
  const lookupRef = useRef({ folder: sync.folder, allowed: false, stored: current.images });
  lookupRef.current = { folder: sync.folder, allowed: ready && !sync.needsAccess, stored: current.images };

  /** Finds an image for Pack images: web URLs over the network; relative paths in the folder, then in this browser. */
  const fetchImage = useCallback(async (src: string): Promise<Blob | null> => {
    if (/^https?:\/\//i.test(src)) {
      try {
        const res = await fetch(src);
        return res.ok ? await res.blob() : null;
      } catch {
        return null; // offline, or the site does not allow other pages to read its images
      }
    }
    let path = src;
    try {
      path = decodeURIComponent(src);
    } catch {
      // keep the raw text
    }
    const key = imageKey(path);
    if (key === '' || key.split('/').includes('..')) return null;
    const { folder, allowed, stored } = lookupRef.current;
    const blob = (folder && allowed ? await readFolderImage(folder, key) : undefined) ?? stored.get(key);
    if (!blob) return null;
    if (baseType(blob.type) !== '' && baseType(blob.type) !== 'application/octet-stream') return blob;
    const guess = EXT_TYPES[key.split('.').pop()?.toLowerCase() ?? ''];
    return guess ? new Blob([blob], { type: guess }) : blob;
  }, []);

  const packAllImages = async () => {
    if (!ready) return;
    const before = current.source;
    const { source, failed, tooLarge } = await packImages(before, fetchImage);
    if (sourceRef.current !== before) {
      notify('The deck changed while images were being packed. Try again.');
      return;
    }
    if (source !== before) {
      if (editor.current) editor.current.replaceSource(source);
      else current.setSource(source);
    }
    if (failed.length > 0) {
      notify(failedImagesNotice(failed, tooLarge));
    } else if (source === before) {
      notify('There are no images to pack.');
    } else {
      notify('Images packed into the deck.');
    }
  };

  const printUrls = useImageUrls(images);
  const name = ready ? deckName(current.source) : '';

  const downloadMd = async () => {
    if (!ready) return;
    await flush();
    downloadMarkdown(sourceRef.current, deckName(sourceRef.current));
  };

  const downloadHtml = async () => {
    if (!ready) return;
    await flush();
    const source = sourceRef.current;
    const { blob, failed, tooLarge } = await exportHtml(source, fetchImage);
    saveBlob(blob, `${fileSlug(deckName(source))}.html`);
    if (failed.length > 0) notify(failedImagesNotice(failed, tooLarge));
  };

  const print = async () => {
    if (!ready || !current.deck) return;
    await flush();
    await printDeck(current.deck, (src) => printUrls.get(imageKey(src)));
  };
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

  const restoreInput = useRef<HTMLInputElement>(null);

  const backupAll = async () => {
    await flush();
    const day = new Date().toISOString().slice(0, 10);
    saveBlob(await exportBackup(), `uslides-backup-${day}.json`);
  };

  const restoreFrom = async (file: File) => {
    await flush();
    try {
      const count = await importBackup(file);
      refreshList();
      notify(`Restored ${count} ${count === 1 ? 'deck' : 'decks'}`);
    } catch (err) {
      reportError(err);
    }
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
        onPackImages={guarded(packAllImages)}
        onDownloadMarkdown={guarded(downloadMd)}
        onDownloadHtml={guarded(downloadHtml)}
        onPrint={guarded(print)}
        onOpen={openFile}
        onOpenFolder={supportsFolderLink() ? openFolderClick : undefined}
        link={ready ? sync.link : undefined}
        needsAccess={sync.needsAccess}
        readOnly={sync.readOnly}
        onGrant={guarded(sync.grant)}
        onUnlink={guarded(sync.unlink)}
      />
      <div className="decks" id="decks" hidden={!listOpen}>
        <DeckList decks={decks} activeId={deckId} onSelect={selectDeck} onNew={guarded(newDeck)}
          onBackup={guarded(backupAll)}
          onRestore={() => restoreInput.current?.click()}
        />
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
              extensions={editorExtensions}
            />
            </Suspense>
          )}
        </div>
        <Preview
          deck={ready ? current.deck : undefined}
          images={images}
          showGrid={showGrid}
          onShowGridChange={setShowGrid}
          onSelectSlide={(i) => {
            const slide = current.deck?.slides[i];
            if (slide) editor.current?.moveCursorTo(slide.range.from);
          }}
        />
      </main>
      <Notices notices={notices} onDismiss={dismiss} />
      <input
        ref={fileInput}
        type="file"
        hidden
        multiple
        accept=".md,.markdown,text/markdown,image/*"
        aria-label="Open files"
        onChange={(e) => {
          const picked = [...(e.currentTarget.files ?? [])];
          e.currentTarget.value = '';
          if (picked.length > 0) openImported(() => importFiles(picked)).catch(reportError);
        }}
      />
      <input
        ref={restoreInput}
        type="file"
        hidden
        accept=".json,application/json"
        aria-label="Restore from backup file"
        onChange={(e) => {
          const picked = e.currentTarget.files?.[0];
          e.currentTarget.value = '';
          if (picked) guarded(() => restoreFrom(picked))();
        }}
      />
      {dragging && <div className="drop-overlay">Drop Markdown and image files to open them</div>}
      {sync.conflict && <ConflictDialog onChoose={(c) => guarded(() => sync.resolve(c))()} />}
      {folderChoice && (
        <FilePicker
          names={folderChoice.files.map((f) => f.name)}
          onCancel={() => setFolderChoice(undefined)}
          onPick={(i) => {
            const { dir, files } = folderChoice;
            setFolderChoice(undefined);
            openImported(() => importFromFolder(dir, files[i]!)).catch(reportError);
          }}
        />
      )}
    </div>
    {showPresent && (
      <Present
        deck={current.deck!}
        images={images}
        slide={presenting}
        onGo={goToSlide}
        onExit={stopPresenting}
      />
    )}
    </>
  );
}
