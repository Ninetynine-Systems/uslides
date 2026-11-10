import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  AlignCenter,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  AlignLeft,
  AlignRight,
  AlignStartHorizontal,
  Baseline,
  BringToFront,
  Copy,
  PaintBucket,
  SendToBack,
  Trash2,
} from 'lucide-react';
import type { Box } from '../../core/slide';
import { IconButton } from '../IconButton';

type Theme = 'light' | 'dark';
type ColourKind = 'fill' | 'text';

const PALE = ['#dbeafe', '#dcfce7', '#fef3c7', '#fee2e2', '#f3e8ff', '#f1f5f9'];
const DARK = ['#1e3a8a', '#14532d', '#713f12', '#7f1d1d', '#581c87', '#1e293b'];

function palette(theme: Theme, kind: ColourKind): string[] {
  return (theme === 'light') === (kind === 'fill') ? PALE : DARK;
}

function ColourControl(props: {
  kind: ColourKind;
  theme: Theme;
  open: boolean;
  onOpen(): void;
  onSet(value: string | null): void;
}) {
  const { kind, theme, open, onOpen, onSet } = props;
  const fill = kind === 'fill';
  const label = fill ? 'Fill colour' : 'Text colour';
  const custom = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const input = custom.current;
    if (!input || !open) return;
    const changed = () => onSet(input.value.toLowerCase());
    input.addEventListener('change', changed);
    return () => input.removeEventListener('change', changed);
  }, [onSet, open]);
  return (
    <div className="us-colour-control">
      <IconButton
        label={label}
        icon={fill ? PaintBucket : Baseline}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={onOpen}
      />
      {open && (
        <div className="us-colour-menu" role="menu" aria-label={label}>
          <div className="us-colour-swatches">
            {palette(theme, kind).map((colour) => (
              <button
                key={colour}
                type="button"
                className="us-colour-swatch"
                aria-label={colour}
                title={colour}
                style={{ backgroundColor: colour }}
                onClick={() => onSet(colour)}
              />
            ))}
          </div>
          <button type="button" className="us-colour-none" onClick={() => onSet(null)}>None</button>
          <label className="us-custom-colour">
            Custom
            <input
              ref={custom}
              type="color"
              aria-label={`Custom ${label.toLowerCase()}`}
            />
          </label>
        </div>
      )}
    </div>
  );
}

export type FloatingBarProps = {
  box: Box;
  theme: Theme;
  anchor: DOMRect;
  bounds: DOMRect;
  onSet(attrs: Record<string, string | null>): void;
  onFront(): void;
  onBack(): void;
  onDuplicate(): void;
  onDelete(): void;
  fontSlot?: ReactNode;
};

export function FloatingBar({
  box,
  theme,
  anchor,
  bounds,
  onSet,
  onFront,
  onBack,
  onDuplicate,
  onDelete,
  fontSlot,
}: FloatingBarProps) {
  const [openColour, setOpenColour] = useState<ColourKind | null>(null);
  const bar = useRef<HTMLDivElement>(null);
  const [barSize, setBarSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const element = bar.current;
    if (!element) return;
    const measure = () => {
      const next = { width: element.offsetWidth, height: element.offsetHeight };
      setBarSize((current) => (current.width === next.width && current.height === next.height ? current : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const roomAbove = anchor.top - bounds.top;
  const above = roomAbove >= barSize.height + 6;
  const centre = anchor.left + anchor.width / 2 - bounds.left;
  const left = Math.min(
    Math.max(centre - barSize.width / 2, 4),
    Math.max(4, bounds.width - barSize.width - 4),
  );
  const style: CSSProperties = {
    left,
    top: above ? anchor.top - bounds.top - 6 : anchor.bottom - bounds.top + 6,
    transform: above ? 'translateY(-100%)' : undefined,
  };
  const choose = (kind: ColourKind, value: string | null) => {
    onSet({ [kind === 'fill' ? 'bg' : 'color']: value });
    setOpenColour(null);
  };

  return (
    <div ref={bar} className="us-floating-bar" style={style} data-placement={above ? 'above' : 'below'}>
      <ColourControl
        kind="fill"
        theme={theme}
        open={openColour === 'fill'}
        onOpen={() => setOpenColour((open) => (open === 'fill' ? null : 'fill'))}
        onSet={(value) => choose('fill', value)}
      />
      <ColourControl
        kind="text"
        theme={theme}
        open={openColour === 'text'}
        onOpen={() => setOpenColour((open) => (open === 'text' ? null : 'text'))}
        onSet={(value) => choose('text', value)}
      />
      {fontSlot}
      <div className="us-bar-group" role="group" aria-label="Horizontal alignment">
        <IconButton label="Left" icon={AlignLeft} aria-pressed={box.align === 'left'} onClick={() => onSet({ align: null })} />
        <IconButton label="Centre" icon={AlignCenter} aria-pressed={box.align === 'center'} onClick={() => onSet({ align: 'center' })} />
        <IconButton label="Right" icon={AlignRight} aria-pressed={box.align === 'right'} onClick={() => onSet({ align: 'right' })} />
      </div>
      <div className="us-bar-group" role="group" aria-label="Vertical alignment">
        <IconButton label="Top" icon={AlignStartHorizontal} aria-pressed={box.valign === 'top'} onClick={() => onSet({ valign: null })} />
        <IconButton label="Middle" icon={AlignCenterHorizontal} aria-pressed={box.valign === 'middle'} onClick={() => onSet({ valign: 'middle' })} />
        <IconButton label="Bottom" icon={AlignEndHorizontal} aria-pressed={box.valign === 'bottom'} onClick={() => onSet({ valign: 'bottom' })} />
      </div>
      <IconButton label="Bring to front" icon={BringToFront} onClick={onFront} />
      <IconButton label="Send to back" icon={SendToBack} onClick={onBack} />
      <IconButton label="Duplicate" icon={Copy} onClick={onDuplicate} />
      <IconButton label="Delete" icon={Trash2} className="danger" onClick={onDelete} />
    </div>
  );
}
