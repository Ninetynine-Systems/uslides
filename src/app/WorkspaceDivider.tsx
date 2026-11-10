import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';

const DIVIDER_WIDTH = 8;
const MIN_PANE_WIDTH = 280;

type Props = {
  fraction: number;
  workspace: RefObject<HTMLElement | null>;
  onChange(fraction: number): void;
  onCommit(fraction: number): void;
};

function fractionLimits(width: number): { min: number; max: number } {
  const available = Math.max(0, width - DIVIDER_WIDTH);
  if (available <= MIN_PANE_WIDTH * 2) return { min: 0.5, max: 0.5 };
  const min = MIN_PANE_WIDTH / available;
  return { min, max: 1 - min };
}

function clampFraction(fraction: number, width: number): number {
  const { min, max } = fractionLimits(width);
  return Math.min(max, Math.max(min, fraction));
}

/** Mouse, touch, and keyboard control for the editor/preview split. */
export function WorkspaceDivider({ fraction, workspace, onChange, onCommit }: Props) {
  const handle = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [dragging, setDragging] = useState(false);
  const pointer = useRef<number | undefined>(undefined);
  const latest = useRef(fraction);
  latest.current = fraction;

  useLayoutEffect(() => {
    const element = handle.current?.parentElement;
    if (!element) return;
    const measure = () => setWidth(element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => () => document.body.classList.remove('us-resizing-workspace'), []);

  const update = (next: number, measuredWidth = workspace.current?.clientWidth ?? width) => {
    const clamped = clampFraction(next, measuredWidth);
    latest.current = clamped;
    onChange(clamped);
    return clamped;
  };
  const updateFromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = workspace.current?.getBoundingClientRect();
    if (!rect) return;
    const available = Math.max(1, rect.width - DIVIDER_WIDTH);
    update((event.clientX - rect.left - DIVIDER_WIDTH / 2) / available, rect.width);
  };
  const finishDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointer.current !== event.pointerId) return;
    pointer.current = undefined;
    setDragging(false);
    document.body.classList.remove('us-resizing-workspace');
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    onCommit(latest.current);
  };
  const setAndCommit = (next: number) => {
    const clamped = update(next);
    onCommit(clamped);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const currentWidth = workspace.current?.clientWidth ?? width;
    const { min, max } = fractionLimits(currentWidth);
    const current = clampFraction(latest.current, currentWidth);
    let next: number | undefined;
    if (event.key === 'ArrowLeft') next = current - (event.shiftKey ? 0.1 : 0.02);
    else if (event.key === 'ArrowRight') next = current + (event.shiftKey ? 0.1 : 0.02);
    else if (event.key === 'Home') next = min;
    else if (event.key === 'End') next = max;
    else if (event.key === 'Enter') next = 0.5;
    if (next === undefined) return;
    event.preventDefault();
    setAndCommit(next);
  };

  const currentWidth = workspace.current?.clientWidth ?? width;
  const limits = fractionLimits(currentWidth);
  const value = clampFraction(fraction, currentWidth);
  return (
    <div
      ref={handle}
      className={dragging ? 'workspace-divider dragging' : 'workspace-divider'}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize editor"
      aria-valuenow={Math.round(value * 100)}
      aria-valuemin={Math.round(limits.min * 100)}
      aria-valuemax={Math.round(limits.max * 100)}
      tabIndex={0}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        pointer.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragging(true);
        document.body.classList.add('us-resizing-workspace');
        updateFromPointer(event);
      }}
      onPointerMove={(event) => {
        if (pointer.current !== event.pointerId) return;
        event.preventDefault();
        updateFromPointer(event);
      }}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      onLostPointerCapture={finishDrag}
      onDoubleClick={() => setAndCommit(0.5)}
      onKeyDown={onKeyDown}
    />
  );
}
