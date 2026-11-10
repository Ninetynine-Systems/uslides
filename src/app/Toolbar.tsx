import { useRef, useState } from 'react';
import {
  Copy, Download, Ellipsis, FileCode, FileText, FileUp, FolderOpen, ImageDown, Link, Link2, PanelLeftClose, PanelLeftOpen,
  Play, Printer, Share2, Trash2, TriangleAlert, Type,
} from 'lucide-react';
import { IconButton, LabelButton, MenuItem } from './IconButton';
import { DeckName } from './DeckName';
import { Menu, useOutsidePress } from './Menu';

type Props = {
  listOpen: boolean;
  onToggleList(): void;
  name: string;
  renameDisabled: boolean;
  deckFontOpen: boolean;
  onDeckFont(): void;
  onRename(title: string): void;
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
  const container = useRef<HTMLDivElement>(null);
  const close = () => setOpen(false);
  useOutsidePress(container, open, close);
  return (
    <div
      ref={container}
      className="linked"
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        close();
        container.current?.querySelector('button')?.focus();
      }}
    >
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
              close();
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
  const container = useRef<HTMLDivElement>(null);
  const close = () => {
    setOpen(false);
    setManual(undefined);
  };
  useOutsidePress(container, open, close);
  const copy = () => {
    onCopyLink().then(
      (link) => (link === undefined ? close() : setManual(link)),
      () => close(),
    );
  };
  return (
    <div
      ref={container}
      className="share"
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        close();
        container.current?.querySelector('button')?.focus();
      }}
    >
      <LabelButton label="Share" icon={Share2} aria-haspopup="true" aria-expanded={open} onClick={() => (open ? close() : setOpen(true))} />
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
  const container = useRef<HTMLDivElement>(null);
  const close = () => setOpen(false);
  useOutsidePress(container, open, close);
  const choose = (action: () => void) => () => {
    close();
    action();
  };
  return (
    <div
      ref={container}
      className="share"
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        close();
        container.current?.querySelector('button')?.focus();
      }}
    >
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
  listOpen, onToggleList, name, renameDisabled, deckFontOpen, onDeckFont, onRename, onDuplicate, onDelete, onPresent, onCopyLink,
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
      <DeckName name={name} disabled={renameDisabled} onRename={onRename} />
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
        <IconButton
          label="Deck font"
          icon={Type}
          aria-haspopup="dialog"
          aria-expanded={deckFontOpen}
          onClick={onDeckFont}
        />
        <DownloadMenu onMarkdown={onDownloadMarkdown} onHtml={onDownloadHtml} onPrint={onPrint} />
        <ShareMenu onCopyLink={onCopyLink} />
        <LabelButton label="Present" icon={Play} className="primary" onClick={onPresent} />
        <Menu label="More" icon={Ellipsis}>
          {(close) => (
            <>
              <MenuItem label="Open file" icon={FileUp} onClick={() => { close(); onOpen(); }} />
              {onOpenFolder && (
                <MenuItem label="Open folder" icon={FolderOpen} onClick={() => { close(); onOpenFolder(); }} />
              )}
              <MenuItem label="Pack images" icon={ImageDown} onClick={() => { close(); onPackImages(); }} />
              <MenuItem label="Duplicate deck" icon={Copy} onClick={() => { close(); onDuplicate(); }} />
              <hr />
              <MenuItem label="Delete deck" icon={Trash2} className="danger" onClick={() => { close(); onDelete(); }} />
            </>
          )}
        </Menu>
      </div>
    </header>
  );
}
