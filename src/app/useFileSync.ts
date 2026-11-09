import { useCallback, useEffect, useRef, useState } from 'react';
import {
  decideSync, forgetLink, hasAccess, linkOf, requestAccess, watchFile, writeFile,
} from '../files/fileLink';
import { unlinkDeck } from '../files/importFiles';
import { updateDeckMeta } from '../storage/db';
import type { UseDeck } from './useDeck';

export const FILE_GONE_NOTICE = "Can't read the linked file. It may have been moved or deleted.";

export type FileConflict = { text: string; modified: number };

export type FileSync = {
  /** The linked file's name and whether a folder is linked too. Undefined when the deck is not linked. */
  link: { name: string; folder: boolean } | undefined;
  /** True when the browser has not given access to the file or folder (after a reload, for example). */
  needsAccess: boolean;
  /** Increases each time text from the file replaced the editor text. */
  version: number;
  /** Set while the "which version to keep" dialog is open. The watch pauses meanwhile. */
  conflict: FileConflict | undefined;
  /** Asks the browser for access again. Call it only from a click. */
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
      await deckRef.current.flush(); // edits typed a moment ago must be stored before we compare
      const saved = deckRef.current.getSaved();
      if (!alive || paused.current || !saved || saved.id !== id) return;
      const decision = decideSync({
        appSource: saved.source,
        fileSource: text,
        fileModified: modified,
        lastSyncedSource: last.current.source,
        lastSyncedModified: last.current.modified,
      });
      if (decision === 'none') {
        // Both sides already agree: remember that, so a later change is judged from here.
        if (saved.source === text && last.current.source !== text) markSynced(id, text, modified);
      } else if (decision === 'take-file') {
        await deckRef.current.applyExternal(text);
        if (!alive) return;
        markSynced(id, text, modified);
        setVersion((v) => v + 1);
      } else if (decision === 'write-file') {
        try {
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
        if (alive) setNeedsAccess(!ok);
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
    setNeedsAccess(!((await hasAccess(file)) && (!folder || (await hasAccess(folder)))));
  }, [file, folder]);

  const resolve = useCallback(
    async (choice: 'file' | 'mine') => {
      const c = ctx.current;
      const pending = conflict;
      if (!c || !pending) return;
      if (choice === 'file') {
        await deckRef.current.applyExternal(pending.text);
        markSynced(c.id, pending.text, pending.modified);
        setVersion((v) => v + 1);
      } else {
        await deckRef.current.flush();
        const mine = deckRef.current.getSaved()?.source;
        if (mine !== undefined) markSynced(c.id, mine, await writeFile(c.file, mine));
      }
      setConflict(undefined);
      paused.current = false;
    },
    [conflict, markSynced],
  );

  const unlink = useCallback(async () => {
    if (id) await unlinkNow(id);
  }, [id, unlinkNow]);

  return {
    link: file ? { name: fileName ?? 'file', folder: !!folder } : undefined,
    needsAccess,
    version,
    conflict,
    grant,
    resolve,
    unlink,
    folder,
  };
}
