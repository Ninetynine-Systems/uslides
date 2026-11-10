import type { ComponentPropsWithRef, ComponentType } from 'react';

export type IconProps = { size?: number; 'aria-hidden'?: boolean };

type Props = Omit<ComponentPropsWithRef<'button'>, 'children' | 'type'> & {
  /** What the button does. Screen readers read it, and it shows as a tooltip on hover and keyboard focus. */
  label: string;
  icon: ComponentType<IconProps>;
};

/** A button that shows only an icon. The label stays as its accessible name and tooltip. */
export function IconButton({ label, icon: Icon, className, ...rest }: Props) {
  return (
    <button
      type="button"
      aria-label={label}
      data-tip={label}
      className={className ? `icon-btn ${className}` : 'icon-btn'}
      {...rest}
    >
      <Icon size={18} aria-hidden />
    </button>
  );
}

/** A button that shows an icon and its label as text. */
export function LabelButton({ label, icon: Icon, className, ...rest }: Props) {
  return (
    <button
      type="button"
      aria-label={label}
      className={className ? `label-btn ${className}` : 'label-btn'}
      {...rest}
    >
      <Icon size={18} aria-hidden />
      <span>{label}</span>
    </button>
  );
}

/** An icon followed by text, for items inside a menu, where the text tells options apart. */
export function MenuItem({ label, icon: Icon, className, ...rest }: Props) {
  return (
    <button type="button" className={className ? `menu-item ${className}` : 'menu-item'} {...rest}>
      <Icon size={16} aria-hidden />
      <span>{label}</span>
    </button>
  );
}
