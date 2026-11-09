export type DeckSummary = { id: string; name: string; updatedAt: number };

type Props = {
  decks: DeckSummary[];
  activeId: string | undefined;
  now?: number;
  onSelect(id: string): void;
  onNew(): void;
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

export function DeckList({ decks, activeId, now = Date.now(), onSelect, onNew }: Props) {
  return (
    <nav className="decklist" aria-label="Decks">
      <div className="decklist-head">
        <strong>Decks</strong>
        <button type="button" onClick={onNew}>
          New deck
        </button>
      </div>
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
