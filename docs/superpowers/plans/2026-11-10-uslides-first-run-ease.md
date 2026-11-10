# uslides: Easier First Run Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the first minutes in uslides need no reading: a smaller toolbar, an "Add slide" button, a hint on the slide, rename by clicking the name, and delete with Undo.

**Architecture:** No new capability and no new dependency. Storage gains a `deletedAt` field on the deck record. `src/core/edit.ts` gains one pure function that inserts a slide. Everything else is changes to existing React components in `src/app/`.

**Tech Stack:** Vite, React 19, TypeScript strict, CodeMirror 6, idb, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-10-uslides-first-run-ease-design.md`

## Global Constraints

- Work on a new branch `feat/first-run-ease`, cut from `main`. Do not push.
- No new dependencies.
- TypeScript strict, no `any`. Plain-English comments. Small focused functions.
- `src/core/**` must not contain `from 'react'`, `/render/`, `/app/`, `window.` or `document.` (a unit test checks this).
- No change to the Markdown format, the exported HTML file, print output or present mode. The image-snapshot tests in `tests/e2e/render.spec.ts` must pass unchanged.
- Every existing action stays reachable in at most two clicks.
- `window.prompt` and `window.confirm` are removed from rename and delete. Do not add new ones.
- Do not weaken or delete an existing test. A test may change only because the behaviour was meant to change; say so in the report.
- Before each Playwright run, check `lsof -iTCP:4173 -sTCP:LISTEN` and kill anything listening. Never leave a server running.
- Gate before each commit: `npx vitest run`, `npm run typecheck`, `npm run lint`, and the Playwright specs the task names plus any spec the change could affect.
- Never add `Co-Authored-By`, "Generated with", or any other AI attribution to a commit.
- Exact user-facing strings in this plan are to be used verbatim.

## Review Focus

Inputs the spec implies but does not spell out. Each has a test in the task named.

1. **Undo after moving on.** The person deletes deck A, lands on deck B, types in B, then clicks Undo. B's typing must be saved, and A must open with its text and images intact. (Task 4)
2. **Start-up cleanup versus a fresh delete in another tab.** A deck deleted 5 seconds ago in tab 1 must survive tab 2 starting up, so Undo in tab 1 still works. Only decks deleted more than 60 seconds ago are removed. (Task 1)
3. **Leaving the rename field by clicking another control.** Clicking "More" or "Present" while the field is open saves the name first, then does the click. A name of only spaces changes nothing. (Task 2)
4. **Inserting a slide where the text has no final line break**, and after a slide that has a speaker note. The note stays with its slide and the result parses to exactly one more slide. (Task 5)
5. **Browser storage that throws** (private windows). The hint still shows, the app does not crash, and drawing a box still works. (Task 7)

---

### Task 1: Storage: mark, restore and clean up deleted decks

**Files:**
- Modify: `src/storage/db.ts`
- Test: `tests/unit/db.test.ts`, `tests/unit/backup.test.ts`

**Interfaces:**
- Produces:
  - `DeckRecord.deletedAt?: number`
  - `markDeckDeleted(id: string, now?: number): Promise<void>` sets `deletedAt`. Changes nothing else, including `updatedAt` and `revision`. Does nothing if the deck is missing.
  - `restoreDeck(id: string): Promise<DeckRecord | undefined>` removes `deletedAt` and returns the record, or `undefined` if the deck is gone.
  - `purgeDeletedDecks(olderThanMs: number, now?: number): Promise<number>` permanently removes every deck whose `deletedAt <= now - olderThanMs`, with its images, and returns how many.
  - `listDecks()`, `getAllDecks()` and `getDeck(id)` leave out decks that have `deletedAt`. `getDeck` returns `undefined` for them.
  - `deleteDeck(id)` is unchanged: it removes for good.
- No database version change. `deletedAt` is a plain field.

- [ ] **Step 1: Write the failing tests** in `tests/unit/db.test.ts`:

```ts
test('a deck marked deleted is hidden but not removed', async () => {
  const deck = await createDeck('# A');
  await putImage(deck.id, 'a.png', new Blob(['x'], { type: 'image/png' }));
  await markDeckDeleted(deck.id, 1000);
  expect(await listDecks()).toEqual([]);
  expect(await getAllDecks()).toEqual([]);
  expect(await getDeck(deck.id)).toBeUndefined();
  expect((await getImages(deck.id)).size).toBe(1);
});

test('restoreDeck brings it back unchanged', async () => {
  const deck = await createDeck('# A');
  await markDeckDeleted(deck.id, 1000);
  const back = await restoreDeck(deck.id);
  expect(back).toEqual(deck); // no deletedAt key, same revision and updatedAt
  expect((await listDecks()).map((d) => d.id)).toEqual([deck.id]);
});

test('restoreDeck returns undefined once the deck is gone', async () => {
  const deck = await createDeck('# A');
  await deleteDeck(deck.id);
  expect(await restoreDeck(deck.id)).toBeUndefined();
});

test('purgeDeletedDecks removes only decks deleted long enough ago', async () => {
  const old = await createDeck('# Old');
  const fresh = await createDeck('# Fresh');
  const kept = await createDeck('# Kept');
  await putImage(old.id, 'a.png', new Blob(['x'], { type: 'image/png' }));
  await markDeckDeleted(old.id, 0);
  await markDeckDeleted(fresh.id, 95_000);
  expect(await purgeDeletedDecks(60_000, 100_000)).toBe(1);
  expect((await getImages(old.id)).size).toBe(0);
  expect(await restoreDeck(old.id)).toBeUndefined();
  expect((await restoreDeck(fresh.id))?.id).toBe(fresh.id);
  expect((await listDecks()).map((d) => d.id).sort()).toEqual([fresh.id, kept.id].sort());
});
```

In `tests/unit/backup.test.ts`: create two decks, mark one deleted, call `exportBackup()`, parse the JSON, and expect `decks` to have length 1 with the surviving deck's `source`.

- [ ] **Step 2: Run** `npx vitest run tests/unit/db.test.ts tests/unit/backup.test.ts`. Expected: FAIL, `markDeckDeleted` is not exported.
- [ ] **Step 3: Implement** the three functions and the filters in `src/storage/db.ts`. `saveDeck`, `renameDeck`, `duplicateDeck` and `updateDeckMeta` keep reading the raw record; do not filter inside them.
- [ ] **Step 4: Run** the same command. Expected: PASS. Then run the full gate.
- [ ] **Step 5: Commit** `feat(storage): mark, restore and clean up deleted decks`

---

### Task 2: Rename by clicking the deck name

**Files:**
- Create: `src/app/DeckName.tsx`
- Modify: `src/app/Toolbar.tsx`, `src/app/App.tsx`, `src/app/app.css`
- Test: `tests/e2e/rename.spec.ts` (new), and any existing spec that clicks the "Rename" button

**Interfaces:**
- Produces: `DeckName({ name, disabled, onRename }: { name: string; disabled: boolean; onRename(title: string): void })`.
  - Renders `<h1 className="toolbar-name">` holding a button whose accessible name is `Rename deck: ${name}` and whose visible text is the name.
  - Click, Enter or F2 on the button swaps it for `<input aria-label="Deck name">` holding the name, with all text selected.
  - Enter or blur: if the trimmed value is non-empty and differs from `name`, call `onRename(trimmed)`. Then return to the button.
  - Escape: return to the button without calling `onRename`, and put focus back on the button.
  - `disabled` renders plain text in the `h1`, as today.
- `Toolbar` prop `onRename(): void` becomes `onRename(title: string): void`. The "Rename" icon button is removed.
- `App.rename` becomes `rename(title: string)`: same body as today without `window.prompt`. `disabled` is `!deckId || !ready`.

- [ ] **Step 1: Write the failing tests** in `tests/e2e/rename.spec.ts`:
  - click the name, type `Quarterly plan`, press Enter: the `h1` reads `Quarterly plan`, the deck list reads `Quarterly plan`, and after a reload both still do.
  - click the name, type `X`, press Escape: the name is unchanged.
  - click the name, clear the field, type three spaces, press Enter: the name is unchanged.
  - click the name, type `Saved by blur`, click the "Present" button: the name is `Saved by blur` and present mode opened. Press Escape to leave it. (Review Focus 3)
  - focus the name button with the keyboard, press F2: the field opens with all text selected (typing one character replaces the whole name).
  - assert no browser dialog opens during any of the above (`page.on('dialog', ...)` fails the test).
- [ ] **Step 2: Run** `npx playwright test tests/e2e/rename.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Update existing specs that used the Rename button and a dialog handler to rename through the name instead; put the steps in a new `tests/e2e/helpers/app.ts` exporting `renameDeck(page: Page, title: string): Promise<void>`.
- [ ] **Step 4: Run** the full gate with all Playwright specs. Expected: PASS.
- [ ] **Step 5: Commit** `feat(app): rename a deck by clicking its name`

---

### Task 3: Smaller toolbar with a More menu

**Files:**
- Create: `src/app/Menu.tsx`
- Modify: `src/app/Toolbar.tsx`, `src/app/IconButton.tsx`, `src/app/app.css`, `tests/e2e/helpers/app.ts`
- Test: `tests/e2e/toolbar.spec.ts` (new), plus every existing spec that clicks a moved button

**Interfaces:**
- Produces:
  - `LabelButton` in `src/app/IconButton.tsx`: same props as `IconButton`. Shows the icon and the label as text. Class `label-btn`, plus `primary` when passed in `className`. Below 768px the text is hidden with CSS and the accessible name stays.
  - `Menu({ label, icon, children }: { label: string; icon: ComponentType<IconProps>; children: (close: () => void) => ReactNode })` in `src/app/Menu.tsx`: an `IconButton` trigger with `aria-haspopup` and `aria-expanded`, and a panel shown while open. Closes on Escape (focus returns to the trigger), on choosing an item, and on a pointer press outside it.
  - `ShareMenu`, `DownloadMenu` and `LinkedBadge` gain the same close-on-outside-press behaviour. Share uses `LabelButton`.
  - Test helper `moreMenu(page: Page, item: string): Promise<void>` clicks "More" and then the named item.
- Toolbar order, left to right: decks toggle, deck name, access warning and linked badge (unchanged), `Deck font` (icon), `Download` (icon, menu unchanged), `Share` (LabelButton), `Present` (LabelButton, `primary`), `More` (icon `Ellipsis`).
- More menu items, verbatim, in order: `Open file`, `Open folder` (only when `onOpenFolder` is defined), `Pack images`, `Duplicate deck`, then a separator line, then `Delete deck` (class `danger`).
- `Toolbar` props do not change in this task.

- [ ] **Step 1: Write the failing tests** in `tests/e2e/toolbar.spec.ts`:
  - the toolbar has buttons named exactly `Deck font`, `Download`, `Share`, `Present`, `More`, and has no buttons named `Open`, `Open folder`, `Pack images`, `Duplicate`, `Delete`.
  - `Present` and `Share` show their words as visible text at 1280px wide; at 600px wide the words are not visible and `getByRole('button', { name: 'Present' })` still resolves.
  - opening More shows menu items in the exact order above.
  - More closes on Escape and focus is on the More button; closes on a click in the preview; closes after choosing `Duplicate deck`, and the deck list then has two decks.
  - with Share open, a click in the preview closes it. Same for Download.
- [ ] **Step 2: Run** `npx playwright test tests/e2e/toolbar.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Then change every existing spec that clicks `Open`, `Open folder`, `Pack images`, `Duplicate` or `Delete` in the toolbar to call `moreMenu(page, ...)`. About 21 call sites; find them with `grep -rn "name: '\(Open\|Open folder\|Pack images\|Duplicate\|Delete\)'" tests/e2e`. The floating bar on a selected box also has `Duplicate` and `Delete`; leave those call sites alone.
- [ ] **Step 4: Run** the full gate with all Playwright specs. Expected: PASS.
- [ ] **Step 5: Commit** `feat(app): smaller toolbar with a More menu`

---

### Task 4: Delete with Undo

**Files:**
- Modify: `src/app/App.tsx`, `src/app/useDeck.ts`
- Test: `tests/e2e/delete-undo.spec.ts` (new), plus existing specs that accept a delete dialog

**Interfaces:**
- Consumes: `markDeckDeleted`, `restoreDeck`, `purgeDeletedDecks`, `deleteDeck` (Task 1); `moreMenu` (Task 3); `notify(text, { action, onDismiss })` from `src/app/Notices.tsx`.
- Produces:
  - `useDeck` returns `announceListChange(): void`, which posts `{ type: 'list' }` on the existing `uslides` channel. A tab receiving it calls `onChanged()` and nothing else.
  - `App.remove()`: no confirm. Same order as today (pick or create the next deck, `discard()`, `openDeck(nextId)`), but calls `markDeckDeleted(id)` in place of `deleteDeck(id)`. Then `refreshList()`, `announceListChange()`, and `notify(`Deleted "${name}".`, { action: { label: 'Undo', run }, onDismiss })`.
  - Undo `run`: set a local `undone` flag, `await flush()`, `restoreDeck(id)`; if it returns a record, `openDeck(id)`, `refreshList()`, `announceListChange()`, then dismiss the notice. If it returns `undefined`, notify `That deck could not be restored.`
  - `onDismiss`: if `undone` is false, `deleteDeck(id)`.
  - On start-up, before `pickInitialDeck()`: `await purgeDeletedDecks(60_000)`. A failure here must not stop the app from starting.
- The notice text is `Deleted "<name>".` and the button is `Undo`, verbatim. The notice lasts the default 8 seconds.
- The deck that was auto-created because the last deck was deleted stays after Undo. Do not remove it.

- [ ] **Step 1: Write the failing tests** in `tests/e2e/delete-undo.spec.ts`. Fail the test on any browser dialog.
  - delete via `moreMenu(page, 'Delete deck')`: the notice `Deleted "Welcome to uslides".` shows with an `Undo` button, and the deck list no longer has that deck.
  - delete, click Undo: the deck is back in the list and open, with its original text in the editor. Reload: still there.
  - (Review Focus 1) create a second deck with a stored image and the text `# Keep me`; delete it; in the deck now open, type ` typed after delete` at the end; click Undo. The restored deck is open and its image renders. Open the other deck: its text ends with `typed after delete`.
  - delete, click the notice's `Dismiss` button, reload: the deck is gone. Check through `page.evaluate` that the `decks` store has no record with that id.
  - delete, wait for the notice to go away by itself (use `page.clock` to advance 8 seconds), reload: the deck is gone.
  - two tabs in one browser context: delete in tab 1; tab 2's deck list drops the deck without a reload.
  - delete in tab 1, then open a new tab 3 within the Undo window; Undo in tab 1 still restores the deck. (Review Focus 2, end to end)
- [ ] **Step 2: Run** `npx playwright test tests/e2e/delete-undo.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Remove the `dialog` accept handlers from existing specs that delete a deck.
- [ ] **Step 4: Run** the full gate with all Playwright specs. Expected: PASS.
- [ ] **Step 5: Commit** `feat(app): delete a deck with Undo, no confirm dialog`

---

### Task 5: Core: insert a slide

**Files:**
- Modify: `src/core/edit.ts`, `src/app/Editor.tsx`
- Test: `tests/unit/edit.test.ts`

**Interfaces:**
- Produces:
  - `EditResult` gains `selectTo?: number`. When both `select` and `selectTo` are set, the selection runs from `select` to `selectTo`.
  - `insertSlideAfter(source: string, slide: Slide | undefined): EditResult`.
    - With a slide: one change, inserted at the end of that slide's full source text, including any speaker notes and trailing comment that belong to it. That is the offset just before the next slide's `---` line, or the end of the text for the last slide.
    - With `undefined` (a deck with no slides): inserted at the end of the text, after any settings block.
    - The inserted text is a slide break, a blank line, and the line `# New slide`, with line breaks added before and after as needed so the result has exactly one blank line around the `---` and the file ends with one line break.
    - `select` and `selectTo` are the offsets of `New slide` in the new text (9 characters apart).
  - `Editor.applyEdit` honours `selectTo`: selection `{ anchor: select, head: selectTo }`, both clamped as `select` is today.

- [ ] **Step 1: Write the failing tests** in `tests/unit/edit.test.ts`. Use a helper `apply(source, result)` that applies `changes` and returns the new text (the file likely has one; reuse it). For each case assert all four of: `parseDeck(after).slides.length === before + 1`; the new slide is at index `slide.index + 1` and its title is `New slide`; `after.slice(result.select, result.selectTo) === 'New slide'`; every other slide's rendered Markdown and notes are unchanged.

| Case | Source |
|---|---|
| middle slide | `# A\n\n---\n\n# B\n`, insert after slide 0 |
| last slide | `# A\n\n---\n\n# B\n`, insert after slide 1 |
| no final line break (Review Focus 4) | `# A\n\n---\n\n# B`, insert after slide 1 |
| slide with a note (Review Focus 4) | `# A\n\n<!-- note: say hi -->\n\n---\n\n# B\n`, insert after slide 0; slide 0 still has notes `['say hi']` and the new slide has none |
| settings block | `---\ntitle: T\n---\n\n# A\n`, insert after slide 0; the first five lines of the text are unchanged |
| slide ending in a box | `# A\n\n::: box col=1-6 row=2-6\nhi\n:::\n`, insert after slide 0; slide 0 still has one box |
| empty deck | `''` with `undefined`; result is one slide titled `New slide` |

  Also: for the "last slide" case assert `after.endsWith('# New slide\n')` and `!after.includes('\n\n\n')`.

- [ ] **Step 2: Run** `npx vitest run tests/unit/edit.test.ts`. Expected: FAIL, `insertSlideAfter` is not exported.
- [ ] **Step 3: Implement.** Read `src/core/split.ts` and `src/core/slide.ts` first to learn where a slide's source ends. If `Slide` does not expose that offset, add a field to it there and cover it in `tests/unit/slide.test.ts`; do not re-scan for `---` in `edit.ts`.
- [ ] **Step 4: Run** the same command, then the full gate. Expected: PASS.
- [ ] **Step 5: Commit** `feat(core): insert a slide after another`

---

### Task 6: Add slide buttons

**Files:**
- Modify: `src/app/Preview.tsx`, `src/app/App.tsx`, `src/app/app.css`
- Test: `tests/e2e/add-slide.spec.ts` (new)

**Interfaces:**
- Consumes: `insertSlideAfter`, `EditResult.selectTo` (Task 5); `Preview`'s existing `onEdit`, `onSelectSlide`, `editable`.
- Produces:
  - In the bar above the preview, directly after "Add box": `IconButton` labelled `Add slide`. It inserts after the shown slide.
  - In the all-slides view, after the last slide card: a full-width dashed button with visible text `Add slide`, class `add-slide-end`, accessible name `Add slide at the end`. It inserts after the last slide.
  - Both show only when `editable && deck`.
  - After the insert, the new slide is the shown slide, the preview scrolls it into view, and the editor has focus with `New slide` selected.
- Go through `onEdit` so an open typing area commits first and the insert is one undo step, as "Add box" does.

- [ ] **Step 1: Write the failing tests** in `tests/e2e/add-slide.spec.ts`, on the sample deck (4 slides):
  - click `Add slide at the end`: the count reads `5 slides`, slide 5's heading is `New slide`, and slide 5 is in the viewport.
  - straight after, type `Roadmap` on the keyboard: slide 5's heading is `Roadmap`.
  - click slide 2, click `Add slide` in the bar: count is `5 slides`, slide 3's heading is `New slide`, and slide 4 is the old slide 3 (it has the text `Left box`).
  - after an insert, press the undo shortcut once: count is `4 slides` and the text equals the original.
  - in the one-slide view: `Add slide` shows the new slide; `Add slide at the end` is not present.
  - select a box, double-click it, type `draft`, then click `Add slide`: the box still contains `draft` and the count went up by one.
  - at 600px wide, neither button is present.
- [ ] **Step 2: Run** `npx playwright test tests/e2e/add-slide.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the full gate with all Playwright specs. Expected: PASS.
- [ ] **Step 5: Commit** `feat(app): Add slide buttons in the preview`

---

### Task 7: Hint on a slide with no boxes

**Files:**
- Create: `src/app/edit/hint.ts`
- Modify: `src/app/edit/Overlay.tsx`, `src/app/Preview.tsx`, `src/app/app.css`
- Test: `tests/unit/hint.test.ts` (new), `tests/e2e/hint.spec.ts` (new)

**Interfaces:**
- Produces in `src/app/edit/hint.ts`:
  - `HINT_KEY = 'uslides.hint.drawBox.done'`
  - `hintDone(storage?: Pick<Storage, 'getItem'>): boolean` returns true when the key holds `'1'`. Returns false if reading throws.
  - `markHintDone(storage?: Pick<Storage, 'setItem'>): void` swallows a throw.
  - Both default to `localStorage`, looked up inside a `try`.
- The hint element: class `us-hint`, `aria-hidden="true"`, text verbatim: `Drag on the slide to draw a box. Double-click text to edit it.`
- It renders inside the editing overlay of a slide when all hold: the slide is the shown slide, the slide has no boxes, editing is allowed, and the hint is not done.
- CSS: `pointer-events: none`, centred near the bottom of the frame, muted colour. Size it in the overlay's screen pixels, not the slide's 1920px space, so it reads the same at any zoom.
- Drawing a box by dragging, and "Add box", both call `markHintDone()` and hide the hint in every slide at once, without a reload.
- Before shipping the text, check both sentences against the running app. If double-click does not edit plain slide text, change the second sentence to match what happens and record it under DECISIONS.

- [ ] **Step 1: Write the failing tests.**

`tests/unit/hint.test.ts`:

```ts
test('not done by default, done after marking', () => {
  const store = new Map<string, string>();
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  expect(hintDone(storage)).toBe(false);
  markHintDone(storage);
  expect(store.get(HINT_KEY)).toBe('1');
  expect(hintDone(storage)).toBe(true);
});

test('storage that throws is treated as not done and does not throw', () => {
  const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
  expect(hintDone(broken)).toBe(false);
  expect(() => markHintDone(broken)).not.toThrow();
});
```

`tests/e2e/hint.spec.ts`, on the sample deck:
  - slide 1 is shown and has no boxes: exactly one `.us-hint` is visible, with the exact text.
  - click slide 3 (it has two boxes): no `.us-hint` is visible.
  - on slide 1, drag across the hint's own position: a box is created (the source gains one `::: box`), and no `.us-hint` exists anywhere. Reload: still none.
  - fresh storage, click `Add box`: no `.us-hint` exists. Reload: still none.
  - the hint is absent in present mode, in the downloaded `.html` text, and at 600px wide.
  - (Review Focus 5) with `page.addInitScript` replacing `Storage.prototype.getItem` and `setItem` so they throw for `HINT_KEY` only: the hint shows, dragging draws a box, the hint hides, and the page logs no uncaught error.
- [ ] **Step 2: Run** `npx vitest run tests/unit/hint.test.ts` and `npx playwright test tests/e2e/hint.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the full gate with all Playwright specs, including `tests/e2e/render.spec.ts` with snapshots unchanged. Expected: PASS.
- [ ] **Step 5: Commit** `feat(app): hint on a slide with no boxes`
