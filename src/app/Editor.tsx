import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import { Annotation, EditorState } from '@codemirror/state';
import {
  EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers,
} from '@codemirror/view';
import {
  defaultKeymap, history, historyKeymap, indentWithTab, isolateHistory, redo as redoCommand, redoDepth, undo as undoCommand,
  undoDepth,
} from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { bracketMatching, indentUnit } from '@codemirror/language';
import { setDiagnostics, type Diagnostic } from '@codemirror/lint';
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search';
import type { EditResult } from '../core/edit';
import type { Warning } from '../core/types';
import { dataUriFold } from './editor/dataUriFold';
import { pasteImage } from './editor/pasteImage';
import { slideDividers } from './editor/slideDividers';

/** Marks edits that came from the `value` prop, so they are not reported back through onChange. */
const externalChange = Annotation.define<boolean>();

export type EditorHandle = {
  /** Applies source changes together so they share one history step. */
  applyEdit(result: EditResult, opts?: { userEvent?: string; focus?: boolean }): void;
  undo(): void;
  redo(): void;
  /** Moves the cursor to a character offset and scrolls it into view. */
  moveCursorTo(pos: number, opts?: { focus?: boolean }): void;
  /** The cursor's character offset. */
  getCursor(): number;
  /** Replaces the text with `text`, changing only the part that differs, as one undoable edit. */
  replaceSource(text: string): void;
};

type Props = {
  value: string;
  onChange(value: string): void;
  onCursorChange?(pos: number): void;
  warnings?: Warning[];
  /** Shows a message to the user (for example that a pasted image is too large). */
  onNotice(text: string): void;
  /** Reports whether there is anything to undo or redo, whenever that changes. */
  onHistoryChange?(canUndo: boolean, canRedo: boolean): void;
  ref?: Ref<EditorHandle>;
};

function toDiagnostics(warnings: Warning[], length: number): Diagnostic[] {
  return warnings.map((w) => {
    const from = Math.min(Math.max(0, w.range.from), length);
    const to = Math.min(Math.max(from, w.range.to), length);
    return { from, to, severity: 'warning', message: w.message };
  });
}

export function Editor({ value, onChange, onCursorChange, warnings = [], onNotice, onHistoryChange, ref }: Props) {
  const onHistoryChangeRef = useRef(onHistoryChange);
  onHistoryChangeRef.current = onHistoryChange;
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | undefined>(undefined);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onCursorChangeRef = useRef(onCursorChange);
  onCursorChangeRef.current = onCursorChange;
  const onNoticeRef = useRef(onNotice);
  onNoticeRef.current = onNotice;
  const initial = useRef(value);

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: initial.current,
        extensions: [
          history(),
          lineNumbers(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          indentUnit.of('  '),
          bracketMatching(),
          highlightSelectionMatches(),
          search(),
          keymap.of([indentWithTab, ...searchKeymap, ...defaultKeymap, ...historyKeymap]),
          markdown(),
          EditorView.lineWrapping,
          dataUriFold(),
          slideDividers(),
          EditorView.contentAttributes.of({ 'aria-label': 'Deck source' }),
          EditorView.updateListener.of((u) => {
            if (u.docChanged && !u.transactions.some((t) => t.annotation(externalChange))) {
              onChangeRef.current(u.state.doc.toString());
            }
            if (u.selectionSet && u.startState.selection.main.head !== u.state.selection.main.head) {
              onCursorChangeRef.current?.(u.state.selection.main.head);
            }
            if (u.transactions.length > 0) {
              const canUndo = undoDepth(u.state) > 0;
              const canRedo = redoDepth(u.state) > 0;
              if (canUndo !== (undoDepth(u.startState) > 0) || canRedo !== (redoDepth(u.startState) > 0)) {
                onHistoryChangeRef.current?.(canUndo, canRedo);
              }
            }
          }),
          pasteImage({ onNotice: (text) => onNoticeRef.current(text) }),
        ],
      }),
    });
    view.current = v;
    onHistoryChangeRef.current?.(false, false);
    return () => {
      v.destroy();
      view.current = undefined;
      onHistoryChangeRef.current?.(false, false);
    };
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
    applyEdit(result, opts) {
      const v = view.current;
      if (!v) return;
      const effectiveChanges = result.changes.filter(
        (change) => change.insert !== v.state.doc.sliceString(change.from, change.to),
      );
      if (effectiveChanges.length === 0 && result.select === undefined) return;
      const changes = v.state.changes(effectiveChanges);
      const select = result.select === undefined ? undefined : Math.min(Math.max(0, result.select), changes.newLength);
      const selectTo = result.selectTo === undefined
        ? undefined
        : Math.min(Math.max(0, result.selectTo), changes.newLength);
      v.dispatch({
        changes,
        ...(select === undefined ? {} : {
          selection: selectTo === undefined ? { anchor: select } : { anchor: select, head: selectTo },
          scrollIntoView: true,
        }),
        ...(opts?.userEvent === undefined ? {} : { userEvent: opts.userEvent }),
        annotations: opts?.userEvent?.startsWith('input.type') ? [] : isolateHistory.of('full'),
      });
      if (opts?.focus) v.focus();
    },
    undo() {
      const v = view.current;
      if (v) undoCommand(v);
    },
    redo() {
      const v = view.current;
      if (v) redoCommand(v);
    },
    moveCursorTo(pos, opts) {
      const v = view.current;
      if (!v) return;
      const anchor = Math.min(Math.max(0, pos), v.state.doc.length);
      v.dispatch({ selection: { anchor }, scrollIntoView: true });
      if (opts?.focus ?? true) v.focus();
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
