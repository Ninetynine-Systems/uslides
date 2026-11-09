// Links between a deck and a file or folder on disk, using the File System Access API (Chrome, Edge).
// No React in this file.
import type { DeckRecord } from '../storage/db';

export const WATCH_MS = 1000;

export type SyncDecision = 'none' | 'take-file' | 'write-file' | 'conflict';

/** The parts of the File System Access API that TypeScript's DOM types do not include yet. */
export type PermissionMode = { mode: 'read' | 'readwrite' };
export type Permissioned = {
  queryPermission(mode: PermissionMode): Promise<PermissionState | 'prompt'>;
  requestPermission(mode: PermissionMode): Promise<PermissionState | 'prompt'>;
};
type WritableHandle = FileSystemFileHandle & {
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
};
type IterableDir = FileSystemDirectoryHandle & { values(): AsyncIterable<FileSystemHandle> };

export function supportsFileLink(): boolean {
  return 'showOpenFilePicker' in window;
}

export function supportsFolderLink(): boolean {
  return 'showDirectoryPicker' in window;
}

/**
 * Says what to do with the file and the app text, given what both looked like at the last sync.
 * The text decides, not the modified time: a file that was only touched has not changed.
 * With no earlier sync, the file is the source of truth.
 */
export function decideSync(s: {
  appSource: string;
  fileSource: string;
  fileModified: number;
  lastSyncedSource?: string;
  lastSyncedModified?: number;
}): SyncDecision {
  if (s.lastSyncedSource === undefined) return s.appSource === s.fileSource ? 'none' : 'take-file';
  const fileChanged = s.fileSource !== s.lastSyncedSource;
  const appChanged = s.appSource !== s.lastSyncedSource;
  if (fileChanged && appChanged) return s.fileSource === s.appSource ? 'none' : 'conflict';
  if (fileChanged) return 'take-file';
  if (appChanged) return 'write-file';
  return 'none';
}

export async function readFile(handle: FileSystemFileHandle): Promise<{ text: string; modified: number }> {
  const file = await handle.getFile();
  return { text: await file.text(), modified: file.lastModified };
}

/** Writes the text to the file. Returns the file's new modified time, so the caller can record it. */
export async function writeFile(handle: FileSystemFileHandle, text: string): Promise<number> {
  const writable = await (handle as WritableHandle).createWritable();
  await writable.write(text);
  await writable.close();
  return (await handle.getFile()).lastModified;
}

/** True when the browser lets us read (or read and write) this handle right now. Never asks the user. */
export async function hasAccess(handle: unknown, mode: PermissionMode['mode'] = 'read'): Promise<boolean> {
  const h = handle as Partial<Permissioned> | undefined;
  if (!h?.queryPermission) return true;
  try {
    return (await h.queryPermission({ mode })) === 'granted';
  } catch {
    return false;
  }
}

/** Asks the user for read and write access. The browser only allows this inside a click or drop. */
export async function requestAccess(handle: unknown): Promise<boolean> {
  const h = handle as Partial<Permissioned> | undefined;
  if (!h?.requestPermission) return true;
  try {
    return (await h.requestPermission({ mode: 'readwrite' })) === 'granted';
  } catch {
    return false;
  }
}

type WatchOptions = {
  /** Called when a read fails for good: the file is gone, or reads kept failing. The watch stops. */
  onError?(err: unknown): void;
  /** Return false to skip this poll (for example, no permission yet). */
  canRead?(): Promise<boolean>;
};

/**
 * Reads the file now and then every WATCH_MS, and calls `onChange` with its text and modified time
 * each time (the caller decides whether anything changed). The next poll waits for `onChange` to
 * finish. Returns a function that stops watching.
 */
export function watchFile(
  handle: FileSystemFileHandle,
  onChange: (text: string, modified: number) => void | Promise<void>,
  options: WatchOptions = {},
): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let failures = 0;

  const poll = async () => {
    try {
      if (!options.canRead || (await options.canRead())) {
        const { text, modified } = await readFile(handle);
        failures = 0;
        if (!stopped) await onChange(text, modified);
      }
    } catch (err) {
      // A file that is rewritten while we read it can fail once; a missing file will not come back.
      failures += 1;
      if (!stopped && ((err as DOMException)?.name === 'NotFoundError' || failures >= 3)) {
        stopped = true;
        options.onError?.(err);
      }
    }
    if (!stopped) timer = setTimeout(() => void poll(), WATCH_MS);
  };
  void poll();

  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}

/** The `.md` files directly inside a folder, sorted by name. */
export async function listMarkdownFiles(dir: FileSystemDirectoryHandle): Promise<FileSystemFileHandle[]> {
  const found: FileSystemFileHandle[] = [];
  for await (const entry of (dir as IterableDir).values()) {
    if (entry.kind === 'file' && /\.(md|markdown)$/i.test(entry.name)) found.push(entry as FileSystemFileHandle);
  }
  return found.sort((a, b) => a.name.localeCompare(b.name));
}

/** Reads an image from a folder by a relative path such as `img/chart.png`. Undefined if it is not there. */
export async function readFolderImage(dir: FileSystemDirectoryHandle, path: string): Promise<Blob | undefined> {
  try {
    const parts = path.split('/').filter((p) => p !== '' && p !== '.');
    const name = parts.pop();
    if (!name || parts.includes('..')) return undefined;
    let current = dir;
    for (const part of parts) current = await current.getDirectoryHandle(part);
    return await (await current.getFileHandle(name)).getFile();
  } catch {
    return undefined;
  }
}

// Handles that IndexedDB refused to store (it should not, but a browser may) stay linked for this session only.
const memoryLinks = new Map<string, { file?: FileSystemFileHandle; folder?: FileSystemDirectoryHandle }>();

export function rememberLink(deckId: string, link: { file?: FileSystemFileHandle; folder?: FileSystemDirectoryHandle }): void {
  memoryLinks.set(deckId, link);
}

export function forgetLink(deckId: string): void {
  memoryLinks.delete(deckId);
}

/** The file and folder linked to a deck: from storage, else from this session's memory. */
export function linkOf(record: Pick<DeckRecord, 'id' | 'file' | 'folder'> | undefined): {
  file?: FileSystemFileHandle;
  folder?: FileSystemDirectoryHandle;
} {
  if (!record) return {};
  const mem = memoryLinks.get(record.id);
  return { file: record.file ?? mem?.file, folder: record.folder ?? mem?.folder };
}

type Pickers = {
  showOpenFilePicker(options?: object): Promise<FileSystemFileHandle[]>;
  showDirectoryPicker(options?: object): Promise<FileSystemDirectoryHandle>;
};

const isAbort = (err: unknown) => (err as DOMException)?.name === 'AbortError';

/** Shows the browser's file picker. Undefined if the user cancelled. */
export async function pickMarkdownFile(): Promise<FileSystemFileHandle | undefined> {
  try {
    const [handle] = await (window as unknown as Pickers).showOpenFilePicker({
      multiple: false,
      types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md', '.markdown'] } }],
    });
    return handle;
  } catch (err) {
    if (isAbort(err)) return undefined;
    throw err;
  }
}

/** Shows the browser's folder picker. Undefined if the user cancelled. */
export async function pickFolder(): Promise<FileSystemDirectoryHandle | undefined> {
  try {
    return await (window as unknown as Pickers).showDirectoryPicker({ mode: 'readwrite' });
  } catch (err) {
    if (isAbort(err)) return undefined;
    throw err;
  }
}
