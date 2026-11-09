type Props = {
  listOpen: boolean;
  onToggleList(): void;
  name: string;
  onRename(): void;
  onDuplicate(): void;
  onDelete(): void;
  onPresent(): void;
};

export function Toolbar({ listOpen, onToggleList, name, onRename, onDuplicate, onDelete, onPresent }: Props) {
  return (
    <header className="toolbar">
      <button type="button" onClick={onToggleList} aria-expanded={listOpen} aria-controls="decks">
        {listOpen ? 'Hide decks' : 'Show decks'}
      </button>
      <h1 className="toolbar-name">{name}</h1>
      <div className="toolbar-actions">
        <button type="button" onClick={onPresent}>
          Present
        </button>
        <button type="button" onClick={onRename}>
          Rename
        </button>
        <button type="button" onClick={onDuplicate}>
          Duplicate
        </button>
        <button type="button" className="danger" onClick={onDelete}>
          Delete
        </button>
      </div>
    </header>
  );
}
