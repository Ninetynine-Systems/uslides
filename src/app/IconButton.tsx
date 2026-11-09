import type { ButtonHTMLAttributes, ComponentType } from 'react';

type IconProps = { size?: number; 'aria-hidden'?: boolean };

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'type'> & {
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

/** An icon followed by text, for items inside a menu, where the text tells options apart. */
export function MenuItem({ label, icon: Icon, ...rest }: Props) {
  return (
    <button type="button" className="menu-item" {...rest}>
      <Icon size={16} aria-hidden />
      <span>{label}</span>
    </button>
  );
}
