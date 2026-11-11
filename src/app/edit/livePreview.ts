import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { syntaxTree } from '@codemirror/language';
import { EditorSelection, type EditorState, type Extension, type Range } from '@codemirror/state';
import {
  Decoration, EditorView, ViewPlugin, WidgetType, type Command, type DecorationSet, type ViewUpdate,
} from '@codemirror/view';

/**
 * Typing on a slide shows text the way the slide does: bold is bold, headings are large, bullets are dots.
 * The Markdown marks stay in the text and appear again where the cursor is, so they can still be edited.
 */

const hidden = Decoration.replace({});
const faded = Decoration.mark({ class: 'us-md-mark' });

class BulletWidget extends WidgetType {
  eq(): boolean {
    return true;
  }
  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'us-md-bullet';
    span.textContent = '•';
    return span;
  }
}

class ImageWidget extends WidgetType {
  constructor(readonly alt: string) {
    super();
  }
  eq(other: ImageWidget): boolean {
    return other.alt === this.alt;
  }
  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'us-md-image';
    span.textContent = this.alt ? `Image: ${this.alt}` : 'Image';
    return span;
  }
}

const bullet = Decoration.replace({ widget: new BulletWidget() });

const INLINE: Record<string, { cls: string; mark: string }> = {
  StrongEmphasis: { cls: 'us-md-strong', mark: 'EmphasisMark' },
  Emphasis: { cls: 'us-md-em', mark: 'EmphasisMark' },
  Strikethrough: { cls: 'us-md-strike', mark: 'StrikethroughMark' },
  InlineCode: { cls: 'us-md-code', mark: 'CodeMark' },
};

function build(state: EditorState): DecorationSet {
  const ranges = state.selection.ranges;
  /** True when the cursor or selection is inside or right next to this range. */
  const touches = (from: number, to: number) => ranges.some((r) => r.from <= to && r.to >= from);
  const decorations: Range<Decoration>[] = [];
  const doc = state.doc;

  /** Hides a mark and the spaces after it, or fades it where the cursor is. */
  const markAt = (from: number, to: number, show: boolean, spaces = false) => {
    let end = to;
    if (spaces) while (end < doc.length && doc.sliceString(end, end + 1) === ' ') end++;
    if (end <= from) return;
    decorations.push((show ? faded : hidden).range(from, end));
  };

  syntaxTree(state).iterate({
    enter(node) {
      const name = node.name;
      const heading = /^ATXHeading(\d)$/.exec(name);
      if (heading) {
        const line = doc.lineAt(node.from);
        decorations.push(Decoration.line({ class: `us-md-h us-md-h${heading[1]}` }).range(line.from));
        const show = touches(line.from, line.to);
        for (let child = node.node.firstChild; child; child = child.nextSibling) {
          if (child.name === 'HeaderMark') markAt(child.from, child.to, show, child.from === node.from);
        }
        return;
      }
      const inline = INLINE[name];
      if (inline) {
        decorations.push(Decoration.mark({ class: inline.cls }).range(node.from, node.to));
        const show = touches(node.from, node.to);
        for (let child = node.node.firstChild; child; child = child.nextSibling) {
          if (child.name === inline.mark) markAt(child.from, child.to, show);
        }
        return name !== 'InlineCode';
      }
      if (name === 'Link') {
        decorations.push(Decoration.mark({ class: 'us-md-link' }).range(node.from, node.to));
        const show = touches(node.from, node.to);
        const marks = node.node.getChildren('LinkMark');
        // Everything from "](" to the end is the address: hidden with the brackets.
        if (marks[0]) markAt(marks[0].from, marks[0].to, show);
        if (marks[1]) markAt(marks[1].from, node.to, show);
        return;
      }
      if (name === 'Image') {
        if (touches(node.from, node.to)) return false;
        const alt = /^!\[([^\]]*)\]/.exec(doc.sliceString(node.from, Math.min(node.to, node.from + 300)))?.[1] ?? '';
        decorations.push(Decoration.replace({ widget: new ImageWidget(alt) }).range(node.from, node.to));
        return false;
      }
      if (name === 'Blockquote') {
        for (let pos = node.from; pos <= node.to;) {
          const line = doc.lineAt(pos);
          decorations.push(Decoration.line({ class: 'us-md-quote' }).range(line.from));
          pos = line.to + 1;
        }
        return;
      }
      if (name === 'QuoteMark') {
        const line = doc.lineAt(node.from);
        markAt(node.from, node.to, touches(line.from, line.to), true);
        return;
      }
      if (name === 'ListItem') {
        decorations.push(Decoration.line({ class: 'us-md-li' }).range(doc.lineAt(node.from).from));
        return;
      }
      if (name === 'ListMark' && node.node.parent?.parent?.name === 'BulletList') {
        // The bullet stays a dot with the cursor at the start of the line; it shows as "-" right after it.
        if (touches(node.from + 1, node.to + 1)) decorations.push(faded.range(node.from, node.to));
        else decorations.push(bullet.range(node.from, node.to));
        return;
      }
      if (name === 'FencedCode' || name === 'CodeBlock') {
        for (let pos = node.from; pos <= node.to;) {
          const line = doc.lineAt(pos);
          decorations.push(Decoration.line({ class: 'us-md-codeblock' }).range(line.from));
          pos = line.to + 1;
        }
        return false;
      }
    },
  });
  return Decoration.set(decorations, true);
}

const livePreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = build(view.state);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || syntaxTree(update.startState) !== syntaxTree(update.state)) {
        this.decorations = build(update.state);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

/** Markdown parsing (with tables and strikethrough), list continuation on Enter, and the live preview. */
export function livePreview(): Extension {
  return [markdown({ base: markdownLanguage }), livePreviewPlugin];
}

/** Which formats apply at the cursor, for the pressed state of the format buttons. */
export type ActiveFormats = { bold: boolean; italic: boolean; heading: boolean; list: boolean };

export function activeFormats(state: EditorState): ActiveFormats {
  const head = state.selection.main.head;
  const result: ActiveFormats = { bold: false, italic: false, heading: false, list: false };
  for (let node: ReturnType<typeof syntaxTree>['topNode'] | null = syntaxTree(state).resolveInner(head, -1); node; node = node.parent) {
    if (node.name === 'StrongEmphasis') result.bold = true;
    else if (node.name === 'Emphasis') result.italic = true;
    else if (node.name.startsWith('ATXHeading')) result.heading = true;
    else if (node.name === 'BulletList') result.list = true;
  }
  const line = state.doc.lineAt(head);
  if (/^#{1,6}\s/.test(line.text)) result.heading = true;
  if (/^\s*[-*+]\s/.test(line.text)) result.list = true;
  return result;
}

/** Wraps the selection in a mark such as `**`, or removes the mark when it is already there. */
function toggleWrap(mark: string): Command {
  return (view) => {
    const { state } = view;
    const changes = state.changeByRange((range) => {
      const n = mark.length;
      const before = state.sliceDoc(range.from - n, range.from);
      const after = state.sliceDoc(range.to, range.to + n);
      // A single * next to a ** belongs to bold, not italic.
      const isBoldStar = n === 1 && state.sliceDoc(range.from - 2, range.from) === '**'
        && state.sliceDoc(range.from - 3, range.from) !== '***';
      if (before === mark && after === mark && !isBoldStar) {
        return {
          changes: [{ from: range.from - n, to: range.from }, { from: range.to, to: range.to + n }],
          range: EditorSelection.range(range.from - n, range.to - n),
        };
      }
      const inner = state.sliceDoc(range.from, range.to);
      if (inner.length > 2 * n && inner.startsWith(mark) && inner.endsWith(mark)) {
        return {
          changes: { from: range.from, to: range.to, insert: inner.slice(n, -n) },
          range: EditorSelection.range(range.from, range.to - 2 * n),
        };
      }
      return {
        changes: [{ from: range.from, insert: mark }, { from: range.to, insert: mark }],
        range: EditorSelection.range(range.from + n, range.to + n),
      };
    });
    view.dispatch(state.update(changes, { scrollIntoView: true, userEvent: 'input' }));
    return true;
  };
}

export const toggleBold = toggleWrap('**');
export const toggleItalic = toggleWrap('*');

/** Changes the prefix of every line in the selection with `next`, which gets each line's text. */
function editLines(view: EditorView, next: (text: string, all: string[]) => string): boolean {
  const { state } = view;
  const { from, to } = state.selection.main;
  const first = state.doc.lineAt(from).number;
  const last = state.doc.lineAt(to).number;
  const lines = [];
  for (let n = first; n <= last; n++) lines.push(state.doc.line(n));
  const texts = lines.map((line) => line.text);
  const changes = lines
    .map((line) => ({ from: line.from, to: line.to, insert: next(line.text, texts) }))
    .filter((change, i) => change.insert !== texts[i]);
  if (changes.length === 0) return true;
  view.dispatch({ changes, userEvent: 'input' });
  return true;
}

/** Plain text, then title, then heading, then subheading, then plain text again. */
export const cycleHeading: Command = (view) => editLines(view, (text) => {
  const level = /^(#{1,6})\s+/.exec(text)?.[1]?.length ?? 0;
  const body = text.replace(/^#{1,6}\s+/, '');
  return level >= 3 ? body : `${'#'.repeat(level + 1)} ${body}`;
});

/** Makes the lines a bulleted list, or plain lines when they all are bullets already. */
export const toggleBullets: Command = (view) => editLines(view, (text, all) => {
  const isBullet = (line: string) => /^\s*[-*+]\s/.test(line);
  const nonEmpty = all.filter((line) => line.trim() !== '');
  if (nonEmpty.length > 0 && nonEmpty.every(isBullet)) return text.replace(/^(\s*)[-*+]\s/, '$1');
  if (text.trim() === '' && all.length > 1) return text;
  return isBullet(text) ? text : text.replace(/^(\s*)/, '$1- ');
});
