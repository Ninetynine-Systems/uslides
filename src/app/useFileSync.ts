import { useCallback, useEffect, useRef, useState } from 'react';
import {
  decideSync, forgetLink, hasAccess, linkOf, readFile, requestAccess, watchFile, writeFile,
} from '../files/fileLink';
import { unlinkDeck } from '../files/importFiles';
import { updateDeckMeta } from '../storage/db';
import type { UseDeck } from './useDeck';

export const READ_ONLY_NOTICE = 'Edits stay in the app; allow writing to save them to the file';
export const FILE_GONE_NOTICE = "Can't read the linked file. It may have been moved or deleted.";

export type FileConflict = { text: string; modified: number };

export type FileSync = {
  /** The linked file's name and whether a folder is linked too. Undefined when the deck is not linked. */
  link: { name: string; folder: boolean } | undefined;
  /** True when the browser has not given access to the file or folder (after a reload, for example). */
  needsAccess: boolean;
  /** True when we can read the file but may not write it. Edits then stay in the app. */
  readOnly: boolean;
  /** Increases each time text from the file replaced the editor text. */
  version: number;
  /** Set while the "which version to keep" dialog is open. The watch pauses meanwhile. */
  conflict: FileConflict | undefined;
  /** Asks the browser for read and write access. Call it only from a click. */
  grant(): Promise<void>;
  resolve(choice: 'file' | 'mine'): Promise<void>;
  unlink(): Promise<void>;
  /** Folder handle (when linked) and whether we may read from it right now. */
  folder: FileSystemDirectoryHandle | undefined;
};

/**
 * Keeps the open deck and its linked file in step. Once a second it reads the file and asks
 * `decideSync` what to do. It stops when the deck closes, is unlinked, or the tab is hidden.
 */
export function useFileSync(deck: UseDeck, notify: (text: string) => void): FileSync {
  const { record } = deck;
  const id = record?.id;
  const { file, folder } = linkOf(record);
  const fileName = file?.name;

  const [needsAccess, setNeedsAccess] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const [version, setVersion] = useState(0);
  const [conflict, setConflict] = useState<FileConflict>();
  const [visible, setVisible] = useState(() => document.visibilityState !== 'hidden');

  const deckRef = useRef(deck);
  deckRef.current = deck;
  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  const recordRef = useRef(record);
  recordRef.current = record;

  const paused = useRef(false);
  const readOnlyShown = useRef(false);

  /** Switches to read-only mode: edits stay in the app. Tells the user once per linked deck. */
  const markReadOnly = useCallback(() => {
    if (readOnlyShown.current) return;
    readOnlyShown.current = true;
    setReadOnly(true);
    notifyRef.current(READ_ONLY_NOTICE);
  }, []);
  const last = useRef<{ source?: string; modified?: number }>({});
  const ctx = useRef<{ id: string; file: FileSystemFileHandle } | undefined>(undefined);

  useEffect(() => {
    const on = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);

  /** Remembers what the app and the file both looked like just now. */
  const markSynced = useCallback((deckId: string, source: string, modified: number) => {
    last.current = { source, modified };
    deckRef.current.patchRecord(deckId, { lastSyncedSource: source, lastSyncedModified: modified });
    updateDeckMeta(deckId, { lastSyncedSource: source, lastSyncedModified: modified }).catch(() => {
      // The deck was deleted while we were syncing.
    });
  }, []);

  const unlinkNow = useCallback(async (deckId: string) => {
    forgetLink(deckId);
    await unlinkDeck(deckId).catch(() => {});
    deckRef.current.patchRecord(deckId, {
      file: undefined, folder: undefined, lastSyncedSource: undefined, lastSyncedModified: undefined,
    });
  }, []);

  useEffect(() => {
    setNeedsAccess(false);
    setReadOnly(false);
    readOnlyShown.current = false;
    setConflict(undefined);
    paused.current = false;
    if (!id || !file || !visible) {
      ctx.current = undefined;
      return;
    }
    let alive = true;
    const rec = recordRef.current;
    last.current = { source: rec?.lastSyncedSource, modified: rec?.lastSyncedModified };
    ctx.current = { id, file };
    let writeFailed = false;

    const onFile = async (text: string, modified: number) => {
      if (!alive || paused.current) return;
      const saved = deckRef.current.getSaved();
      if (!saved || saved.id !== id) return;
      // Judge by the text in the editor, but write the file only once the autosave has stored it.
      const decision = decideSync({
        appSource: saved.latest,
        fileSource: text,
        fileModified: modified,
        lastSyncedSource: last.current.source,
        lastSyncedModified: last.current.modified,
      });
      if (decision === 'none') {
        // Both sides already agree: remember that, so a later change is judged from here.
        if (saved.latest === text && last.current.source !== text) markSynced(id, text, modified);
      } else if (decision === 'take-file') {
        await deckRef.current.applyExternal(text);
        if (!alive) return;
        markSynced(id, text, modified);
        setVersion((v) => v + 1);
      } else if (decision === 'write-file') {
        if (saved.latest !== saved.source) return; // not stored yet: the next poll will try again
        try {
          if (!(await hasAccess(file, 'readwrite')) || (folder && !(await hasAccess(folder, 'readwrite')))) {
            markReadOnly();
            return;
          }
          // The file may have been changed by someone else since this poll read it. Do not overwrite that.
          const again = await readFile(file);
          if (again.text !== text || again.modified !== modified) return;
          const written = await writeFile(file, saved.source);
          writeFailed = false;
          // Record the text we wrote and the time the file now has, so the next poll sees no change.
          if (alive) markSynced(id, saved.source, written);
        } catch (err) {
          if (!writeFailed) {
            notifyRef.current(`Could not write the file: ${err instanceof Error ? err.message : String(err)}`);
          }
          writeFailed = true;
        }
      } else {
        paused.current = true;
        setConflict({ text, modified });
      }
    };

    const stop = watchFile(file, onFile, {
      canRead: async () => {
        const ok = (await hasAccess(file)) && (!folder || (await hasAccess(folder)));
        const canWrite = ok && (await hasAccess(file, 'readwrite')) && (!folder || (await hasAccess(folder, 'readwrite')));
        if (alive) {
          setNeedsAccess(!ok);
          if (canWrite) {
            setReadOnly(false);
            readOnlyShown.current = false;
          }
          else if (ok) markReadOnly();
        }
        return ok;
      },
      onError: () => {
        if (!alive) return;
        notifyRef.current(FILE_GONE_NOTICE);
        void unlinkNow(id);
      },
    });
    return () => {
      alive = false;
      stop();
    };
    // `file` and `folder` are identified by the deck id and whether they exist; the handles themselves do not change.
  }, [id, !!file, visible, markSynced, unlinkNow]);

  const grant = useCallback(async () => {
    if (!file) return;
    await Promise.all([requestAccess(file), folder ? requestAccess(folder) : Promise.resolve(true)]);
    const read = (await hasAccess(file)) && (!folder || (await hasAccess(folder)));
    setNeedsAccess(!read);
    if (read && (await hasAccess(file, 'readwrite')) && (!folder || (await hasAccess(folder, 'readwrite')))) setReadOnly(false);
  }, [file, folder]);

  const resolve = useCallback(
    async (choice: 'file' | 'mine') => {
      const c = ctx.current;
      const pending = conflict;
      if (!c || !pending) return;
      if (deckRef.current.getSaved()?.id !== c.id) return;
      if (choice === 'file') {
        await deckRef.current.applyExternal(pending.text);
        markSynced(c.id, pending.text, pending.modified);
        setVersion((v) => v + 1);
      } else {
        // This runs from a click, so the browser may ask for write access now.
        const canWrite = (await requestAccess(c.file)) && (!folder || (await requestAccess(folder)));
        await deckRef.current.flush();
        const saved = deckRef.current.getSaved();
        if (saved?.id !== c.id) return; // the user moved to another deck meanwhile
        if (canWrite) {
          markSynced(c.id, saved.source, await writeFile(c.file, saved.source));
          setReadOnly(false);
          readOnlyShown.current = false;
        } else {
          // Keep the app's text and leave the file alone. Remember the file as it is now, so this
          // same conflict does not open again; the app stays read-only until writing is allowed.
          markSynced(c.id, pending.text, pending.modified);
          markReadOnly();
        }
      }
      setConflict(undefined);
      paused.current = false;
    },
    [conflict, markSynced, markReadOnly, folder],
  );

  const unlink = useCallback(async () => {
    if (id) await unlinkNow(id);
  }, [id, unlinkNow]);

  return {
    link: file ? { name: fileName ?? 'file', folder: !!folder } : undefined,
    needsAccess,
    readOnly,
    version,
    conflict,
    grant,
    resolve,
    unlink,
    folder,
  };
}
