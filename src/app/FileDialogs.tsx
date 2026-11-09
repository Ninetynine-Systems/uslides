/** "Which version to keep?" when the file and the app both changed. */
export function ConflictDialog({ onChoose }: { onChoose(choice: 'file' | 'mine'): void }) {
  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="conflict-title">
        <p id="conflict-title">This file changed on disk and in the app. Keep which?</p>
        <div className="modal-actions">
          <button type="button" onClick={() => onChoose('file')}>
            Use file
          </button>
          <button type="button" onClick={() => onChoose('mine')}>
            Keep mine
          </button>
        </div>
      </div>
    </div>
  );
}

/** Lists the `.md` files of an opened folder so the user can pick one. */
export function FilePicker({ names, onPick, onCancel }: { names: string[]; onPick(index: number): void; onCancel(): void }) {
  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="pick-title">
        <p id="pick-title">This folder has more than one Markdown file. Open which?</p>
        <div className="modal-list">
          {names.map((n, i) => (
            <button type="button" key={n} onClick={() => onPick(i)}>
              {n}
            </button>
          ))}
        </div>
        <div className="modal-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
