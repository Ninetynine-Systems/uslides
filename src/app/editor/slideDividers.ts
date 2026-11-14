import { RangeSetBuilder, StateField, type EditorState, type Extension } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import { slideDividers as findDividers } from '../../core/dividers';

class LabelWidget extends WidgetType {
  constructor(private readonly slide: number, private readonly title: string) {
    super();
  }
  override eq(other: LabelWidget): boolean {
    return other.slide === this.slide && other.title === this.title;
  }
  override toDOM(): HTMLElement {
    const el = document.createElement('span');
    el.className = 'cm-slide-label';
    el.textContent = this.title ? `Slide ${this.slide} · ${this.title}` : `Slide ${this.slide}`;
    // The label is a picture of what the `---` line means. Screen readers already read the line itself.
    el.setAttribute('aria-hidden', 'true');
    return el;
  }
}

const dividerLine = Decoration.line({ class: 'cm-slide-divider' });

function build(state: EditorState): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const divider of findDividers(state.doc.toString())) {
    if (divider.pos > state.doc.length) break;
    const line = state.doc.lineAt(divider.pos);
    builder.add(line.from, line.from, dividerLine);
    builder.add(line.to, line.to, Decoration.widget({ widget: new LabelWidget(divider.slide, divider.title), side: 1 }));
  }
  return builder.finish();
}

/**
 * Draws each `---` line that starts a slide as a rule across the editor, with the number and title of
 * the slide that follows. The text is not changed: the line is still three dashes.
 */
export function slideDividers(): Extension {
  return StateField.define<DecorationSet>({
    create: build,
    update: (decorations, transaction) => (transaction.docChanged ? build(transaction.state) : decorations),
    provide: (field) => EditorView.decorations.from(field),
  });
}
