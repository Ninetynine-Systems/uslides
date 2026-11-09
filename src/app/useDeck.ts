import { useCallback, useEffect, useRef, useState } from 'react';
import { parseDeck, type Deck } from '../core/parse';
import { getDeck, getImages, saveDeck, type DeckRecord } from '../storage/db';

export const SAVE_DELAY_MS = 400;
export const PARSE_DELAY_MS = 150;
export const CONFLICT_NOTICE = 'This deck changed in another tab';

type Saved = { type: 'saved'; id: string; revision: number };

/** Everything the saver needs for one open deck. A new one is made each time the open deck changes. */
type Session = {
  id: string;
  revision: number;
  /** Text as last written to (or read from) storage. */
  saved: string;
  /** Text currently in the editor. */
  latest: string;
  timer?: ReturnType<typeof setTimeout>;
  /** The write that is running now, if any. */
  inflight?: Promise<void>;
  /** Set when the deck is being deleted: nothing more may be written. */
  discarded: boolean;
  /** The last write threw; stops the flush loop from retrying forever. */
  failed?: boolean;
};

type Options = {
  /** Shows a transient message. */
  onNotice(text: string): void;
  /** Called after the stored decks changed (here or in another tab), so the list can refresh. */
  onChanged(): void;
};

export type UseDeck = {
  record: DeckRecord | undefined;
  /** The editor text. */
  source: string;
  /** The parsed deck. Lags the text by a short delay while typing. */
  deck: Deck | undefined;
  warnings: Deck['warnings'];
  images: Map<string, Blob>;
  /** True after a save lost to a newer revision from another tab. */
  conflict: boolean;
  setSource(src: string): void;
  /** Writes any pending edit now. */
  flush(): Promise<void>;
  /** Drops any pending edit without saving it (used just before the deck is deleted). */
  discard(): void;
  /** Takes a record that was written elsewhere (for example by rename) as the current one. */
  adopt(record: DeckRecord): void;
  /** The text as last stored, and the text now in the editor, for the open deck. Undefined until the deck has loaded. */
  getSaved(): { id: string; source: string; latest: string } | undefined;
  /** Replaces the editor text with text that came from outside (a file on disk) and stores it. */
  applyExternal(text: string): Promise<void>;
  /** Updates fields of the current record that are not content (file links and sync fields). */
  patchRecord(id: string, patch: Partial<DeckRecord>): void;
};

export function useDeck(id: string | undefined, options: Options): UseDeck {
  const [record, setRecord] = useState<DeckRecord>();
  const [source, setSourceState] = useState('');
  const [deck, setDeck] = useState<Deck>();
  const [images, setImages] = useState<Map<string, Blob>>(new Map());
  const [conflict, setConflict] = useState(false);

  const session = useRef<Session | undefined>(undefined);
  const parseTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const channel = useRef<BroadcastChannel | undefined>(undefined);
  const opts = useRef(options);
  opts.current = options;

  /** Puts text into the editor and the preview at once (for loads, adopted records and conflicts). */
  const show = useCallback((rec: DeckRecord) => {
    clearTimeout(parseTimer.current);
    setRecord(rec);
    setSourceState(rec.source);
    setDeck(parseDeck(rec.source));
  }, []);

  /** Writes `s.latest` once. Never throws. */
  const saveOnce = useCallback(async (s: Session): Promise<void> => {
    const text = s.latest;
    try {
      const result = await saveDeck(s.id, text, s.revision);
      const open = session.current === s;
      if (result.ok) {
        s.revision = result.revision;
        s.saved = text;
        if (open) setRecord((r) => (r ? { ...r, source: text, revision: result.revision } : r));
        const message: Saved = { type: 'saved', id: s.id, revision: result.revision };
        channel.current?.postMessage(message);
      } else {
        s.revision = result.current.revision;
        s.saved = s.latest = result.current.source;
        if (open) show(result.current);
        if (open) setConflict(true);
        // Also when the user has already left this deck: their last edits were not kept.
        opts.current.onNotice(CONFLICT_NOTICE);
      }
      opts.current.onChanged();
    } catch (err) {
      if (!s.discarded) {
        opts.current.onNotice(`Could not save: ${err instanceof Error ? err.message : String(err)}`);
      }
      s.failed = true;
    }
  }, [show]);

  /** Resolves when everything typed so far is stored (or the save failed or the deck was discarded). */
  const flushSession = useCallback(async (s: Session): Promise<void> => {
    clearTimeout(s.timer);
    s.timer = undefined;
    s.failed = false;
    while (!s.discarded && !s.failed) {
      if (s.inflight) {
        await s.inflight;
        continue;
      }
      if (s.latest === s.saved) return;
      s.inflight = saveOnce(s).finally(() => {
        s.inflight = undefined;
      });
    }
  }, [saveOnce]);

  const flush = useCallback(async () => {
    if (session.current) await flushSession(session.current);
  }, [flushSession]);

  // Open a deck: load it, and write out any pending edit of the previous one when leaving.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const s: Session = { id, revision: 0, saved: '', latest: '', discarded: false };
    session.current = s;
    setConflict(false);
    void Promise.all([getDeck(id), getImages(id)]).then(([rec, imgs]) => {
      if (cancelled || !rec) return;
      s.revision = rec.revision;
      s.saved = s.latest = rec.source;
      show(rec);
      setImages(imgs);
    });
    return () => {
      cancelled = true;
      void flushSession(s);
      if (session.current === s) session.current = undefined;
    };
  }, [id, show, flushSession]);

  // Other tabs: refresh the list, and pick up a newer revision of the open deck if we have no unsaved edits.
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const ch = new BroadcastChannel('uslides');
    channel.current = ch;
    ch.onmessage = (e: MessageEvent<Saved>) => {
      const msg = e.data;
      if (msg?.type !== 'saved') return;
      opts.current.onChanged();
      const s = session.current;
      if (!s || s.id !== msg.id || msg.revision <= s.revision) return;
      const dirty = s.latest !== s.saved || s.inflight !== undefined || s.timer !== undefined;
      if (dirty) return; // our next save will meet the conflict path
      void getDeck(s.id).then((rec) => {
        if (!rec || session.current !== s || rec.revision <= s.revision) return;
        if (s.latest !== s.saved || s.inflight) return;
        s.revision = rec.revision;
        s.saved = s.latest = rec.source;
        show(rec);
      });
    };
    return () => {
      ch.close();
      channel.current = undefined;
    };
  }, [show]);

  // Closing the tab or switching away right after typing must not lose text.
  useEffect(() => {
    const onHide = () => void flush();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') onHide();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onHide);
    };
  }, [flush]);

  const setSource = useCallback(
    (src: string) => {
      const s = session.current;
      if (!s || s.revision === 0) return; // not loaded yet
      s.latest = src;
      setSourceState(src);
      clearTimeout(s.timer);
      s.timer = setTimeout(() => void flushSession(s), SAVE_DELAY_MS);
      clearTimeout(parseTimer.current);
      parseTimer.current = setTimeout(() => setDeck(parseDeck(src)), PARSE_DELAY_MS);
    },
    [flushSession],
  );

  const discard = useCallback(() => {
    const s = session.current;
    if (!s) return;
    s.discarded = true;
    clearTimeout(s.timer);
    s.timer = undefined;
    s.latest = s.saved;
  }, []);

  const adopt = useCallback(
    (rec: DeckRecord) => {
      const s = session.current;
      if (!s || s.id !== rec.id) return;
      s.revision = rec.revision;
      s.saved = s.latest = rec.source;
      show(rec);
      const message: Saved = { type: 'saved', id: rec.id, revision: rec.revision };
      channel.current?.postMessage(message);
    },
    [show],
  );

  const getSaved = useCallback(() => {
    const s = session.current;
    return s && s.revision > 0 ? { id: s.id, source: s.saved, latest: s.latest } : undefined;
  }, []);

  const applyExternal = useCallback(
    async (text: string) => {
      const s = session.current;
      if (!s || s.revision === 0) return;
      s.latest = text;
      setSourceState(text);
      clearTimeout(parseTimer.current);
      setDeck(parseDeck(text));
      await flushSession(s);
    },
    [flushSession],
  );

  const patchRecord = useCallback((rid: string, patch: Partial<DeckRecord>) => {
    setRecord((r) => (r && r.id === rid ? { ...r, ...patch } : r));
  }, []);

  useEffect(() => () => clearTimeout(parseTimer.current), []);

  return { record, source, deck, warnings: deck?.warnings ?? [], images, conflict, setSource, flush, discard, adopt, getSaved, applyExternal, patchRecord };
}
