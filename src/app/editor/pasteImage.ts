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
async function insertImages(view: EditorView, files: File[], pos: number, onNotice: (text: string) => void) {
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
  pos = Math.min(pos, view.state.doc.length); // the text may have changed while the file was read
  const line = view.state.doc.lineAt(pos);
  const before = pos === line.from ? '' : '\n';
  const after = pos === line.to ? '' : '\n';
  const insert = before + uris.map((u) => `![image](${u})`).join('\n') + after;
  view.dispatch({
    changes: { from: pos, insert },
    selection: { anchor: pos + insert.length - after.length },
    scrollIntoView: true,
    userEvent: 'input.paste',
  });
}

/**
 * Pasting or dropping an image file inserts it as a `data:` URI. Images over 5 MB are refused with a
 * notice. Anything else that is pasted or dropped is left to the editor.
 */
export function pasteImage(options: { onNotice(text: string): void }): Extension {
  return EditorView.domEventHandlers({
    paste(event, view) {
      const files = [...(event.clipboardData?.files ?? [])].filter(isImage);
      if (files.length === 0) return false;
      event.preventDefault();
      void insertImages(view, files, view.state.selection.main.head, options.onNotice);
      return true;
    },
    drop(event, view) {
      const all = [...(event.dataTransfer?.files ?? [])];
      // A drop that holds anything but images (a deck file, say) belongs to the window's drop zone.
      if (all.length === 0 || !all.every(isImage)) return false;
      event.preventDefault();
      markImageDrop(event);
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.selection.main.head;
      void insertImages(view, all, pos, options.onNotice);
      return true;
    },
  });
}
