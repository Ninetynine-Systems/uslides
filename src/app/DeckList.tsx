import { useRef } from 'react';
import { Archive, ArchiveRestore, Ellipsis, Info, Plus, Square, SquareCheckBig } from 'lucide-react';
import { IconButton, LabelButton, MenuItem } from './IconButton';
import { usePopup, usePopupDismiss } from './usePopup';

export type DeckSummary = { id: string; name: string; updatedAt: number };

type Props = {
  decks: DeckSummary[];
  activeId: string | undefined;
  now?: number;
  onSelect(id: string): void;
  onNew(): void;
  onBackup(): void;
  onRestore(): void;
  onAbout(): void;
  askFirst: boolean;
  onAskFirstChange(on: boolean): void;
};

/** "just now", "5 min ago", "3 h ago", "2 d ago", or a date for anything older than a month. */
export function relativeTime(then: number, now: number): string {
  const s = Math.max(0, Math.round((now - then) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} d ago`;
  return new Date(then).toLocaleDateString();
}

export function DeckList({
  decks, activeId, now = Date.now(), onSelect, onNew, onBackup, onRestore, onAbout, askFirst, onAskFirstChange,
}: Props) {
  const menu = usePopup();
  const container = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  usePopupDismiss(menu.open, menu.close, [container], trigger);
  const choose = (action: () => void) => () => {
    menu.close();
    action();
  };
  return (
    <nav ref={container} className="decklist" aria-label="Decks">
      <div className="decklist-head">
        <strong>Decks</strong>
        <LabelButton label="New deck" icon={Plus} onClick={onNew} />
        <IconButton ref={trigger} label="Menu" icon={Ellipsis} aria-haspopup="true" aria-expanded={menu.open} onClick={menu.toggle} />
      </div>
      {menu.open && (
        <div className="decklist-menu">
          <MenuItem label="Back up all decks" icon={Archive} onClick={choose(onBackup)} />
          <MenuItem label="Restore from backup" icon={ArchiveRestore} onClick={choose(onRestore)} />
          <MenuItem
            label="Ask before loading anything from other websites"
            icon={askFirst ? SquareCheckBig : Square}
            role="menuitemcheckbox"
            aria-checked={askFirst}
            onClick={() => onAskFirstChange(!askFirst)}
          />
          <MenuItem label="About uslides" icon={Info} onClick={choose(onAbout)} />
        </div>
      )}
      <ul>
        {decks.map((d) => (
          <li key={d.id}>
            <button
              type="button"
              className={d.id === activeId ? 'deck-item active' : 'deck-item'}
              aria-current={d.id === activeId ? 'true' : undefined}
              onClick={() => onSelect(d.id)}
            >
              <span className="deck-name">{d.name}</span>
              <span className="deck-time muted">Updated {relativeTime(d.updatedAt, now)}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
