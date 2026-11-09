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
  onOpen(): void;
  /** Undefined when the browser cannot open folders. */
  onOpenFolder?(): void;
  /** The linked file, if any. */
  link?: { name: string; folder: boolean };
  needsAccess: boolean;
  readOnly: boolean;
  onGrant(): void;
  onUnlink(): void;
};

function LinkedBadge({ name, onUnlink }: { name: string; onUnlink(): void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="linked" onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}>
      <button type="button" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        Linked: {name}
      </button>
      {open && (
        <div className="linked-menu">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onUnlink();
            }}
          >
            Unlink file
          </button>
        </div>
      )}
    </div>
  );
}

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

export function Toolbar({
  listOpen, onToggleList, name, onRename, onDuplicate, onDelete, onPresent, onCopyLink,
  onOpen, onOpenFolder, link, needsAccess, readOnly, onGrant, onUnlink,
}: Props) {
  return (
    <header className="toolbar">
      <button type="button" onClick={onToggleList} aria-expanded={listOpen} aria-controls="decks">
        {listOpen ? 'Hide decks' : 'Show decks'}
      </button>
      <h1 className="toolbar-name">{name}</h1>
      <div className="toolbar-actions">
        {link && (needsAccess || readOnly) && (
          <button type="button" onClick={onGrant}>
            {needsAccess
              ? link.folder
                ? 'Allow access to the folder again'
                : 'Allow access to the file again'
              : link.folder
                ? 'Allow writing to the folder'
                : 'Allow writing to the file'}
          </button>
        )}
        {link && <LinkedBadge name={link.name} onUnlink={onUnlink} />}
        <button type="button" onClick={onOpen}>
          Open
        </button>
        {onOpenFolder && (
          <button type="button" onClick={onOpenFolder}>
            Open folder
          </button>
        )}
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
