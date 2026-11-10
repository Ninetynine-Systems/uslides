import { useRef, type ComponentType, type ReactNode } from 'react';
import { IconButton, type IconProps } from './IconButton';
import { usePopup, usePopupDismiss } from './usePopup';

type Props = {
  label: string;
  icon: ComponentType<IconProps>;
  children: (close: () => void) => ReactNode;
};

/** An icon button with a popup menu. */
export function Menu({ label, icon, children }: Props) {
  const popup = usePopup();
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  usePopupDismiss(popup.open, popup.close, [container], trigger);

  return (
    <div ref={container} className="share">
      <IconButton
        ref={trigger}
        label={label}
        icon={icon}
        aria-haspopup="true"
        aria-expanded={popup.open}
        onClick={popup.toggle}
      />
      {popup.open && <div className="share-menu">{children(popup.close)}</div>}
    </div>
  );
}
