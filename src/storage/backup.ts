import { bytesToBase64 } from '../export/packImages';
import { addDecksWithImages, getAllDecks, getImages, normalizePath, type NewDeck } from './db';

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

const MAX_BACKUP_BYTES = 200 * 1024 * 1024;

const damaged = (reason: string) => new Error(`This backup file is damaged: ${reason}`);

/** Checks one deck and decodes its images. Throws "damaged" with a short reason. Writes nothing. */
function decodeDeck(d: unknown, n: number): NewDeck {
  const x = d as Record<string, unknown> | null;
  if (!x || typeof x.source !== 'string' || typeof x.createdAt !== 'number' || typeof x.updatedAt !== 'number' || !Array.isArray(x.images)) {
    throw damaged(`deck ${n} is not in the expected form`);
  }
  const images = x.images.map((i: unknown) => {
    const y = i as Record<string, unknown> | null;
    if (!y || typeof y.path !== 'string' || typeof y.type !== 'string' || typeof y.base64 !== 'string') {
      throw damaged(`an image in deck ${n} is not in the expected form`);
    }
    try {
      normalizePath(y.path);
    } catch {
      throw damaged(`deck ${n} has an image with a bad path (${y.path})`);
    }
    let bytes: Uint8Array<ArrayBuffer>;
    try {
      bytes = base64ToBytes(y.base64);
    } catch {
      throw damaged(`an image in deck ${n} could not be decoded`);
    }
    return { path: y.path, type: y.type, bytes: bytes.buffer };
  });
  return { source: x.source, createdAt: x.createdAt, updatedAt: x.updatedAt, images };
}

/** Adds every deck in the backup as a new deck and returns how many. Existing decks are never touched. A bad file adds nothing. */
export async function importBackup(blob: Blob): Promise<number> {
  if (blob.size > MAX_BACKUP_BYTES) throw new Error('This backup file is too large to restore (over 200 MB).');
  let data: unknown;
  try {
    data = JSON.parse(await blob.text());
  } catch {
    throw new Error(NOT_A_BACKUP);
  }
  const file = data as { app?: unknown; version?: unknown; decks?: unknown } | null;
  if (!file || file.app !== 'uslides' || file.version !== 1 || !Array.isArray(file.decks)) throw new Error(NOT_A_BACKUP);
  const decks = file.decks.map((d, i) => decodeDeck(d, i + 1));
  await addDecksWithImages(decks);
  return decks.length;
}
