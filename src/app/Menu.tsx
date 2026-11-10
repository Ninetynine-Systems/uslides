import { useEffect, useRef, useState, type ComponentType, type ReactNode, type RefObject } from 'react';
import { IconButton, type IconProps } from './IconButton';

type Props = {
  label: string;
  icon: ComponentType<IconProps>;
  children: (close: () => void) => ReactNode;
};

/** Closes a popup when a pointer press starts outside its container. */
export function useOutsidePress(container: RefObject<HTMLElement | null>, open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !container.current?.contains(target)) close();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [close, container, open]);
}

/** An icon button with a popup menu. */
export function Menu({ label, icon, children }: Props) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const close = () => setOpen(false);
  useOutsidePress(container, open, close);

  return (
    <div
      ref={container}
      className="share"
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        close();
        container.current?.querySelector('button')?.focus();
      }}
    >
      <IconButton
        label={label}
        icon={icon}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      />
      {open && <div className="share-menu">{children(close)}</div>}
    </div>
  );
}
