import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { deckName, setTitle } from '../core/settings';

export type DeckRecord = {
  id: string;
  source: string;
  createdAt: number;
  updatedAt: number;
  revision: number;
  privacy?: 'allowed' | 'blocked';
  file?: FileSystemFileHandle;
  folder?: FileSystemDirectoryHandle;
  lastSyncedSource?: string;
  lastSyncedModified?: number;
};

// Images are stored as raw bytes plus a type, not as Blob objects. This works
// the same in every browser and in the Node test environment.
type ImageRecord = { deckId: string; path: string; type: string; bytes: ArrayBuffer };

interface UslidesDB extends DBSchema {
  decks: { key: string; value: DeckRecord };
  images: { key: [string, string]; value: ImageRecord; indexes: { deckId: string } };
}

let dbPromise: Promise<IDBPDatabase<UslidesDB>> | undefined;

function db(): Promise<IDBPDatabase<UslidesDB>> {
  if (!dbPromise) {
    const opening = openDB<UslidesDB>('uslides', 2, {
      upgrade(d, oldVersion) {
        if (oldVersion < 1) {
          d.createObjectStore('decks', { keyPath: 'id' });
          const images = d.createObjectStore('images', { keyPath: ['deckId', 'path'] });
          images.createIndex('deckId', 'deckId');
        }
        // Version 2 adds an optional field, so existing deck rows need no changes.
      },
      // Another tab wants to upgrade or delete the database: let go so it can.
      blocking() {
        forget(opening);
      },
      // The browser closed the connection (for example, storage was cleared).
      terminated() {
        forget(opening);
      },
    });
    // A failed open must not be cached, or every later save would fail until reload.
    opening.catch(() => forget(opening));
    dbPromise = opening;
  }
  return dbPromise;
}

/** Drops the cached connection so the next call opens a fresh one. Closes it if it was open. */
function forget(opening: Promise<IDBPDatabase<UslidesDB>>): void {
  if (dbPromise === opening) dbPromise = undefined;
  opening.then((d) => d.close(), () => {});
}

/** Test only: closes the cached connection so a fresh database can be used. */
export async function _resetForTests(): Promise<void> {
  const opening = dbPromise;
  dbPromise = undefined;
  (await opening?.catch(() => undefined))?.close();
}

/** Strips a leading "./", collapses repeated "/", rejects ".." and absolute paths. */
export function normalizePath(path: string): string {
  if (path.startsWith('/')) throw new Error(`Invalid image path: ${path}`);
  const parts = path.split('/').filter((p) => p !== '' && p !== '.');
  if (parts.length === 0 || parts.includes('..')) throw new Error(`Invalid image path: ${path}`);
  return parts.join('/');
}

export async function listDecks(): Promise<Array<{ id: string; name: string; updatedAt: number }>> {
  const all = await (await db()).getAll('decks');
  return all
    .map((d) => ({ id: d.id, name: deckName(d.source), updatedAt: d.updatedAt }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getDeck(id: string): Promise<DeckRecord | undefined> {
  return (await db()).get('decks', id);
}

export async function createDeck(source: string, extra: Partial<DeckRecord> = {}): Promise<DeckRecord> {
  const now = Date.now();
  const deck: DeckRecord = {
    ...extra,
    id: crypto.randomUUID(),
    source,
    createdAt: now,
    updatedAt: now,
    revision: 1,
  };
  await (await db()).put('decks', deck);
  return deck;
}

/** Compares the revision and writes in one transaction, so two tabs cannot interleave. */
export async function saveDeck(
  id: string,
  source: string,
  expectedRevision: number,
): Promise<{ ok: true; revision: number } | { ok: false; current: DeckRecord }> {
  const tx = (await db()).transaction('decks', 'readwrite');
  const current = await tx.store.get(id);
  if (!current) {
    await tx.done;
    throw new Error(`Deck not found: ${id}`);
  }
  if (current.revision !== expectedRevision) {
    await tx.done;
    return { ok: false, current };
  }
  const revision = current.revision + 1;
  await tx.store.put({ ...current, source, revision, updatedAt: Date.now() });
  await tx.done;
  return { ok: true, revision };
}

/** Updates file handles and sync fields. Not a content change: no revision or updatedAt bump. */
export async function updateDeckMeta(
  id: string,
  patch: Partial<Omit<DeckRecord, 'id' | 'source' | 'revision'>>,
): Promise<void> {
  const tx = (await db()).transaction('decks', 'readwrite');
  const current = await tx.store.get(id);
  if (!current) {
    await tx.done;
    throw new Error(`Deck not found: ${id}`);
  }
  await tx.store.put({ ...current, ...patch });
  await tx.done;
}

/** Changes the deck's privacy choice without treating it as a content edit. */
export async function setDeckPrivacy(
  id: string,
  privacy: DeckRecord['privacy'],
): Promise<DeckRecord> {
  const tx = (await db()).transaction('decks', 'readwrite');
  const current = await tx.store.get(id);
  if (!current) {
    await tx.done;
    throw new Error(`Deck not found: ${id}`);
  }
  const next = { ...current };
  if (privacy === undefined) delete next.privacy;
  else next.privacy = privacy;
  await tx.store.put(next);
  await tx.done;
  return next;
}

export async function renameDeck(id: string, title: string): Promise<DeckRecord> {
  const tx = (await db()).transaction('decks', 'readwrite');
  const current = await tx.store.get(id);
  if (!current) {
    await tx.done;
    throw new Error(`Deck not found: ${id}`);
  }
  const next = {
    ...current,
    source: setTitle(current.source, title),
    revision: current.revision + 1,
    updatedAt: Date.now(),
  };
  await tx.store.put(next);
  await tx.done;
  return next;
}

/** The copy keeps the same source (and so the same name), with no file link or sync fields. */
export async function duplicateDeck(id: string): Promise<DeckRecord> {
  const tx = (await db()).transaction(['decks', 'images'], 'readwrite');
  const original = await tx.objectStore('decks').get(id);
  if (!original) {
    await tx.done;
    throw new Error(`Deck not found: ${id}`);
  }
  const now = Date.now();
  const copy: DeckRecord = {
    id: crypto.randomUUID(),
    source: original.source,
    createdAt: now,
    updatedAt: now,
    revision: 1,
    ...(original.privacy === undefined ? {} : { privacy: original.privacy }),
  };
  await tx.objectStore('decks').put(copy);
  const images = await tx.objectStore('images').index('deckId').getAll(id);
  for (const img of images) await tx.objectStore('images').put({ ...img, deckId: copy.id });
  await tx.done;
  return copy;
}

export async function deleteDeck(id: string): Promise<void> {
  const tx = (await db()).transaction(['decks', 'images'], 'readwrite');
  await tx.objectStore('decks').delete(id);
  const store = tx.objectStore('images');
  const imgs = await store.index('deckId').getAll(id);
  for (const img of imgs) await store.delete([img.deckId, img.path]);
  await tx.done;
}

export async function putImage(deckId: string, path: string, blob: Blob): Promise<void> {
  const key = normalizePath(path);
  const bytes = await blob.arrayBuffer();
  await (await db()).put('images', { deckId, path: key, type: blob.type, bytes });
}

export async function getImages(deckId: string): Promise<Map<string, Blob>> {
  const rows = await (await db()).getAllFromIndex('images', 'deckId', deckId);
  return new Map(rows.map((r) => [r.path, new Blob([r.bytes], { type: r.type })]));
}

export async function getAllDecks(): Promise<DeckRecord[]> {
  return (await db()).getAll('decks');
}

export type NewDeck = {
  source: string;
  createdAt: number;
  updatedAt: number;
  privacy?: DeckRecord['privacy'];
  images: Array<{ path: string; type: string; bytes: ArrayBuffer }>;
};

/** Adds every deck (new ids, given dates) with its images in one transaction: all are added or none. Used by restore. */
export async function addDecksWithImages(decks: NewDeck[]): Promise<void> {
  const rows = decks.map((d) => {
    const deck: DeckRecord = {
      id: crypto.randomUUID(),
      source: d.source,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      revision: 1,
      ...(d.privacy === undefined ? {} : { privacy: d.privacy }),
    };
    return { deck, images: d.images.map((i) => ({ deckId: deck.id, path: normalizePath(i.path), type: i.type, bytes: i.bytes })) };
  });
  const tx = (await db()).transaction(['decks', 'images'], 'readwrite');
  try {
    for (const { deck, images } of rows) {
      await tx.objectStore('decks').put(deck);
      for (const img of images) await tx.objectStore('images').put(img);
    }
  } catch (err) {
    tx.done.catch(() => undefined); // the abort rejects this; the original error is the one to report
    tx.abort();
    throw err;
  }
  await tx.done;
}
