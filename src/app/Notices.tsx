import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { IconButton } from './IconButton';

export type NoticeAction = { label: string; run(): void };
export type NoticeOptions = {
  /** A button shown in the notice. */
  action?: NoticeAction;
  /** Moves focus to the action when the notice appears. */
  focusAction?: boolean;
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
      return id;
    },
    [dismiss],
  );
  return { notices, notify, dismiss };
}

function NoticeItem({ notice, onDismiss }: { notice: Notice; onDismiss(id: number): void }) {
  const container = useRef<HTMLDivElement>(null);
  const action = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const focused = useRef(false);
  const hovered = useRef(false);

  const stopTimer = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
  }, []);
  const startTimer = useCallback(() => {
    stopTimer();
    if (!notice.sticky && !focused.current && !hovered.current) {
      timer.current = setTimeout(() => onDismiss(notice.id), 8000);
    }
  }, [notice.id, notice.sticky, onDismiss, stopTimer]);

  useEffect(() => {
    startTimer();
    return stopTimer;
  }, [startTimer, stopTimer]);
  useEffect(() => {
    if (notice.focusAction) action.current?.focus();
  }, [notice.focusAction]);

  return (
    <div
      ref={container}
      className="notice"
      onFocus={() => {
        focused.current = true;
        stopTimer();
      }}
      onBlur={(event) => {
        if (event.relatedTarget instanceof Node && container.current?.contains(event.relatedTarget)) return;
        focused.current = false;
        startTimer();
      }}
      onPointerEnter={() => {
        hovered.current = true;
        stopTimer();
      }}
      onPointerLeave={() => {
        hovered.current = false;
        startTimer();
      }}
    >
      {notice.text !== '' && <span>{notice.text}</span>}
      {notice.action && (
        <button ref={action} type="button" className="notice-action" onClick={notice.action.run}>
          {notice.action.label}
        </button>
      )}
      <IconButton label="Dismiss" icon={X} onClick={() => onDismiss(notice.id)} />
    </div>
  );
}

export function Notices({ notices, onDismiss }: { notices: Notice[]; onDismiss(id: number): void }) {
  return (
    <div className="notices" role="status" aria-live="polite">
      {notices.map((n) => (
        <NoticeItem key={n.id} notice={n} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
