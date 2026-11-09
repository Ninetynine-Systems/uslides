import { bytesToBase64 } from '../export/packImages';
import { addDeckWithImages, getAllDecks, getImages } from './db';

export const NOT_A_BACKUP = 'This is not a uslides backup';

type BackupDeck = {
  source: string;
  createdAt: number;
  updatedAt: number;
  images: Array<{ path: string; type: string; base64: string }>;
};

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** One JSON file with every deck's Markdown and stored images. File links are not included. */
export async function exportBackup(): Promise<Blob> {
  const decks: BackupDeck[] = [];
  for (const deck of await getAllDecks()) {
    const images: BackupDeck['images'] = [];
    for (const [path, blob] of await getImages(deck.id)) {
      images.push({ path, type: blob.type, base64: bytesToBase64(new Uint8Array(await blob.arrayBuffer())) });
    }
    decks.push({ source: deck.source, createdAt: deck.createdAt, updatedAt: deck.updatedAt, images });
  }
  return new Blob([JSON.stringify({ app: 'uslides', version: 1, decks })], { type: 'application/json' });
}

function isBackupDeck(d: unknown): d is BackupDeck {
  if (typeof d !== 'object' || d === null) return false;
  const x = d as Record<string, unknown>;
  return (
    typeof x.source === 'string' &&
    typeof x.createdAt === 'number' &&
    typeof x.updatedAt === 'number' &&
    Array.isArray(x.images) &&
    x.images.every((i: unknown) => {
      const y = i as Record<string, unknown> | null;
      return !!y && typeof y.path === 'string' && typeof y.type === 'string' && typeof y.base64 === 'string';
    })
  );
}

/** Adds every deck in the backup as a new deck and returns how many. Existing decks are never touched. */
export async function importBackup(blob: Blob): Promise<number> {
  let data: unknown;
  try {
    data = JSON.parse(await blob.text());
  } catch {
    throw new Error(NOT_A_BACKUP);
  }
  const file = data as { app?: unknown; version?: unknown; decks?: unknown } | null;
  if (!file || file.app !== 'uslides' || file.version !== 1 || !Array.isArray(file.decks) || !file.decks.every(isBackupDeck)) {
    throw new Error(NOT_A_BACKUP);
  }
  for (const deck of file.decks) {
    await addDeckWithImages(
      deck.source,
      deck.createdAt,
      deck.updatedAt,
      deck.images.map((i) => ({ path: i.path, blob: new Blob([base64ToBytes(i.base64)], { type: i.type }) })),
    );
  }
  return file.decks.length;
}
