import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import { Annotation, EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { setDiagnostics, type Diagnostic } from '@codemirror/lint';
import type { Warning } from '../core/types';

/** Marks edits that came from the `value` prop, so they are not reported back through onChange. */
const externalChange = Annotation.define<boolean>();

export type EditorHandle = {
  /** Moves the cursor to a character offset, scrolls it into view and focuses the editor. */
  moveCursorTo(pos: number): void;
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
  }, [warnings, value]);

  useImperativeHandle(ref, () => ({
    moveCursorTo(pos) {
      const v = view.current;
      if (!v) return;
      const anchor = Math.min(Math.max(0, pos), v.state.doc.length);
      v.dispatch({ selection: { anchor }, scrollIntoView: true });
      v.focus();
    },
  }));

  return <div className="editor" ref={host} />;
}
