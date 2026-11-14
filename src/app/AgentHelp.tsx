import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ClipboardCopy, Download, FileOutput, FileText, LayoutGrid, Palette, StickyNote, X } from 'lucide-react';
import { IconButton, LabelButton } from './IconButton';

/** Where the published agent instructions live. Agents fetch this address themselves. */
export const SKILL_URL = 'https://uslides.ninetynine.systems/SKILL.md';

/** The short message a person pastes into a chat assistant. */
export const AGENT_PROMPT = [
  'Make me a slide deck for uslides (https://uslides.ninetynine.systems).',
  `First read the instructions at ${SKILL_URL} and follow them exactly.`,
  'Then write the deck as one Markdown file, or give me a share link.',
  '',
  'The deck is about: [your topic]',
].join('\n');

const LOAD_FAILED = "Couldn't load the instructions. Check your connection and try again.";
const COPY_FAILED = "Couldn't copy. Select the text and copy it yourself.";

/** The copy of the instructions that ships with this build, so it also works offline. */
const localSkillUrl = () => `${import.meta.env.BASE_URL}SKILL.md`;

/** Loads the full instructions. Fails on a bad status, an empty file, or the app's own HTML page. */
async function loadInstructions(): Promise<string> {
  const response = await fetch(localSkillUrl());
  if (!response.ok) throw new Error(`status ${response.status}`);
  const text = await response.text();
  if (text.trim() === '' || /^\s*<!doctype html/i.test(text)) throw new Error('not the instructions file');
  return text;
}

type Props = {
  onClose(): void;
  /** Shows a short confirmation, the same way "Link copied" is shown. */
  notify(text: string): void;
};

/** How to get an AI assistant to write a deck: a prompt to paste, and the full instructions. */
export function AgentHelp({ onClose, notify }: Props) {
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);
  const [error, setError] = useState('');
  // The instructions are fetched when the panel opens, so the copy can happen straight inside the
  // click. Safari refuses a clipboard write that first waits on a slow download.
  const instructions = useRef<Promise<string> | null>(null);

  const startLoading = useCallback(() => {
    const loading = loadInstructions();
    // A failure is reported when the button is clicked, not when the panel opens.
    loading.catch(() => undefined);
    instructions.current = loading;
    return loading;
  }, []);

  useEffect(() => {
    opener.current = document.activeElement;
    dialog.current?.focus();
    startLoading();
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
  }, [onClose, startLoading]);

  /** Puts text on the clipboard and confirms it, or shows why it could not. */
  const copy = async (text: string, done: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setError('');
      notify(done);
    } catch {
      setError(COPY_FAILED);
    }
  };

  const copyInstructions = async () => {
    let text: string;
    try {
      text = await (instructions.current ?? startLoading());
    } catch {
      // Forget the failed download, so the next click tries again.
      instructions.current = null;
      setError(LOAD_FAILED);
      return;
    }
    await copy(text, 'Instructions copied');
  };

  return (
    <div
      className="modal-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div ref={dialog} className="modal about-dialog agent-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className="about-head">
          <h2 id={titleId}>Use with an AI agent</h2>
          <IconButton label="Close" icon={X} onClick={onClose} />
        </div>
        <p className="about-lead">
          Your AI assistant can write a whole deck for you. Give it the instructions below, tell it your topic, and
          open the file or link it gives back.
        </p>

        <h3 className="agent-subhead">What it can make</h3>
        <ul className="about-points">
          <li>
            <LayoutGrid size={18} aria-hidden />
            <div>
              <strong>Slides and layouts</strong>
              <span>Titles, lists, tables, code and quotes, plus boxes placed on a grid.</span>
            </div>
          </li>
          <li>
            <Palette size={18} aria-hidden />
            <div>
              <strong>Your look</strong>
              <span>Colours, fonts, light or dark theme, and images.</span>
            </div>
          </li>
          <li>
            <StickyNote size={18} aria-hidden />
            <div>
              <strong>Speaker notes</strong>
              <span>Notes that only you see in the presenter view.</span>
            </div>
          </li>
          <li>
            <FileOutput size={18} aria-hidden />
            <div>
              <strong>A file or a link</strong>
              <span>It hands the deck back as a Markdown file, or as a link that opens in uslides.</span>
            </div>
          </li>
        </ul>

        <pre className="agent-prompt" role="group" aria-label="Prompt for your assistant" tabIndex={0}>{AGENT_PROMPT}</pre>

        <div className="agent-actions">
          <LabelButton label="Copy prompt" icon={ClipboardCopy} className="primary" onClick={() => void copy(AGENT_PROMPT, 'Prompt copied')} />
          <LabelButton label="Copy full instructions" icon={FileText} onClick={() => void copyInstructions()} />
          <a className="label-btn agent-download" href={localSkillUrl()} download="SKILL.md">
            <Download size={18} aria-hidden />
            <span>Download SKILL.md</span>
          </a>
        </div>
        {error !== '' && <p className="agent-error" role="alert">{error}</p>}
        <p className="muted agent-note">
          Use the full instructions if your assistant cannot open web links, or save them as AGENTS.md in a project.
        </p>
      </div>
    </div>
  );
}
