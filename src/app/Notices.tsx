import { useCallback, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { IconButton } from './IconButton';

export type NoticeAction = { label: string; run(): void };
export type NoticeOptions = {
  /** A button shown in the notice. */
  action?: NoticeAction;
  /** Stays until the user dismisses it, instead of going away after a few seconds. */
  sticky?: boolean;
  /** Called when the user dismisses the notice (or its timer ends). */
  onDismiss?(): void;
};
export type Notice = { id: number; text: string } & NoticeOptions;

let nextId = 1;

/** Holds the list of transient messages. `notify` adds one; it goes away on its own or when dismissed. */
export function useNotices(): {
  notices: Notice[];
  notify(text: string, options?: NoticeOptions): number;
  dismiss(id: number): void;
} {
  const [notices, setNotices] = useState<Notice[]>([]);
  const dismissed = useRef(new Set<number>());
  const latest = useRef<Notice[]>([]);
  latest.current = notices;
  const dismiss = useCallback((id: number) => {
    if (dismissed.current.has(id)) return;
    dismissed.current.add(id);
    latest.current.find((x) => x.id === id)?.onDismiss?.();
    setNotices((n) => n.filter((x) => x.id !== id));
  }, []);
  const notify = useCallback(
    (text: string, options: NoticeOptions = {}) => {
      const id = nextId++;
      setNotices((n) => [...n, { id, text, ...options }]);
      if (!options.sticky) setTimeout(() => dismiss(id), 8000);
      return id;
    },
    [dismiss],
  );
  return { notices, notify, dismiss };
}

export function Notices({ notices, onDismiss }: { notices: Notice[]; onDismiss(id: number): void }) {
  return (
    <div className="notices" role="status" aria-live="polite">
      {notices.map((n) => (
        <div className="notice" key={n.id}>
          {n.text !== '' && <span>{n.text}</span>}
          {n.action && (
            <button type="button" className="notice-action" onClick={n.action.run}>
              {n.action.label}
            </button>
          )}
          <IconButton label="Dismiss" icon={X} onClick={() => onDismiss(n.id)} />
        </div>
      ))}
    </div>
  );
}
