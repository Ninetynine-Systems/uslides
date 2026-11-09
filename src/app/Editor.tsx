import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import { Annotation, EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, isolateHistory } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { setDiagnostics, type Diagnostic } from '@codemirror/lint';
import type { Warning } from '../core/types';
import { dataUriFold } from './editor/dataUriFold';

/** Marks edits that came from the `value` prop, so they are not reported back through onChange. */
const externalChange = Annotation.define<boolean>();

export type EditorHandle = {
  /** Moves the cursor to a character offset, scrolls it into view and focuses the editor. */
  moveCursorTo(pos: number): void;
  /** The cursor's character offset. */
  getCursor(): number;
  /** Replaces the text with `text`, changing only the part that differs, as one undoable edit. */
  replaceSource(text: string): void;
};

type Props = {
  value: string;
  onChange(value: string): void;
  warnings?: Warning[];
  extensions?: Extension[];
  ref?: Ref<EditorHandle>;
};

function toDiagnostics(warnings: Warning[], length: number): Diagnostic[] {
  return warnings.map((w) => {
    const from = Math.min(Math.max(0, w.range.from), length);
    const to = Math.min(Math.max(from, w.range.to), length);
    return { from, to, severity: 'warning', message: w.message };
  });
}

export function Editor({ value, onChange, warnings = [], extensions = [], ref }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | undefined>(undefined);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const initial = useRef(value);

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: initial.current,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          markdown(),
          EditorView.lineWrapping,
          dataUriFold(),
          EditorView.contentAttributes.of({ 'aria-label': 'Deck source' }),
          EditorView.updateListener.of((u) => {
            if (u.docChanged && !u.transactions.some((t) => t.annotation(externalChange))) {
              onChangeRef.current(u.state.doc.toString());
            }
          }),
          ...extensions,
        ],
      }),
    });
    view.current = v;
    return () => {
      v.destroy();
      view.current = undefined;
    };
    // The extensions are fixed for the life of the editor.
  }, []);

  // Text replaced from outside (opening another deck, a conflict, a reload from another tab).
  useEffect(() => {
    const v = view.current;
    if (!v || v.state.doc.toString() === value) return;
    v.dispatch({
      changes: { from: 0, to: v.state.doc.length, insert: value },
      selection: { anchor: Math.min(v.state.selection.main.head, value.length) },
      annotations: externalChange.of(true),
    });
  }, [value]);

  // Warnings are applied after the text, so their ranges match the document.
  useEffect(() => {
    const v = view.current;
    if (v) v.dispatch(setDiagnostics(v.state, toDiagnostics(warnings, v.state.doc.length)));
  }, [warnings]);

  useImperativeHandle(ref, () => ({
    moveCursorTo(pos) {
      const v = view.current;
      if (!v) return;
      const anchor = Math.min(Math.max(0, pos), v.state.doc.length);
      v.dispatch({ selection: { anchor }, scrollIntoView: true });
      v.focus();
    },
    getCursor: () => view.current?.state.selection.main.head ?? 0,
    replaceSource(text) {
      const v = view.current;
      if (!v) return;
      const old = v.state.doc.toString();
      let from = 0;
      while (from < old.length && from < text.length && old.charCodeAt(from) === text.charCodeAt(from)) from++;
      let tail = 0;
      while (
        tail < old.length - from && tail < text.length - from &&
        old.charCodeAt(old.length - 1 - tail) === text.charCodeAt(text.length - 1 - tail)
      ) tail++;
      v.dispatch({
        changes: { from, to: old.length - tail, insert: text.slice(from, text.length - tail) },
        userEvent: 'input',
        // Its own undo step, even right after typing.
        annotations: isolateHistory.of('full'),
      });
    },
  }));

  return <div className="editor" ref={host} />;
}
