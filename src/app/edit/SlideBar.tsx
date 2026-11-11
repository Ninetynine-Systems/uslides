import { useEffect, useRef, useState } from 'react';
import {
  AlignCenter,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  AlignLeft,
  AlignRight,
  AlignStartHorizontal,
  ArrowDown,
  ArrowUp,
  Check,
  CopyPlus,
  Grid3x3,
  SquarePlus,
  Trash2,
} from 'lucide-react';
import type { Slide } from '../../core/slide';
import type { Grid } from '../../core/types';
import { IconButton } from '../IconButton';
import { usePopup, usePopupDismiss } from '../usePopup';
import { ColourControl } from './FloatingBar';

type Theme = 'light' | 'dark';

export type SlideBarProps = {
  index: number;
  count: number;
  theme: Theme;
  grid: Grid;
  deckGrid: Grid;
  align: Slide['align'];
  valign: Slide['valign'];
  onSet(attrs: Record<string, string | null>): void;
  onGrid(grid: Grid | null): void;
  onAddBox(): void;
  onDuplicate(): void;
  onMove(direction: -1 | 1): void;
  onDelete(): void;
};

/** Finer grids on top of the deck's own, for drawing with small boxes. */
const FINER: Grid[] = [{ cols: 24, rows: 12 }, { cols: 32, rows: 18 }];

/** About as long as browsers wait for the second click of a double-click. */
const DOUBLE_CLICK_MS = 350;

const same = (a: Grid, b: Grid) => a.cols === b.cols && a.rows === b.rows;

function GridControl({ grid, deckGrid, onGrid }: { grid: Grid; deckGrid: Grid; onGrid(grid: Grid | null): void }) {
  const popup = usePopup();
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  usePopupDismiss(popup.open, popup.close, [container], trigger);
  const choices: { label: string; grid: Grid | null; value: Grid }[] = [
    { label: `Deck grid (${deckGrid.cols} × ${deckGrid.rows})`, grid: null, value: deckGrid },
    ...FINER.filter((g) => !same(g, deckGrid)).map((g) => ({ label: `Finer grid (${g.cols} × ${g.rows})`, grid: g, value: g })),
  ];
  // A grid set by hand in the Markdown that is not one of the choices is still shown, as the current one.
  if (!choices.some((choice) => same(choice.value, grid))) {
    choices.push({ label: `This slide's grid (${grid.cols} × ${grid.rows})`, grid, value: grid });
  }
  return (
    <div ref={container} className="us-colour-control">
      <IconButton ref={trigger} label="Grid" icon={Grid3x3} aria-haspopup="menu" aria-expanded={popup.open} onClick={popup.toggle} />
      {popup.open && (
        <div className="us-colour-menu us-grid-menu" role="menu" aria-label="Grid">
          {choices.map((choice) => {
            const current = same(choice.value, grid);
            return (
              <button
                key={choice.label}
                type="button"
                className="menu-item"
                role="menuitemradio"
                aria-checked={current}
                onClick={() => {
                  popup.close();
                  if (!current) onGrid(choice.grid);
                }}
              >
                <Check size={16} aria-hidden style={{ visibility: current ? 'visible' : 'hidden' }} />
                <span>{choice.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Settings for the selected slide, shown when a click on the slide selects no box. */
export function SlideBar(props: SlideBarProps) {
  const { index, count, theme, grid, deckGrid, align, valign } = props;
  // The bar appears on the first click of what may be a double-click. Until a double-click would be over,
  // it lets clicks through, so the second click still reaches the text or blank space under it.
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setArmed(true), DOUBLE_CLICK_MS);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <div
      className={armed ? 'us-floating-bar us-slide-bar' : 'us-floating-bar us-slide-bar us-arming'}
      role="toolbar"
      aria-label={`Slide ${index + 1}`}
    >
      <span className="us-bar-label">Slide {index + 1}</span>
      <ColourControl kind="fill" theme={theme} label="Background colour" onSet={(value) => props.onSet({ bg: value })} />
      <ColourControl kind="text" theme={theme} onSet={(value) => props.onSet({ color: value })} />
      <GridControl grid={grid} deckGrid={deckGrid} onGrid={props.onGrid} />
      {/* Alignment of the slide's own text, outside boxes. Left and top are the defaults, so they remove the setting. */}
      <div className="us-bar-group" role="group" aria-label="Horizontal alignment">
        <IconButton label="Left" icon={AlignLeft} aria-pressed={align === 'left'} onClick={() => props.onSet({ align: null })} />
        <IconButton label="Centre" icon={AlignCenter} aria-pressed={align === 'center'} onClick={() => props.onSet({ align: 'center' })} />
        <IconButton label="Right" icon={AlignRight} aria-pressed={align === 'right'} onClick={() => props.onSet({ align: 'right' })} />
      </div>
      <div className="us-bar-group" role="group" aria-label="Vertical alignment">
        <IconButton label="Top" icon={AlignStartHorizontal} aria-pressed={valign === 'top'} onClick={() => props.onSet({ valign: null })} />
        <IconButton label="Middle" icon={AlignCenterHorizontal} aria-pressed={valign === 'middle'} onClick={() => props.onSet({ valign: 'middle' })} />
        <IconButton label="Bottom" icon={AlignEndHorizontal} aria-pressed={valign === 'bottom'} onClick={() => props.onSet({ valign: 'bottom' })} />
      </div>
      <div className="us-bar-group" role="group" aria-label="Slide actions">
        <IconButton label="Add box" icon={SquarePlus} onClick={props.onAddBox} />
        <IconButton label="Duplicate slide" icon={CopyPlus} onClick={props.onDuplicate} />
        <IconButton label="Move slide up" icon={ArrowUp} disabled={index === 0} onClick={() => props.onMove(-1)} />
        <IconButton label="Move slide down" icon={ArrowDown} disabled={index >= count - 1} onClick={() => props.onMove(1)} />
        <IconButton label="Delete slide" icon={Trash2} className="danger" disabled={count <= 1} onClick={props.onDelete} />
      </div>
    </div>
  );
}
