import { useEffect, useId, useRef } from 'react';
import { AtSign, Globe, HardDrive, Mail, WifiOff, X } from 'lucide-react';
import { IconButton } from './IconButton';

/** The version shown in the corner badge and on the About page. */
export const VERSION_TEXT = `uslides · ${__BUILD_ID__} · ${__COMMIT__}`;

/** The app name and version in the bottom-right corner. It opens the About page. */
export function VersionBadge({ onClick }: { onClick(): void }) {
  return (
    <button type="button" className="version-badge" aria-label={`About uslides, version ${__BUILD_ID__}, commit ${__COMMIT__}`} title="About uslides" onClick={onClick}>
      {VERSION_TEXT}
    </button>
  );
}

type Props = { onClose(): void };

/** What uslides is, where decks are kept, and how to reach the people who make it. */
export function About({ onClose }: Props) {
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    opener.current = document.activeElement;
    dialog.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      if (opener.current instanceof HTMLElement) opener.current.focus();
    };
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div ref={dialog} className="modal about-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className="about-head">
          <h2 id={titleId}>About uslides</h2>
          <IconButton label="Close" icon={X} onClick={onClose} />
        </div>
        <p className="about-lead">Slides you write in plain text, right in your browser. No account, nothing to install.</p>

        <ul className="about-points">
          <li>
            <HardDrive size={18} aria-hidden />
            <div>
              <strong>Your decks stay on this device</strong>
              <span>
                Everything is saved in this browser only. Nothing is uploaded or stored in the cloud, and we never see
                your slides.
              </span>
            </div>
          </li>
          <li>
            <WifiOff size={18} aria-hidden />
            <div>
              <strong>Works offline</strong>
              <span>After your first visit, uslides opens and saves without an internet connection.</span>
            </div>
          </li>
          <li>
            <Globe size={18} aria-hidden />
            <div>
              <strong>You decide what leaves</strong>
              <span>
                A shared link carries the deck inside the link itself, so only the people you send it to can open it.
                Web fonts and web images load from their own sites; you can ask to be asked first in the deck menu.
                Back up your decks to a file from the same menu, because clearing this browser&apos;s data removes them.
              </span>
            </div>
          </li>
        </ul>

        <div className="about-links">
          <a href="https://ninetynine.systems" target="_blank" rel="noreferrer">
            <Globe size={16} aria-hidden />
            ninetynine.systems
          </a>
          <a href="mailto:sazid@ninetynine.systems">
            <Mail size={16} aria-hidden />
            sazid@ninetynine.systems
          </a>
          <a href="https://x.com/sazidz" target="_blank" rel="noreferrer">
            <AtSign size={16} aria-hidden />
            Follow @sazidz on X
          </a>
        </div>
        <p className="muted about-build">{`Made by Ninetynine Systems · version ${__BUILD_ID__} · commit ${__COMMIT__}`}</p>
      </div>
    </div>
  );
}
