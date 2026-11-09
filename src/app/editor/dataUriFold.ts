import { RangeSetBuilder, type Extension } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { dataUriKb } from '../../export/packImages';

/** `data:` URIs at least this long are folded. */
export const FOLD_MIN_CHARS = 200;

class ChipWidget extends WidgetType {
  constructor(private readonly kb: number, private readonly length: number) {
    super();
  }
  override eq(other: ChipWidget): boolean {
    return other.kb === this.kb && other.length === this.length;
  }
  override toDOM(): HTMLElement {
    const el = document.createElement('span');
    el.className = 'cm-image-chip';
    el.textContent = `🖼 image · ${this.kb} KB`;
    el.title = 'An embedded image. The text is still in the deck.';
    return el;
  }
  override ignoreEvent(): boolean {
    return false;
  }
}

/** A `data:` URI runs until whitespace or the character that closes the image link. */
const URI_END = /[\s)"'<>]/g;

function build(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  let last = 0;
  for (const { from, to } of view.visibleRanges) {
    // Whole lines, so a URI is never cut at the edge of the visible range.
    const start = Math.max(last, view.state.doc.lineAt(from).from);
    const end = view.state.doc.lineAt(to).to;
    const text = view.state.doc.sliceString(start, end);
    let at = text.indexOf('data:');
    while (at >= 0) {
      URI_END.lastIndex = at + 5;
      const stop = URI_END.test(text) ? URI_END.lastIndex - 1 : text.length;
      if (stop - at > FOLD_MIN_CHARS) {
        const uri = text.slice(at, stop);
        builder.add(start + at, start + stop, Decoration.replace({ widget: new ChipWidget(dataUriKb(uri), uri.length) }));
      }
      at = text.indexOf('data:', stop);
    }
    last = end;
  }
  return builder.finish();
}

/**
 * Shows each long `data:` URI as a small chip like "🖼 image · 42 KB". The text underneath is not
 * changed, so copying a selection that spans a chip copies the whole URI. Only the visible lines are scanned.
 */
export function dataUriFold(): Extension {
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = build(view);
      }
      update(u: ViewUpdate) {
        if (u.docChanged || u.viewportChanged) this.decorations = build(u.view);
      }
    },
    {
      decorations: (v) => v.decorations,
      provide: (p) => EditorView.atomicRanges.of((view) => view.plugin(p)?.decorations ?? Decoration.none),
    },
  );
  return [
    plugin,
    EditorView.baseTheme({
      '.cm-image-chip': {
        display: 'inline-block',
        padding: '0 6px',
        borderRadius: '10px',
        background: 'rgb(128 128 128 / 0.2)',
        border: '1px solid rgb(128 128 128 / 0.4)',
        fontSize: '0.85em',
        whiteSpace: 'nowrap',
      },
    }),
  ];
}
