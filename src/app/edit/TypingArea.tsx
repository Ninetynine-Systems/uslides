import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Bold, Heading, Italic, List } from 'lucide-react';
import { Annotation, EditorState } from '@codemirror/state';
import { EditorView, keymap, placeholder, runScopeHandlers, type Command, type ViewUpdate } from '@codemirror/view';
import { defaultKeymap } from '@codemirror/commands';
import type { Edit } from '../../core/edit';
import { IconButton } from '../IconButton';
import {
  activeFormats, cycleHeading, livePreview, toggleBold, toggleBullets, toggleItalic, type ActiveFormats,
} from './livePreview';

const externalChange = Annotation.define<boolean>();

export type QueuedTypingKey = {
  key: string;
  altKey: boolean;
  shiftKey: boolean;
};

/** Colours and type taken from the box being edited, so typing looks like it happens on the slide. */
export type TypingLook = {
  background: string;
  color: string;
  fontFamily: string;
  fontSize: number;
  padding: number;
  textAlign: string;
};

export type TypingAreaProps = {
  rect: DOMRect;
  look?: TypingLook;
  /** When set, the area starts at the rect's height and grows with the text, up to this height. */
  maxHeight?: number;
  /** Where the user double-clicked, in page coordinates: the cursor starts there when it is on the text. */
  caretAt?: { x: number; y: number };
  /** True when the format buttons have no room on the left and line up with the right edge instead. */
  alignBarRight?: boolean;
  text: string;
  from: number;
  onChange(edit: Edit): void;
  onUndo(): void;
  onRedo(): void;
  onReady(ready: boolean): void;
  takeQueuedInput(): QueuedTypingKey[];
  onDone(): void;
};

/** Height of the format buttons plus the gap above the text, so they only go above when they fit. */
const BAR_ROOM = 46;

/** Turns one CodeMirror update into one replacement against the main editor's source. */
function changedText(update: ViewUpdate, from: number): Edit {
  const before = update.startState.doc.toString();
  const after = update.state.doc.toString();
  let head = 0;
  while (head < before.length && head < after.length && before.charCodeAt(head) === after.charCodeAt(head)) head++;
  let tail = 0;
  while (
    tail < before.length - head && tail < after.length - head &&
    before.charCodeAt(before.length - 1 - tail) === after.charCodeAt(after.length - 1 - tail)
  ) tail++;
  return {
    from: from + head,
    to: from + before.length - tail,
    insert: after.slice(head, after.length - tail),
  };
}

function replayKey(editor: EditorView, queued: QueuedTypingKey): void {
  const { key } = queued;
  if (key.length !== 1) {
    runScopeHandlers(editor, new KeyboardEvent('keydown', queued), 'editor');
    return;
  }
  const selection = editor.state.selection.main;
  editor.dispatch({
    changes: { from: selection.from, to: selection.to, insert: key },
    selection: { anchor: selection.from + key.length },
    userEvent: 'input.type',
  });
}

/**
 * The text position under a double-click, or null when the click was on blank space (then typing starts at
 * the top, as it does for a box opened with Enter or Add box).
 */
function caretOnText(editor: EditorView, point: { x: number; y: number } | undefined): number | null {
  if (!point) return null;
  const pos = editor.posAtCoords(point);
  if (pos === null) return null;
  const at = editor.coordsAtPos(pos);
  if (!at) return null;
  const nearX = Math.abs(point.x - at.left) <= 24;
  const nearY = point.y >= at.top - 4 && point.y <= at.bottom + 4;
  return nearX && nearY ? pos : null;
}

const NO_FORMATS: ActiveFormats = { bold: false, italic: false, heading: false, list: false };

function sameFormats(a: ActiveFormats, b: ActiveFormats): boolean {
  return a.bold === b.bold && a.italic === b.italic && a.heading === b.heading && a.list === b.list;
}

export function TypingArea({
  rect, look, maxHeight, caretAt, alignBarRight, text, from, onChange, onUndo, onRedo, onReady, takeQueuedInput, onDone,
}: TypingAreaProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | undefined>(undefined);
  const [formats, setFormats] = useState<ActiveFormats>(NO_FORMATS);
  const initialText = useRef(text);
  const initialCaret = useRef(caretAt);
  const fromRef = useRef(from);
  fromRef.current = from;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onUndoRef = useRef(onUndo);
  onUndoRef.current = onUndo;
  const onRedoRef = useRef(onRedo);
  onRedoRef.current = onRedo;
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const takeQueuedInputRef = useRef(takeQueuedInput);
  takeQueuedInputRef.current = takeQueuedInput;

  useEffect(() => {
    const editor = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: initialText.current,
        extensions: [
          EditorView.lineWrapping,
          placeholder('Type here'),
          livePreview(),
          EditorView.contentAttributes.of({ 'aria-label': 'Markdown on slide' }),
          EditorView.domEventHandlers({
            keydown(event) {
              if (event.altKey || !(event.ctrlKey || event.metaKey)) return false;
              const key = event.key.toLowerCase();
              if (key === 'z' && !event.shiftKey) {
                onUndoRef.current();
                return true;
              }
              if ((key === 'z' && event.shiftKey) || (key === 'y' && !event.shiftKey)) {
                onRedoRef.current();
                return true;
              }
              return false;
            },
          }),
          keymap.of([
            {
              key: 'Escape',
              run: () => (onDoneRef.current(), true),
              stopPropagation: true,
            },
            { key: 'Mod-b', run: toggleBold, preventDefault: true },
            { key: 'Mod-i', run: toggleItalic, preventDefault: true },
            ...defaultKeymap,
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !update.transactions.some((t) => t.annotation(externalChange))) {
              onChangeRef.current(changedText(update, fromRef.current));
            }
            if (update.docChanged || update.selectionSet) {
              const next = activeFormats(update.state);
              setFormats((current) => (sameFormats(current, next) ? current : next));
            }
          }),
        ],
      }),
    });
    view.current = editor;
    editor.focus();
    const at = caretOnText(editor, initialCaret.current);
    if (at !== null) editor.dispatch({ selection: { anchor: at } });
    setFormats(activeFormats(editor.state));
    for (const key of takeQueuedInputRef.current()) replayKey(editor, key);
    onReadyRef.current(true);
    return () => {
      onReadyRef.current(false);
      editor.destroy();
      view.current = undefined;
    };
  }, []);

  useEffect(() => {
    const editor = view.current;
    if (!editor || editor.state.doc.toString() === text) return;
    editor.dispatch({
      changes: { from: 0, to: editor.state.doc.length, insert: text },
      selection: { anchor: Math.min(editor.state.selection.main.head, text.length) },
      annotations: externalChange.of(true),
    });
  }, [text]);

  const run = (command: Command) => {
    const editor = view.current;
    if (!editor) return;
    command(editor);
    editor.focus();
  };
  /** Keeps the text focused when a format button is pressed, so the selection stays where it was. */
  const keepFocus = (event: React.MouseEvent) => event.preventDefault();

  const wrapStyle: CSSProperties = { left: rect.x, top: rect.y, width: rect.width };
  const areaStyle: CSSProperties = {
    ...(maxHeight === undefined
      ? { height: rect.height }
      : { minHeight: rect.height, maxHeight: Math.max(rect.height, maxHeight) }),
    ...(look && {
      '--us-typing-bg': look.background,
      '--us-typing-fg': look.color,
      '--us-typing-font': look.fontFamily,
      '--us-typing-size': `${look.fontSize}px`,
      '--us-typing-pad': `${look.padding}px`,
      '--us-typing-align': look.textAlign,
    }),
  };
  return (
    <div
      className="us-typing-wrap"
      style={wrapStyle}
      data-bar={rect.y >= BAR_ROOM ? 'above' : 'below'}
      data-align={alignBarRight ? 'right' : 'left'}
    >
      <div className="us-typing-bar" role="toolbar" aria-label="Text style">
        <IconButton label="Bold (Ctrl+B)" icon={Bold} aria-pressed={formats.bold} onMouseDown={keepFocus} onClick={() => run(toggleBold)} />
        <IconButton label="Italic (Ctrl+I)" icon={Italic} aria-pressed={formats.italic} onMouseDown={keepFocus} onClick={() => run(toggleItalic)} />
        <IconButton label="Heading" icon={Heading} aria-pressed={formats.heading} onMouseDown={keepFocus} onClick={() => run(cycleHeading)} />
        <IconButton label="Bulleted list" icon={List} aria-pressed={formats.list} onMouseDown={keepFocus} onClick={() => run(toggleBullets)} />
      </div>
      <div className={maxHeight === undefined ? 'us-typing-area' : 'us-typing-area us-typing-grow'} ref={host} style={areaStyle} />
    </div>
  );
}
