// Turning dropped or picked files into decks. No React in this file.
import { createDeck, putImage, updateDeckMeta } from '../storage/db';
import { listMarkdownFiles, readFile, rememberLink } from './fileLink';

const isMarkdown = (name: string) => /\.(md|markdown)$/i.test(name);
const isImage = (f: File) => f.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|avif)$/i.test(f.name);

export const NO_MARKDOWN = 'No .md file in this folder';

/** Makes a deck that is linked to the file on disk. If storage refuses the handle, the link lasts for this session. */
async function createLinked(
  source: string,
  modified: number,
  link: { file: FileSystemFileHandle; folder?: FileSystemDirectoryHandle },
): Promise<string> {
  const sync = { lastSyncedSource: source, lastSyncedModified: modified };
  try {
    return (await createDeck(source, { ...link, ...sync })).id;
  } catch (err) {
    console.warn('Could not store the file link; it will last until this tab closes.', err);
    const deck = await createDeck(source, sync);
    rememberLink(deck.id, link);
    return deck.id;
  }
}

/**
 * Makes a deck from picked or dropped files and returns its id.
 * A single `.md` file handle makes a linked deck. `File` objects make an unlinked one, and any
 * image files in the same drop are copied into storage next to the deck.
 */
export async function importFiles(files: File[] | FileSystemHandle[]): Promise<string> {
  const first = files[0];
  if (!first) throw new Error('No files to open');
  if ('kind' in first) {
    const handle = (files as FileSystemHandle[]).find((h): h is FileSystemFileHandle => h.kind === 'file' && isMarkdown(h.name));
    if (!handle) throw new Error('Choose a Markdown (.md) file');
    const { text, modified } = await readFile(handle);
    return createLinked(text, modified, { file: handle });
  }
  const all = files as File[];
  const md = all.find((f) => isMarkdown(f.name));
  if (!md) throw new Error('Choose a Markdown (.md) file');
  const deck = await createDeck(await md.text());
  for (const img of all.filter(isImage)) await putImage(deck.id, img.name, img);
  return deck.id;
}

/** The result of looking in a folder: one file to open, several to choose from, or none. */
export async function openFolder(dir: FileSystemDirectoryHandle): Promise<
  { kind: 'one'; id: string } | { kind: 'choose'; files: FileSystemFileHandle[] } | { kind: 'none' }
> {
  const files = await listMarkdownFiles(dir);
  if (files.length === 0) return { kind: 'none' };
  if (files.length > 1) return { kind: 'choose', files };
  return { kind: 'one', id: await importFromFolder(dir, files[0]!) };
}

/** Makes a deck from one `.md` file in a folder, linked to the file and the folder. */
export async function importFromFolder(dir: FileSystemDirectoryHandle, file: FileSystemFileHandle): Promise<string> {
  const { text, modified } = await readFile(file);
  return createLinked(text, modified, { file, folder: dir });
}

/** Clears the link to disk. The deck stays. */
export async function unlinkDeck(id: string): Promise<void> {
  await updateDeckMeta(id, {
    file: undefined,
    folder: undefined,
    lastSyncedSource: undefined,
    lastSyncedModified: undefined,
  });
}

type ItemWithHandle = DataTransferItem & { getAsFileSystemHandle?: () => Promise<FileSystemHandle | null> };

/**
 * Reads what was dropped. Must be called synchronously inside the drop event, because the browser
 * empties the data afterwards. A lone `.md` file comes back as a handle when the browser can give
 * one, so the deck can be linked.
 */
export function readDrop(dt: DataTransfer): Promise<File[] | FileSystemHandle[]> {
  const files = [...dt.files];
  const only = [...dt.items].filter((i) => i.kind === 'file');
  const handlePromise =
    files.length === 1 && isMarkdown(files[0]!.name) && only.length === 1
      ? (only[0] as ItemWithHandle).getAsFileSystemHandle?.()
      : undefined;
  return (async () => {
    try {
      const handle = await handlePromise;
      if (handle && handle.kind === 'file') return [handle];
    } catch {
      // Fall back to the File object.
    }
    return files;
  })();
}
