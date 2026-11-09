import { useState } from 'react';
import {
  Copy, Download, FileCode, FileText, FileUp, FolderOpen, ImageDown, Link, Link2, PanelLeftClose, PanelLeftOpen,
  Pencil, Play, Printer, Share2, Trash2, TriangleAlert,
} from 'lucide-react';
import { IconButton, MenuItem } from './IconButton';

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
  onPackImages(): void;
  onDownloadMarkdown(): void;
  onDownloadHtml(): void;
  onPrint(): void;
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
      <button
        type="button"
        className="linked-btn"
        aria-label={`Linked: ${name}`}
        title={`Linked: ${name}`}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Link2 size={18} aria-hidden />
        <span>{name}</span>
      </button>
      {open && (
        <div className="linked-menu">
          <MenuItem
            label="Unlink file"
            icon={Link2}
            onClick={() => {
              setOpen(false);
              onUnlink();
            }}
          />
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
      <IconButton label="Share" icon={Share2} aria-haspopup="true" aria-expanded={open} onClick={() => (open ? close() : setOpen(true))} />
      {open && (
        <div className="share-menu">
          <MenuItem label="Copy link" icon={Link} onClick={copy} />
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

function DownloadMenu({ onMarkdown, onHtml, onPrint }: { onMarkdown(): void; onHtml(): void; onPrint(): void }) {
  const [open, setOpen] = useState(false);
  const choose = (action: () => void) => () => {
    setOpen(false);
    action();
  };
  return (
    <div className="share" onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}>
      <IconButton label="Download" icon={Download} aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((o) => !o)} />
      {open && (
        <div className="share-menu">
          <MenuItem label="Download .md" icon={FileText} onClick={choose(onMarkdown)} />
          <MenuItem label="Download .html" icon={FileCode} onClick={choose(onHtml)} />
          <MenuItem label="Print / PDF" icon={Printer} onClick={choose(onPrint)} />
        </div>
      )}
    </div>
  );
}

export function Toolbar({
  listOpen, onToggleList, name, onRename, onDuplicate, onDelete, onPresent, onCopyLink,
  onPackImages, onDownloadMarkdown, onDownloadHtml, onPrint, onOpen, onOpenFolder, link, needsAccess, readOnly, onGrant, onUnlink,
}: Props) {
  return (
    <header className="toolbar">
      <IconButton
        label={listOpen ? 'Hide decks' : 'Show decks'}
        icon={listOpen ? PanelLeftClose : PanelLeftOpen}
        onClick={onToggleList}
        aria-expanded={listOpen}
        aria-controls="decks"
      />
      <h1 className="toolbar-name">{name}</h1>
      <div className="toolbar-actions">
        {link && (needsAccess || readOnly) && (
          <button type="button" className="grant-btn" onClick={onGrant}>
            <TriangleAlert size={16} aria-hidden />
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
        <IconButton label="Open" icon={FileUp} onClick={onOpen} />
        {onOpenFolder && <IconButton label="Open folder" icon={FolderOpen} onClick={onOpenFolder} />}
        <IconButton label="Present" icon={Play} onClick={onPresent} />
        <IconButton label="Pack images" icon={ImageDown} onClick={onPackImages} />
        <ShareMenu onCopyLink={onCopyLink} />
        <DownloadMenu onMarkdown={onDownloadMarkdown} onHtml={onDownloadHtml} onPrint={onPrint} />
        <IconButton label="Rename" icon={Pencil} onClick={onRename} />
        <IconButton label="Duplicate" icon={Copy} onClick={onDuplicate} />
        <IconButton label="Delete" icon={Trash2} className="danger" onClick={onDelete} />
      </div>
    </header>
  );
}
