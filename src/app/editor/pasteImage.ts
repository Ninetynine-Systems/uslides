import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { blobToDataUri, isEmbeddableType, baseType } from '../../export/packImages';
import { markImageDrop } from './dropMarker';

export const MAX_EMBED_BYTES = 5 * 1024 * 1024;
export const TOO_LARGE_NOTICE =
  'This image is too large to embed (over 5 MB). Use a web link or a file next to the deck instead.';
export const BAD_TYPE_NOTICE = 'Only PNG, JPEG, GIF, WebP, SVG and AVIF images can be embedded.';

const isImage = (f: File) => f.type.startsWith('image/');

/** Inserts `![image](data:…)` at `pos`, on its own line. */
async function insertImages(view: EditorView, files: File[], pos: number, end: number, onNotice: (text: string) => void) {
  const uris: string[] = [];
  for (const file of files) {
    if (file.size > MAX_EMBED_BYTES) {
      onNotice(TOO_LARGE_NOTICE);
    } else if (!isEmbeddableType(file.type)) {
      onNotice(BAD_TYPE_NOTICE);
    } else {
      uris.push(await blobToDataUri(file, baseType(file.type)));
    }
  }
  if (uris.length === 0 || !view.dom.isConnected) return;
  const len = view.state.doc.length; // the text may have changed while the file was read
  pos = Math.min(pos, len);
  end = Math.min(Math.max(end, pos), len);
  const before = pos === view.state.doc.lineAt(pos).from ? '' : '\n';
  const after = end === view.state.doc.lineAt(end).to ? '' : '\n';
  const insert = before + uris.map((u) => `![image](${u})`).join('\n') + after;
  view.dispatch({
    changes: { from: pos, to: end, insert },
    selection: { anchor: pos + insert.length - after.length },
    scrollIntoView: true,
    userEvent: 'input.paste',
  });
}

/**
 * Pasting an image (when there is no text on the clipboard) or dropping image files inserts them as `data:` URIs. Images over 5 MB are refused with a
 * notice. Anything else that is pasted or dropped is left to the editor.
 */
export function pasteImage(options: { onNotice(text: string): void }): Extension {
  return EditorView.domEventHandlers({
    paste(event, view) {
      // Word, Excel and Numbers put a picture of the selection next to the text. The text is what the
      // user copied, so it wins. A screenshot has no text, and its image is embedded. A file copied in
      // Finder carries its own file name as text; that text is not what the user meant, so it is ignored.
      const files = [...(event.clipboardData?.files ?? [])].filter(isImage);
      if (files.length === 0) return false;
      const text = (event.clipboardData?.getData('text/plain') ?? '').trim();
      const names = new Set(files.map((f) => f.name));
      const onlyNames = text.split(/\r?\n/).every((line) => names.has(line.trim()));
      if (text !== '' && !onlyNames) return false;
      event.preventDefault();
      void insertImages(view, files, view.state.selection.main.from, view.state.selection.main.to, options.onNotice);
      return true;
    },
    drop(event, view) {
      const all = [...(event.dataTransfer?.files ?? [])];
      // A drop that holds anything but images (a deck file, say) belongs to the window's drop zone.
      if (all.length === 0 || !all.every(isImage)) return false;
      event.preventDefault();
      markImageDrop(event);
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.selection.main.head;
      void insertImages(view, all, pos, pos, options.onNotice);
      return true;
    },
  });
}
