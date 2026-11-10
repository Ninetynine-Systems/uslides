import { useEffect, useRef, type CSSProperties } from 'react';
import { Annotation, EditorState } from '@codemirror/state';
import { EditorView, keymap, runScopeHandlers, type ViewUpdate } from '@codemirror/view';
import { defaultKeymap } from '@codemirror/commands';
import type { Edit } from '../../core/edit';

const externalChange = Annotation.define<boolean>();

export type QueuedTypingKey = {
  key: string;
  altKey: boolean;
  shiftKey: boolean;
};

export type TypingAreaProps = {
  rect: DOMRect;
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
  rect, text, from, onChange, onUndo, onRedo, onReady, takeQueuedInput, onDone,
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
          EditorView.contentAttributes.of({ 'aria-label': 'Markdown on slide' }),
          keymap.of([
            { key: 'Mod-z', run: () => (onUndoRef.current(), true) },
            { key: 'Mod-Shift-z', run: () => (onRedoRef.current(), true) },
            { key: 'Mod-y', run: () => (onRedoRef.current(), true) },
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
    height: rect.height,
  };
  return <div className="us-typing-area" ref={host} style={style} />;
}
