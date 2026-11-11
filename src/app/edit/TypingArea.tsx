import { useEffect, useRef, type CSSProperties } from 'react';
import { Annotation, EditorState, RangeSetBuilder, StateField } from '@codemirror/state';
import {
  Decoration, EditorView, keymap, placeholder, runScopeHandlers, type DecorationSet, type ViewUpdate,
} from '@codemirror/view';
import { defaultKeymap } from '@codemirror/commands';
import type { Edit } from '../../core/edit';

const externalChange = Annotation.define<boolean>();

export type QueuedTypingKey = {
  key: string;
  altKey: boolean;
  shiftKey: boolean;
};

/** Colours and type taken from the box being edited, so typing looks like it happens on the slide. */
export type TypingLook = { background: string; color: string; fontFamily: string; fontSize: number; padding: number };

export type TypingAreaProps = {
  rect: DOMRect;
  look?: TypingLook;
  /** When set, the area starts at the rect's height and grows with the text, up to this height. */
  maxHeight?: number;
  text: string;
  from: number;
  onChange(edit: Edit): void;
  onUndo(): void;
  onRedo(): void;
  onReady(ready: boolean): void;
  takeQueuedInput(): QueuedTypingKey[];
  onDone(): void;
};

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

const headingMark = Decoration.mark({ class: 'us-md-mark' });

/** Heading lines are drawn at their heading size with the `#` marks faded, so the text looks as it will on the slide. */
function headingLook(state: EditorState): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (let n = 1; n <= state.doc.lines; n++) {
    const line = state.doc.line(n);
    const marks = /^(#{1,6})\s/.exec(line.text)?.[1];
    if (!marks) continue;
    builder.add(line.from, line.from, Decoration.line({ class: `us-md-h us-md-h${marks.length}` }));
    builder.add(line.from, line.from + marks.length, headingMark);
  }
  return builder.finish();
}

const headings = StateField.define<DecorationSet>({
  create: headingLook,
  update: (value, transaction) => (transaction.docChanged ? headingLook(transaction.state) : value),
  provide: (field) => EditorView.decorations.from(field),
});

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

export function TypingArea({
  rect, look, maxHeight, text, from, onChange, onUndo, onRedo, onReady, takeQueuedInput, onDone,
}: TypingAreaProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | undefined>(undefined);
  const initialText = useRef(text);
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
          headings,
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
            ...defaultKeymap,
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !update.transactions.some((t) => t.annotation(externalChange))) {
              onChangeRef.current(changedText(update, fromRef.current));
            }
          }),
        ],
      }),
    });
    view.current = editor;
    editor.focus();
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

  const style: CSSProperties = {
    left: rect.x,
    top: rect.y,
    width: rect.width,
    ...(maxHeight === undefined
      ? { height: rect.height }
      : { minHeight: rect.height, maxHeight: Math.max(rect.height, maxHeight) }),
    ...(look && {
      '--us-typing-bg': look.background,
      '--us-typing-fg': look.color,
      '--us-typing-font': look.fontFamily,
      '--us-typing-size': `${look.fontSize}px`,
      '--us-typing-pad': `${look.padding}px`,
    }),
  };
  return <div className={maxHeight === undefined ? 'us-typing-area' : 'us-typing-area us-typing-grow'} ref={host} style={style} />;
}
