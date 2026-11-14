import { useEffect, useRef, useState, type Ref } from 'react';
import {
  Bot, ChevronDown, Copy, Download, Ellipsis, FileCode, Info, FileText, FileUp, FolderOpen, ImageDown, Link, Link2, Moon,
  PanelLeftClose, PanelLeftOpen, Play, Presentation, Printer, Redo2, Share2, Sun, Trash2, TriangleAlert, Type, Undo2,
} from 'lucide-react';
import { IconButton, LabelButton, MenuItem } from './IconButton';
import { DeckName } from './DeckName';
import { Menu } from './Menu';
import { useTheme } from './theme';
import { usePopup, usePopupDismiss } from './usePopup';

type Props = {
  listOpen: boolean;
  onToggleList(): void;
  name: string;
  renameDisabled: boolean;
  deckFontOpen: boolean;
  onDeckFont(): void;
  deckFontTriggerRef: Ref<HTMLButtonElement>;
  onRename(title: string): void;
  onDuplicate(): void;
  onDelete(): void;
  onAbout(): void;
  onAgentHelp(): void;
  onPresent(): void;
  onPresenterView(): void;
  /** Undefined where the deck cannot be edited (a narrow screen), so the buttons are not shown. */
  history?: { canUndo: boolean; canRedo: boolean; onUndo(): void; onRedo(): void };
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
  const popup = usePopup();
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  usePopupDismiss(popup.open, popup.close, [container], trigger);
  return (
    <div ref={container} className="linked">
      <button
        ref={trigger}
        type="button"
        className="linked-btn"
        aria-label={`Linked: ${name}`}
        title={`Linked: ${name}`}
        aria-haspopup="true"
        aria-expanded={popup.open}
        onClick={popup.toggle}
      >
        <Link2 size={18} aria-hidden />
        <span>{name}</span>
      </button>
      {popup.open && (
        <div className="linked-menu">
          <MenuItem
            label="Unlink file"
            icon={Link2}
            onClick={() => {
              popup.close();
              onUnlink();
            }}
          />
        </div>
      )}
    </div>
  );
}

function ShareMenu({ onCopyLink }: { onCopyLink: Props['onCopyLink'] }) {
  const popup = usePopup();
  const [manual, setManual] = useState<string>();
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  usePopupDismiss(popup.open, popup.close, [container], trigger);
  useEffect(() => {
    if (!popup.open) setManual(undefined);
  }, [popup.open]);
  const copy = () => {
    onCopyLink().then(
      (link) => (link === undefined ? popup.close() : setManual(link)),
      popup.close,
    );
  };
  return (
    <div ref={container} className="share">
      <LabelButton ref={trigger} label="Share" icon={Share2} aria-haspopup="true" aria-expanded={popup.open} onClick={popup.toggle} />
      {popup.open && (
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
  const popup = usePopup();
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  usePopupDismiss(popup.open, popup.close, [container], trigger);
  const choose = (action: () => void) => () => {
    popup.close();
    action();
  };
  return (
    <div ref={container} className="share">
      <IconButton ref={trigger} label="Download" icon={Download} aria-haspopup="true" aria-expanded={popup.open} onClick={popup.toggle} />
      {popup.open && (
        <div className="share-menu">
          <MenuItem label="Download .md" icon={FileText} onClick={choose(onMarkdown)} />
          <MenuItem label="Download .html" icon={FileCode} onClick={choose(onHtml)} />
          <MenuItem label="Print / PDF" icon={Printer} onClick={choose(onPrint)} />
        </div>
      )}
    </div>
  );
}

const MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = MAC ? '⌘' : 'Ctrl+';

function PresentButton({ onPresent, onPresenterView }: { onPresent(): void; onPresenterView(): void }) {
  const popup = usePopup();
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  usePopupDismiss(popup.open, popup.close, [container], trigger);
  return (
    <div ref={container} className="share present-split">
      <LabelButton label="Present" icon={Play} className="primary" onClick={onPresent} />
      <button
        ref={trigger}
        type="button"
        className="label-btn primary present-more"
        aria-label="Notes and second screen"
        title="Notes and second screen"
        aria-haspopup="true"
        aria-expanded={popup.open}
        onClick={popup.toggle}
      >
        <ChevronDown size={16} aria-hidden />
      </button>
      {popup.open && (
        <div className="share-menu present-menu">
          <MenuItem label="Present" icon={Play} onClick={() => { popup.close(); onPresent(); }} />
          <MenuItem
            label="Presenter view, with notes"
            icon={Presentation}
            onClick={() => { popup.close(); onPresenterView(); }}
          />
          <p className="menu-note">Shows your notes and the next slide here, and the slides in a second window for the audience.</p>
        </div>
      )}
    </div>
  );
}

export function Toolbar({
  listOpen, onToggleList, name, renameDisabled, deckFontOpen, onDeckFont, deckFontTriggerRef, onRename, onDuplicate, onDelete, onAbout, onAgentHelp, onPresent,
  onPresenterView, history, onCopyLink,
  onPackImages, onDownloadMarkdown, onDownloadHtml, onPrint, onOpen, onOpenFolder, link, needsAccess, readOnly, onGrant, onUnlink,
}: Props) {
  const { theme, toggle: toggleTheme } = useTheme();
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
      {history && (
        <div className="toolbar-history" role="group" aria-label="History">
          <IconButton label={`Undo (${MOD}Z)`} icon={Undo2} disabled={!history.canUndo} onClick={history.onUndo} />
          <IconButton
            label={`Redo (${MAC ? '⇧⌘Z' : 'Ctrl+Y'})`}
            icon={Redo2}
            disabled={!history.canRedo}
            onClick={history.onRedo}
          />
        </div>
      )}
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
          ref={deckFontTriggerRef}
          label="Deck font"
          icon={Type}
          aria-haspopup="dialog"
          aria-expanded={deckFontOpen}
          onClick={onDeckFont}
        />
        <DownloadMenu onMarkdown={onDownloadMarkdown} onHtml={onDownloadHtml} onPrint={onPrint} />
        <ShareMenu onCopyLink={onCopyLink} />
        <PresentButton onPresent={onPresent} onPresenterView={onPresenterView} />
        <IconButton
          label={theme === 'dark' ? 'Light theme' : 'Dark theme'}
          icon={theme === 'dark' ? Sun : Moon}
          onClick={toggleTheme}
        />
        <Menu label="More" icon={Ellipsis}>
          {(close) => (
            <>
              <MenuItem label="Open file" icon={FileUp} onClick={() => { close(); onOpen(); }} />
              {onOpenFolder && (
                <MenuItem label="Open folder" icon={FolderOpen} onClick={() => { close(); onOpenFolder(); }} />
              )}
              <MenuItem label="Pack images" icon={ImageDown} onClick={() => { close(); onPackImages(); }} />
              <MenuItem label="Duplicate deck" icon={Copy} onClick={() => { close(); onDuplicate(); }} />
              <MenuItem label="Use with an AI agent" icon={Bot} onClick={() => { close(); onAgentHelp(); }} />
              <MenuItem label="About uslides" icon={Info} onClick={() => { close(); onAbout(); }} />
              <hr />
              <MenuItem label="Delete deck" icon={Trash2} className="danger" onClick={() => { close(); onDelete(); }} />
            </>
          )}
        </Menu>
      </div>
    </header>
  );
}
