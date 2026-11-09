import { useState } from 'react';
import { Archive, ArchiveRestore, Ellipsis, Plus, Square, SquareCheckBig } from 'lucide-react';
import { IconButton, MenuItem } from './IconButton';

export type DeckSummary = { id: string; name: string; updatedAt: number };

type Props = {
  decks: DeckSummary[];
  activeId: string | undefined;
  now?: number;
  onSelect(id: string): void;
  onNew(): void;
  onBackup(): void;
  onRestore(): void;
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
  decks, activeId, now = Date.now(), onSelect, onNew, onBackup, onRestore, askFirst, onAskFirstChange,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const choose = (action: () => void) => () => {
    setMenuOpen(false);
    action();
  };
  return (
    <nav className="decklist" aria-label="Decks">
      <div className="decklist-head">
        <strong>Decks</strong>
        <IconButton label="New deck" icon={Plus} onClick={onNew} />
        <IconButton label="Menu" icon={Ellipsis} aria-haspopup="true" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)} />
      </div>
      {menuOpen && (
        <div className="decklist-menu" onKeyDown={(e) => e.key === 'Escape' && setMenuOpen(false)}>
          <MenuItem label="Back up all decks" icon={Archive} onClick={choose(onBackup)} />
          <MenuItem label="Restore from backup" icon={ArchiveRestore} onClick={choose(onRestore)} />
          <MenuItem
            label="Ask before loading anything from other websites"
            icon={askFirst ? SquareCheckBig : Square}
            role="menuitemcheckbox"
            aria-checked={askFirst}
            onClick={() => onAskFirstChange(!askFirst)}
          />
          <p className="muted about">{`uslides, build ${__BUILD_ID__}`}</p>
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
