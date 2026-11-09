import { useCallback, useState } from 'react';

export type Notice = { id: number; text: string };

let nextId = 1;

/** Holds the list of transient messages. `notify` adds one; it goes away on its own or when dismissed. */
export function useNotices(): { notices: Notice[]; notify(text: string): void; dismiss(id: number): void } {
  const [notices, setNotices] = useState<Notice[]>([]);
  const dismiss = useCallback((id: number) => setNotices((n) => n.filter((x) => x.id !== id)), []);
  const notify = useCallback(
    (text: string) => {
      const id = nextId++;
      setNotices((n) => [...n, { id, text }]);
      setTimeout(() => dismiss(id), 8000);
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
          <span>{n.text}</span>
          <button type="button" aria-label="Dismiss" onClick={() => onDismiss(n.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
