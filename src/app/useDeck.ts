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
  saving: boolean;
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

  const flushSession = useCallback(async (s: Session): Promise<void> => {
    clearTimeout(s.timer);
    s.timer = undefined;
    if (s.saving || s.latest === s.saved) return;
    s.saving = true;
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
        if (open) {
          show(result.current);
          setConflict(true);
          opts.current.onNotice(CONFLICT_NOTICE);
        }
      }
      opts.current.onChanged();
    } catch (err) {
      opts.current.onNotice(`Could not save: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      s.saving = false;
    }
    // More typing happened while the write was in flight.
    if (s.latest !== s.saved) void flushSession(s);
  }, [show]);

  const flush = useCallback(async () => {
    if (session.current) await flushSession(session.current);
  }, [flushSession]);

  // Open a deck: load it, and write out any pending edit of the previous one when leaving.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const s: Session = { id, revision: 0, saved: '', latest: '', saving: false };
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
      const dirty = s.latest !== s.saved || s.saving || s.timer !== undefined;
      if (dirty) return; // our next save will meet the conflict path
      void getDeck(s.id).then((rec) => {
        if (!rec || session.current !== s || rec.revision <= s.revision) return;
        if (s.latest !== s.saved || s.saving) return;
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

  useEffect(() => () => clearTimeout(parseTimer.current), []);

  return { record, source, deck, warnings: deck?.warnings ?? [], images, conflict, setSource, flush, discard, adopt };
}
