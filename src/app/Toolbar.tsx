import { useState } from 'react';

type Props = {
  listOpen: boolean;
  onToggleList(): void;
  name: string;
  onRename(): void;
  onDuplicate(): void;
  onDelete(): void;
  onPresent(): void;
  /** Copies the share link. Resolves to the link when the clipboard could not be written, else undefined. */
  onCopyLink(): Promise<string | undefined>;
};

function ShareMenu({ onCopyLink }: { onCopyLink: Props['onCopyLink'] }) {
  const [open, setOpen] = useState(false);
  const [manual, setManual] = useState<string>();
  const close = () => {
    setOpen(false);
    setManual(undefined);
  };
  const copy = () => {
    onCopyLink().then(
      (link) => (link === undefined ? close() : setManual(link)),
      () => close(),
    );
  };
  return (
    <div className="share" onKeyDown={(e) => e.key === 'Escape' && close()}>
      <button type="button" aria-haspopup="true" aria-expanded={open} onClick={() => (open ? close() : setOpen(true))}>
        Share
      </button>
      {open && (
        <div className="share-menu">
          <button type="button" onClick={copy}>
            Copy link
          </button>
          {manual !== undefined && (
            <label className="share-manual">
              Copy this link by hand
              <input type="text" readOnly value={manual} onFocus={(e) => e.currentTarget.select()} />
            </label>
          )}
        </div>
      )}
    </div>
  );
}

export function Toolbar({ listOpen, onToggleList, name, onRename, onDuplicate, onDelete, onPresent, onCopyLink }: Props) {
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
        <ShareMenu onCopyLink={onCopyLink} />
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
