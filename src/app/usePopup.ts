import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useSyncExternalStore,
  type RefObject,
} from 'react';

let activePopup: string | undefined;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setActivePopup(next: string | undefined): void {
  if (activePopup === next) return;
  activePopup = next;
  listeners.forEach((listener) => listener());
}

/** One member of the app-wide popup group. Opening it closes the current member. */
export function usePopup() {
  const id = useId();
  const open = useSyncExternalStore(subscribe, () => activePopup === id, () => false);
  const close = useCallback(() => {
    if (activePopup === id) setActivePopup(undefined);
  }, [id]);
  const toggle = useCallback(() => {
    setActivePopup(activePopup === id ? undefined : id);
  }, [id]);

  useEffect(() => close, [close]);
  return { open, close, toggle };
}

/** Closes an open popup on Escape or a pointer press outside its panel and trigger. */
export function usePopupDismiss(
  open: boolean,
  close: () => void,
  inside: readonly RefObject<HTMLElement | null>[],
  trigger?: RefObject<HTMLElement | null>,
): void {
  const insideRef = useRef(inside);
  insideRef.current = inside;
  const closeRef = useRef(close);
  closeRef.current = close;
  const triggerRef = useRef(trigger);
  triggerRef.current = trigger;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && insideRef.current.every((ref) => !ref.current?.contains(target))) {
        closeRef.current();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      closeRef.current();
      triggerRef.current?.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open]);
}
