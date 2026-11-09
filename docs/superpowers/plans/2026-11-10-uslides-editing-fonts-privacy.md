# uslides mouse editing, privacy mode and fonts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let people edit slides with the mouse, pick Google fonts per box and per deck, and block other websites' images and fonts for decks that came from outside.

**Architecture:** Every mouse action becomes a text edit of the Markdown, made by pure functions in `src/core/edit.ts` and applied through the CodeMirror editor, so typed and mouse edits share one undo history and one save path. The preview gets an overlay layer (selection, handles, floating bar, typing area) drawn over the rendered stage. Privacy is a per-deck flag in IndexedDB plus a `blockExternal` render option. Fonts are a `font` attribute and setting, a shipped catalog JSON, a loader that adds Google Fonts stylesheets, and embedding in the downloaded `.html`.

**Tech Stack:** Vite, React 19, TypeScript strict, CodeMirror 6, markdown-it, idb, vite-plugin-pwa (Workbox), Vitest, Playwright, lucide-react.

**Spec:** `docs/superpowers/specs/2026-11-09-uslides-editing-fonts-privacy-design.md`. The first design, `docs/superpowers/specs/2026-11-09-uslides-design.md`, still holds except where this spec overrides it (Google Fonts are now allowed).

## Global Constraints

- The Markdown is the truth. A mouse edit changes only what the user touched. Moving a box changes only its `col` and `row`. Comments, spacing, attribute order and unknown attributes stay as they were.
- An attribute change rewrites only the box's opening `::: box …` line: replace an existing value in place, add a new attribute at the end of the line, remove an attribute set back to its default.
- One mouse action (one drag, one bar click, one font choice) is one undo step. Mouse edits and typed edits share one history.
- The privacy choice is stored only in IndexedDB, never in the Markdown, a share link or a download.
- Offline: a deck must open and present with no network. Missing fonts fall back to the theme font; blocked images show as placeholders.
- Mouse editing only at `(min-width: 768px)`, using pointer events. Narrower screens keep today's view-only preview.
- `src/core/**` stays free of `react`, `/render/`, `/app/`, `window.` and `document.` (checked by `tests/unit/core-purity.test.ts`).
- No new runtime dependencies beyond what the tasks name.
- All user-facing text is plain English, short sentences. Exact strings the spec fixes are quoted in the tasks and must be used verbatim.
- Commit messages follow the repo's existing style (`feat(scope): …`, `fix(scope): …`, `test: …`). No AI attribution lines of any kind in commits.
- Do not push.

## Review Focus

1. **Boxes written with odd spacing or quoting.** `:::box`, `::: box   col=2  row="1-3"`, tabs, attributes with quoted values, unknown attributes. Every edit must keep all of these byte for byte, apart from the touched value. Tests in Task 1.
2. **An edit while the parse is stale.** The parsed deck lags typing by 150 ms. A mouse edit made with ranges from an old parse would write in the wrong place. Each edit must use the result of `flushParse()`, not the last React state. Test in Task 2.
3. **Deck with CRLF line endings or a BOM from a linked file.** Ranges are offsets into the normalized source. Edits must be applied to the editor text, which is the normalized source. Test in Task 1.
4. **A blocked deck in present mode, print and the exported file.** Present and print must use the same blocked state as the preview. The exported `.html` already has no network. Tests in Task 8.
5. **A font name with characters that could break CSS** (`font="x\"; color:red"`, `font="a}b"`). The name must be refused with a warning and never reach a style. Test in Task 9.

---

## File map

| File | Status | Responsibility |
|------|--------|----------------|
| `src/core/edit.ts` | new | Pure text edits on boxes and free-flowing pieces |
| `src/core/layout.ts` | new | Pure grid maths: free-area search, move, resize, clamp, duplicate offset |
| `src/core/slide.ts` | modify | Record `looseRanges` and box `font` |
| `src/core/settings.ts` | modify | `font` deck setting |
| `src/core/external.ts` | new | Lists other websites a deck refers to |
| `src/core/markdown.ts` | modify | `blockExternal` option draws placeholders |
| `src/render/renderSlide.ts` | modify | `blockExternal`, `markEmpty`, font family on stage and boxes |
| `src/app/Editor.tsx` | modify | `applyEdit`, `onCursorChange`, shared-history typing support |
| `src/app/Preview.tsx` | modify | View switch, one-slide view, Add box, overlay mount |
| `src/app/edit/Overlay.tsx` | new | Selection, handles, dragging, drawing, keys |
| `src/app/edit/FloatingBar.tsx` | new | The bar over a selected box |
| `src/app/edit/TypingArea.tsx` | new | Markdown typing on the slide |
| `src/app/edit/stageGeometry.ts` | new | Pointer position to grid cell |
| `src/app/PrivacyBanner.tsx` | new | The blocked banner |
| `src/app/privacy.ts` | new | Combines deck state, app setting and "allow once" |
| `src/storage/db.ts` | modify | DB version 2, `privacy` field |
| `src/storage/backup.ts` | modify | Backup version 2 carries `privacy` |
| `src/fonts/catalog.json` | new | Shipped Google Fonts catalog |
| `src/fonts/catalog.ts` | new | Lookup and search |
| `src/fonts/load.ts` | new | Adds stylesheets, waits for fonts |
| `src/fonts/embed.ts` | new | Fetches and inlines fonts for Download .html |
| `src/app/FontPicker.tsx` | new | Searchable picker |
| `scripts/refresh-fonts.mjs` | new | Rebuilds `catalog.json` by hand |
| `vite.config.ts` | modify | Runtime caching for fonts |
| `src/export/download.ts` | modify | CSP `font-src data:`, font embedding |
| `skill/uslides/SKILL.md` | modify | `font`, privacy note |

---

## Part 1: Mouse editing

### Task 1: Pure source edits and grid maths

**Files:**
- Create: `src/core/edit.ts`, `src/core/layout.ts`
- Modify: `src/core/slide.ts` (add `looseRanges`)
- Test: `tests/unit/edit.test.ts`, `tests/unit/layout.test.ts`, `tests/unit/slide.test.ts`

**Interfaces:**
- Consumes: `Box.range`, `Box.contentRange`, `Slide.range`, `Box.col`, `Box.row` (`Span = [start, end]`, 1-based inclusive), `Grid`.
- Produces:
  - `type Edit = { from: number; to: number; insert: string }` — a single change against the source.
  - `type EditResult = { changes: Edit[]; select?: number }` — `select` is the offset to put the cursor on afterwards.
  - `Slide.looseRanges: SourceRange[]` — each run of free-flowing lines between box blocks, the slide comment and the slide edges, in source order, blank-only runs left out.
  - In `edit.ts`:
    - `setBoxAttrs(source: string, box: Box, attrs: Record<string, string | null>): EditResult` — `null` removes the attribute.
    - `setBoxSpan(source: string, box: Box, col: Span, row: Span, grid: Grid): EditResult` — writes `col`/`row`; a span covering the whole axis is still written (never removed), and a one-cell span is written as `N`, others as `A-B`.
    - `insertBox(source: string, slide: Slide, col: Span, row: Span): EditResult` — appends `::: box col=… row=…\n\n:::` at the end of the slide's text; `select` is the empty content line.
    - `deleteBox(source: string, box: Box): EditResult`
    - `duplicateBox(source: string, slide: Slide, box: Box, grid: Grid): EditResult` — copy goes right after the slide's last box, with the span from `layout.duplicateSpan`.
    - `bringToFront(source: string, slide: Slide, box: Box): EditResult`, `sendToBack(source: string, slide: Slide, box: Box): EditResult` — move the block to just after the last box / just before the first box. No change when already there (`changes: []`).
  - In `layout.ts`:
    - `findFreeArea(slide: Slide, w: number, h: number): { col: Span; row: Span } | null` — first `w×h` area covered by no box, scanning rows top to bottom, then columns left to right.
    - `centredSpan(grid: Grid, w: number, h: number): { col: Span; row: Span }`
    - `moveSpan(col: Span, row: Span, dc: number, dr: number, grid: Grid): { col: Span; row: Span }` — keeps size, stops at edges.
    - `resizeSpan(col: Span, row: Span, edge: Edge, dc: number, dr: number, grid: Grid): { col: Span; row: Span }` — `type Edge = 'n'|'s'|'e'|'w'|'ne'|'nw'|'se'|'sw'`; never smaller than one cell, never past the grid.
    - `duplicateSpan(col: Span, row: Span, grid: Grid): { col: Span; row: Span }` — one cell right and down if it fits, else the same span.
    - `clampNewBox(col: number, row: number, w: number, h: number, grid: Grid): { col: Span; row: Span }` — a box starting at a cell, made smaller if it would go past the edge.

- [ ] **Step 1: Write the failing tests**

`tests/unit/edit.test.ts` (each test parses with `parseDeck`, applies the changes with a small `apply(source, changes)` helper in the test file, then checks the text):

```ts
it('replaces an attribute value in place and keeps everything else', () => {
  const src = '::: box   col=2  row="1-3" data-x=keep bg=red\nHi\n:::\n';
  // set bg to blue
  expect(run(src, (d) => setBoxAttrs(d.source, box(d), { bg: '#2563eb' })))
    .toBe('::: box   col=2  row="1-3" data-x=keep bg=#2563eb\nHi\n:::\n');
});
it('adds a new attribute at the end of the opening line', () => {
  expect(run('::: box col=1-6\nHi\n:::\n', (d) => setBoxAttrs(d.source, box(d), { align: 'center' })))
    .toBe('::: box col=1-6 align=center\nHi\n:::\n');
});
it('removes an attribute and the one space before it', () => {
  expect(run('::: box col=1-6 bg=red row=2\nHi\n:::\n', (d) => setBoxAttrs(d.source, box(d), { bg: null })))
    .toBe('::: box col=1-6 row=2\nHi\n:::\n');
});
it('quotes a value that contains a space', () => {
  expect(run('::: box\nHi\n:::\n', (d) => setBoxAttrs(d.source, box(d), { font: 'Playfair Display' })))
    .toBe('::: box font="Playfair Display"\nHi\n:::\n');
});
it('moving a box changes only col and row', () => {
  const src = '<!-- slide bg=#000 -->\n\n::: box row=2 col=1-3 color=white\n**Hi**\n:::\n';
  expect(run(src, (d) => setBoxSpan(d.source, box(d), [4, 6], [3, 3], d.settings.grid)))
    .toBe('<!-- slide bg=#000 -->\n\n::: box row=3 col=4-6 color=white\n**Hi**\n:::\n');
});
it('inserts an empty box at the end of the slide and selects its empty line', () => {
  const src = '# A\n\n---\n\n# B\n';
  const d = parseDeck(src);
  const r = insertBox(d.source, d.slides[0]!, [1, 3], [1, 2]);
  expect(apply(src, r.changes)).toBe('# A\n\n::: box col=1-3 row=1-2\n\n:::\n\n---\n\n# B\n');
  expect(r.select).toBe('# A\n\n::: box col=1-3 row=1-2\n'.length);
});
it('deletes a box block and one blank line after it', () => { /* '# A\n\n::: box\nx\n:::\n\nTail\n' → '# A\n\nTail\n' */ });
it('bring to front moves the block after the last box; send to back before the first', () => { /* three boxes a,b,c: front(a) → b,c,a; back(c) → c,a,b; front(c) → no changes */ });
it('duplicate puts the copy after the last box, one cell right and down', () => { /* col=1-2 row=1 on 12x6 → copy col=2-3 row=2 */ });
it('works on a source that had CRLF line endings', () => {
  // parseDeck normalizes; edits are applied to deck.source, which is LF only.
  const d = parseDeck('::: box col=1\r\nHi\r\n:::\r\n');
  expect(apply(d.source, setBoxAttrs(d.source, d.slides[0]!.boxes[0]!, { bg: 'red' }).changes))
    .toBe('::: box col=1 bg=red\nHi\n:::\n');
});
it('accepts a box opened as ":::box"', () => { /* ':::box col=1\nHi\n:::\n' + {bg:'red'} → ':::box col=1 bg=red\nHi\n:::\n' */ });
```

`tests/unit/layout.test.ts`:

```ts
it('findFreeArea returns the first free 4x2 area from the top left', () => {
  // one box col=1-12 row=1 on 12x6 → { col: [1, 4], row: [2, 3] }
});
it('findFreeArea returns null when the slide is full', () => {}); // box col=1-12 row=1-6
it('moveSpan stops at the grid edge and keeps the size', () => {
  expect(moveSpan([10, 12], [1, 2], 1, -1, { cols: 12, rows: 6 })).toEqual({ col: [10, 12], row: [1, 2] });
});
it('resizeSpan never goes below one cell', () => {
  expect(resizeSpan([3, 4], [2, 2], 'e', -5, 0, { cols: 12, rows: 6 })).toEqual({ col: [3, 3], row: [2, 2] });
});
it('duplicateSpan keeps the span when the shift would not fit', () => {
  expect(duplicateSpan([11, 12], [1, 1], { cols: 12, rows: 6 })).toEqual({ col: [11, 12], row: [1, 1] });
});
it('clampNewBox makes a 3x2 box smaller at the bottom right corner', () => {
  expect(clampNewBox(12, 6, 3, 2, { cols: 12, rows: 6 })).toEqual({ col: [12, 12], row: [6, 6] });
});
```

`tests/unit/slide.test.ts`, new case:

```ts
it('records each free-flowing piece between boxes', () => {
  const src = '# Title\n\n::: box\nx\n:::\n\nMiddle\n\n::: box\ny\n:::\n';
  const d = parseDeck(src);
  expect(d.slides[0]!.looseRanges.map((r) => src.slice(r.from, r.to).trim())).toEqual(['# Title', 'Middle']);
});
```

- [ ] **Step 2: Run the tests and check they fail**

Run: `npx vitest run tests/unit/edit.test.ts tests/unit/layout.test.ts tests/unit/slide.test.ts`
Expected: FAIL (modules not found, `looseRanges` undefined).

- [ ] **Step 3: Implement**

Find the opening line as `source.slice(box.range.from, source.indexOf('\n', box.range.from))`. Locate attributes on it with a scanner that follows the same rules as `parseAttrs` in `src/core/attrs.ts` (key, `=`, quoted or bare value) but returns each attribute's offsets. Add that scanner to `attrs.ts` as `scanAttrs(text: string): Array<{ key: string; from: number; to: number; valueFrom: number; valueTo: number }>` so the parser and editor agree. Values are written bare unless they contain whitespace or `"`; a value containing `"` is refused (return `changes: []`). `looseRanges` is collected in `parseSlide` from the same lines that make up `slide.loose`, merging consecutive loose lines into one range.

- [ ] **Step 4: Run the tests and check they pass**

Run: `npx vitest run`
Expected: all unit tests PASS, including `core-purity`.

- [ ] **Step 5: Commit**

```bash
git add src/core/edit.ts src/core/layout.ts src/core/attrs.ts src/core/slide.ts tests/unit/edit.test.ts tests/unit/layout.test.ts tests/unit/slide.test.ts
git commit -m "feat(core): text edits for boxes and grid maths"
```

### Task 2: Editor edit channel and the cursor link

**Files:**
- Modify: `src/app/Editor.tsx`, `src/app/App.tsx`
- Test: `tests/e2e/edit-channel.spec.ts`

**Interfaces:**
- Consumes: `Edit`, `EditResult` from Task 1; `useDeck().flushParse()`.
- Produces on `EditorHandle`:
  - `applyEdit(result: EditResult, opts?: { userEvent?: string }): void` — one transaction with all changes, `isolateHistory.of('full')` unless `userEvent` starts with `input.type` (then normal grouping); moves the cursor to `select` when given, without focusing the editor.
  - `undo(): void`, `redo(): void` — run CodeMirror's `undo`/`redo` on the main view.
  - `moveCursorTo(pos: number, opts?: { focus?: boolean }): void` — `focus` defaults to `true` (today's behaviour). Selecting a box on the slide calls it with `focus: false`, so the keys stay with the slide.
- Produces on `Editor` props: `onCursorChange?(pos: number): void` — called when the selection head moves, for any reason.
- Produces in `App.tsx`: `editDeck(make: (deck: Deck) => EditResult | null, opts?: { userEvent?: string }): void` — calls `flushParse()`, runs `make` on that fresh deck, then `editor.current.applyEdit`. Passed to `Preview` as `onEdit`. Does nothing when the editor is not mounted (narrow screens).

- [ ] **Step 1: Write the failing test**

The mouse UI does not exist yet, so this test drives the channel through a test-only hook. `App.tsx` exposes `window.__uslidesEdit(attr: string, value: string | null)` only when `localStorage['uslides.e2e'] === '1'`. It sets that attribute on the last box of the slide at the cursor, through `editDeck`. Later tasks test the same path through the real UI.

```ts
test('an edit right after typing uses the fresh parse', async ({ page }) => {
  // type "::: box col=1\nA\n:::\n" at the end of slide 1, then immediately (no wait) call
  // window.__uslidesEdit('bg', 'red') which sets bg on the last box of slide 1.
  // Expect the editor text to contain "::: box col=1 bg=red".
});
test('one mouse edit is one undo step', async ({ page }) => {
  // __uslidesEdit('bg','red'); press Control+Z in the editor; text no longer contains "bg=red".
});
```

- [ ] **Step 2: Run it and check it fails**

Run: `npx playwright test tests/e2e/edit-channel.spec.ts`
Expected: FAIL (`__uslidesEdit` is not a function).

- [ ] **Step 3: Implement `applyEdit`, `undo`, `redo`, `onCursorChange` and `editDeck`**

`onCursorChange` comes from an `EditorView.updateListener` checking `update.selectionSet`. The e2e hook lives in `App.tsx` and is a thin wrapper over `editDeck`.

- [ ] **Step 4: Run it and check it passes**

Run: `npm run build && npx playwright test tests/e2e/edit-channel.spec.ts` — rebuild first; Playwright reuses the preview server on 4173.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/Editor.tsx src/app/App.tsx tests/e2e/edit-channel.spec.ts
git commit -m "feat(editor): one channel for edits made outside the editor"
```

### Task 3: Two preview views

**Files:**
- Modify: `src/app/Preview.tsx`, `src/app/App.tsx`, `src/app/app.css`
- Test: `tests/e2e/preview-views.spec.ts`

**Interfaces:**
- Consumes: `onCursorChange` and `moveCursorTo` from Task 2; `Slide.range`.
- Produces: `Preview` props gain `view: 'all' | 'one'`, `onViewChange(v)`, `currentSlide: number` (0-based, from the cursor), `onEdit` (Task 2's `editDeck`), `editable: boolean` (`wide`). The one-slide view renders the stage inside `<div class="one-slide">` with an element `.slide-frame` that later tasks attach the overlay to. The view is stored in `localStorage['uslides.previewView']`, default `'all'`, read and written in try/catch.

- [ ] **Step 1: Write the failing tests**

```ts
test('the view switch shows one large slide and remembers it', async ({ page }) => {
  // click button aria-label "One slide"; expect one .slide-frame; reload; still one .slide-frame.
});
test('moving the cursor to slide 3 shows slide 3', async ({ page }) => {
  // in one-slide view, click into the editor on a line of slide 3; expect text "3 / N" in the slide counter.
});
test('Next moves the editor cursor to the start of the next slide', async ({ page }) => {
  // click "Next slide"; editor cursor line is the first line of slide 2.
});
```

- [ ] **Step 2: Run and check they fail**

Run: `npx playwright test tests/e2e/preview-views.spec.ts` — Expected: FAIL.

- [ ] **Step 3: Implement**

Use `IconButton` with lucide `Rows3` ("All slides") and `Square` ("One slide") as a two-button group in the preview header, next to the existing grid toggle. Previous / next use `ChevronLeft` / `ChevronRight` with labels "Previous slide" / "Next slide", and a `n / N` counter.

- [ ] **Step 4: Run and check they pass**

Run: `npm run build && npx playwright test tests/e2e/preview-views.spec.ts tests/e2e/render.spec.ts` — Expected: PASS (the render snapshots are taken in the default all-slides view and must not change).

- [ ] **Step 5: Commit**

```bash
git add src/app/Preview.tsx src/app/App.tsx src/app/app.css tests/e2e/preview-views.spec.ts
git commit -m "feat(preview): one-slide view that follows the editor cursor"
```

### Task 4: Selecting a box, the floating bar and keys

**Files:**
- Create: `src/app/edit/Overlay.tsx`, `src/app/edit/FloatingBar.tsx`, `src/app/edit/stageGeometry.ts`
- Modify: `src/app/Preview.tsx`, `src/app/app.css`
- Test: `tests/e2e/select.spec.ts`

**Interfaces:**
- Consumes: Task 1's `setBoxAttrs`, `deleteBox`, `duplicateBox`, `bringToFront`, `sendToBack`, `moveSpan`, `resizeSpan`; Task 2's `onEdit`; `moveCursorTo`.
- Produces:
  - `stageGeometry.ts`: `cellAt(stage: HTMLElement, grid: Grid, clientX: number, clientY: number): { col: number; row: number }` (1-based, clamped) and `boxesAt(stage: HTMLElement, clientX: number, clientY: number): number[]` (box indexes under the point, top first, using each `.us-box` rect and `data-box`).
  - `Overlay` props: `{ stage: HTMLElement; slide: Slide; grid: Grid; theme: 'light' | 'dark'; onEdit; onMoveCursor(pos: number): void; onSelectSlide?(): void }`. Selection is held as the box index; after each edit the index is re-found from the new parse (bring to front / back and duplicate select the moved or new box).
  - `FloatingBar` props: `{ box: Box; theme; anchor: DOMRect; bounds: DOMRect; onSet(attrs: Record<string, string | null>): void; onFront(); onBack(); onDuplicate(); onDelete() }`. A `fontSlot?: ReactNode` prop is left for Task 12.

- [ ] **Step 1: Write the failing tests**

```ts
test('clicking a box selects it and moves the cursor to its opening line', async ({ page }) => {
  // deck: '# A\n\n::: box col=1-6 row=1-3\nLeft\n:::\n'; click the box; expect .us-selection visible with 8 .us-handle;
  // editor cursor line is the '::: box' line.
});
test('clicking the same spot again selects the box underneath', async ({ page }) => {
  // two boxes over the same cells; click twice; the second click selects data-box=0.
});
test('Fill colour writes bg on the opening line only', async ({ page }) => {
  // select, open "Fill colour", pick the first palette swatch; editor text has 'col=1-6 row=1-3 bg=' + that colour.
});
test('None removes the attribute', async ({ page }) => {});
test('align and valign buttons write align= and valign=', async ({ page }) => {});
test('Bring to front, Send to back, Duplicate and Delete change the blocks', async ({ page }) => {});
test('arrow keys move one cell, Shift+arrow grows from the right or bottom', async ({ page }) => {
  // ArrowRight → col=2-7; Shift+ArrowDown → row=1-4.
});
test('Delete removes the box, Ctrl/Cmd+D duplicates, Esc deselects', async ({ page }) => {});
test('the bar sits below the box when there is no room above', async ({ page }) => {
  // box at row=1: bar's top > box's bottom.
});
test('no selection on a narrow screen', async ({ page }) => {
  // viewport 600x900, click a box: no .us-selection.
});
```

- [ ] **Step 2: Run and check they fail**

Run: `npx playwright test tests/e2e/select.spec.ts` — Expected: FAIL.

- [ ] **Step 3: Implement**

Overlay is an absolutely positioned layer inside `.slide-frame`, above the scaled stage, so its coordinates are screen pixels taken from each box's `getBoundingClientRect()`. The click-again rule: remember the last click point; if the next click is within 4 px of it, select the next index in `boxesAt(...)` after the current one, wrapping round. In the all-slides view, clicking empty space still calls `onSelectSlide`. Bar icons from lucide: `PaintBucket` "Fill colour", `Baseline` "Text colour", `AlignLeft`/`AlignCenter`/`AlignRight`, `AlignStartHorizontal`/`AlignCenterHorizontal`/`AlignEndHorizontal` (labels "Top", "Middle", "Bottom"), `BringToFront` "Bring to front", `SendToBack` "Send to back", `Copy` "Duplicate", `Trash2` "Delete". Colour menu: six palette colours per theme (builder's choice), "None", and a `<input type="color">` that writes `#rrggbb`. Keys are handled on the overlay while a box is selected and focus is not in the editor.

- [ ] **Step 4: Run and check they pass**

Run: `npm run build && npx playwright test tests/e2e/select.spec.ts` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/edit src/app/Preview.tsx src/app/app.css tests/e2e/select.spec.ts
git commit -m "feat(edit): select boxes on the slide and change them from a floating bar"
```

### Task 5: Dragging, drawing and adding boxes

**Files:**
- Modify: `src/app/edit/Overlay.tsx`, `src/app/Preview.tsx`, `src/render/renderSlide.ts`, `src/render/slide.css`
- Test: `tests/e2e/drag.spec.ts`, `tests/unit/renderSlide.test.ts`

**Interfaces:**
- Consumes: `cellAt`, `moveSpan`, `resizeSpan`, `setBoxSpan`, `insertBox`, `findFreeArea`, `centredSpan`, `clampNewBox`.
- Produces: `renderSlide` option `markEmpty?: boolean` — adds class `us-empty` to boxes whose markdown is blank; `slide.css` draws a dashed outline for `.us-empty` only. Preview passes `markEmpty: true`; Present, print and the player do not. After an insert, the overlay starts typing mode on the new box (Task 6 provides it; until then it selects the box).

- [ ] **Step 1: Write the failing tests**

```ts
// drag.spec.ts — use page.mouse with steps so pointermove fires.
test('dragging a box moves it by whole cells and is one undo step', async ({ page }) => {
  // drag from the box centre by exactly 2 cell widths right; text has col=3-8; Control+Z restores col=1-6.
});
test('dragging the bottom-right handle resizes it', async ({ page }) => {});
test('a box cannot be dragged off the grid', async ({ page }) => {});
test('the landing outline and grid lines show while dragging, even with the grid off', async ({ page }) => {
  // turn off "Show grid"; during the drag .us-ghost and .us-grid are visible; after, .us-grid is hidden again.
});
test('dragging on empty space draws a new box', async ({ page }) => {
  // drag across 3x2 cells of empty space; text gets '::: box col=…-… row=…-…\n\n:::' at the end of the slide.
});
test('double-clicking empty space makes a 3x2 box, smaller at the edge', async ({ page }) => {});
test('a single click on empty space never makes a box', async ({ page }) => {});
test('Add box puts a 4x2 box in the first free area, or the middle when full', async ({ page }) => {});
```

```ts
// renderSlide.test.ts
it('marks empty boxes only when asked', () => {
  // box with blank content: markEmpty true → has class us-empty; default → does not.
});
```

- [ ] **Step 2: Run and check they fail**

Run: `npx vitest run tests/unit/renderSlide.test.ts && npx playwright test tests/e2e/drag.spec.ts` — Expected: FAIL.

- [ ] **Step 3: Implement**

Pointer capture on `pointerdown`. A press that moves less than 4 px is a click, not a drag. While dragging, the ghost outline follows the snapped cell span and the edit is written once on `pointerup`. Double-click on a spot with no box and no free-flowing text under it (check `document.elementFromPoint` hits the stage or `.us-loose` with no text node under the point) makes the 3×2 box. "Add box" is an `IconButton` with lucide `SquarePlus`, label "Add box", next to the view switch; in the all-slides view it adds to the slide at the cursor.

- [ ] **Step 4: Run and check they pass**

Run: `npm run build && npx vitest run && npx playwright test tests/e2e/drag.spec.ts tests/e2e/render.spec.ts` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/edit src/app/Preview.tsx src/render tests/e2e/drag.spec.ts tests/unit/renderSlide.test.ts
git commit -m "feat(edit): drag to move, resize and draw boxes, and an Add box button"
```

### Task 6: Typing on the slide

**Files:**
- Create: `src/app/edit/TypingArea.tsx`
- Modify: `src/app/edit/Overlay.tsx`, `src/app/Editor.tsx`, `src/app/app.css`
- Test: `tests/e2e/typing.spec.ts`

**Interfaces:**
- Consumes: `Box.contentRange`, `Slide.looseRanges`, `EditorHandle.applyEdit` with `userEvent: 'input.type'`, `undo`, `redo`.
- Produces: `TypingArea` props `{ rect: DOMRect; text: string; from: number; onChange(edit: Edit): void; onUndo(); onRedo(); onDone(): void }`. It is a small CodeMirror view with no history of its own. Each local change is sent as one `Edit` with offsets shifted by `from`, so the main editor's history groups it. After undo or redo the area reloads its text from the main editor. This one component is what a later rich mode replaces.

- [ ] **Step 1: Write the failing tests**

```ts
test('double-clicking a box shows its Markdown and typing updates the editor', async ({ page }) => {
  // '::: box col=1-6\n**Hi**\n:::'; dblclick the box; the typing area shows '**Hi**' (no ::: lines);
  // type ' there'; editor text has '**Hi** there' at once.
});
test('Enter on a selected box starts typing; Esc or a click outside stops', async ({ page }) => {});
test('Ctrl/Cmd+Z in the typing area undoes a burst of typing, not one letter', async ({ page }) => {
  // type 'abc' quickly; one undo removes all three.
});
test('double-clicking free-flowing text edits only that piece', async ({ page }) => {
  // '# Top\n\n::: box\nx\n:::\n\nBottom\n'; dblclick "Bottom"; area text is 'Bottom'; type '!'; '# Top' unchanged.
});
test('a new box from Add box goes straight into typing', async ({ page }) => {});
test('long text scrolls inside the box instead of growing it', async ({ page }) => {
  // area height equals box height; scrollHeight > clientHeight.
});
```

- [ ] **Step 2: Run and check they fail**

Run: `npx playwright test tests/e2e/typing.spec.ts` — Expected: FAIL.

- [ ] **Step 3: Implement**

The content range of a box can change length while typing; after each edit the overlay re-reads the box from the new parse (via `flushParse`) to keep `from` right. The area uses the `--us-mono` font, a white or theme-matched background, and covers only the box's rectangle.

- [ ] **Step 4: Run and check they pass**

Run: `npm run build && npx playwright test` (whole e2e suite, since the editor changed) — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/edit src/app/Editor.tsx src/app/app.css tests/e2e/typing.spec.ts
git commit -m "feat(edit): type a box's Markdown right on the slide"
```

---

## Part 2: Privacy mode

### Task 7: Per-deck privacy state in storage and backups

**Files:**
- Modify: `src/storage/db.ts`, `src/storage/backup.ts`, `src/files/importFiles.ts`, `src/app/App.tsx`
- Create: `src/app/privacy.ts`
- Test: `tests/unit/db.test.ts`, `tests/unit/backup.test.ts`, `tests/unit/privacy.test.ts`

**Interfaces:**
- Produces:
  - `DeckRecord.privacy?: 'allowed' | 'blocked'` — missing means "not chosen".
  - `setDeckPrivacy(id: string, privacy: 'allowed' | 'blocked' | undefined): Promise<DeckRecord>` in `db.ts`.
  - DB version 2 with an empty upgrade step from version 1 (no data change), so decks already saved stay "not chosen" and therefore allowed by default.
  - `duplicateDeck` copies `privacy`.
  - Backup `version: 2`; each deck carries `privacy` when set. `importBackup` accepts versions 1 and 2. Version 1 decks restore as `'blocked'`. Version 2 decks restore with their saved value.
  - `src/app/privacy.ts`: `isBlocked(privacy: DeckRecord['privacy'], askFirst: boolean, allowedOnce: boolean): boolean` and `readAskFirst(): boolean` / `writeAskFirst(on: boolean): void` on `localStorage['uslides.askBeforeExternal']`, wrapped in try/catch, default `false`.
  - Decks start `'blocked'` when made from: the share link at boot and on hash change (`App.tsx` lines ~76 and ~256), `importFiles` (both `createDeck` calls and the single-file one at line 46), `importFromFolder`, and dropped files (they go through `importFiles`). The sample deck, New deck and Duplicate do not set it.

- [ ] **Step 1: Write the failing tests**

```ts
// privacy.test.ts
it.each([
  [undefined, false, false, false],
  [undefined, true, false, true],
  ['blocked', false, false, true],
  ['blocked', false, true, false],
  ['allowed', true, false, false],
])('isBlocked(%s, ask=%s, once=%s) is %s', (p, ask, once, want) => {
  expect(isBlocked(p as never, ask, once)).toBe(want);
});
// db.test.ts
it('a duplicate keeps the privacy choice', async () => {});
it('opening a version 1 database keeps its decks with no privacy value', async () => {});
// backup.test.ts
it('a version 1 backup restores its decks as blocked', async () => {});
it('a version 2 backup round-trips allowed, blocked and not chosen', async () => {});
// importFiles: existing tests gain an assertion that the new deck's privacy is 'blocked'.
```

- [ ] **Step 2: Run and check they fail**

Run: `npx vitest run tests/unit/privacy.test.ts tests/unit/db.test.ts tests/unit/backup.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement** as specified in Interfaces.

- [ ] **Step 4: Run and check they pass**

Run: `npx vitest run` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/storage src/files/importFiles.ts src/app/privacy.ts src/app/App.tsx tests/unit
git commit -m "feat(privacy): remember per deck whether it may load from other websites"
```

### Task 8: Blocking, placeholders and the banner

**Files:**
- Create: `src/core/external.ts`, `src/app/PrivacyBanner.tsx`
- Modify: `src/core/markdown.ts`, `src/render/renderSlide.ts`, `src/render/slide.css`, `src/app/Preview.tsx`, `src/app/Present.tsx`, `src/export/download.ts` (`printDeck`), `src/app/App.tsx`, `src/app/DeckList.tsx`
- Test: `tests/unit/external.test.ts`, `tests/unit/markdown.test.ts`, `tests/e2e/privacy.spec.ts`

**Interfaces:**
- Consumes: Task 7's `isBlocked`, `setDeckPrivacy`, `readAskFirst`/`writeAskFirst`.
- Produces:
  - `externalHosts(deck: Deck): string[]` — sorted, unique host names of `http:`/`https:` images in boxes and free-flowing text, skipping code. Task 11 adds the font hosts to it.
  - `RenderOptions.blockExternal?: boolean` in both `markdown.ts` and `renderSlide.ts`. When true, an `http:`/`https:` image renders as `<span class="us-blocked" role="img" aria-label="ALT">ALT</span>` (alt escaped; "Image" when empty). `data:` and relative images are unaffected.
  - `printDeck(deck, resolveImage, opts?: { blockExternal?: boolean })`.
  - `Present` prop `blockExternal: boolean`.
  - `PrivacyBanner` props `{ hosts: string[]; onAllowOnce(): void; onAlwaysAllow(): void }`. The text is exactly: `This deck wants to load images and fonts from ${n} other ${n === 1 ? 'website' : 'websites'}. They are blocked until you allow them.` Buttons "Allow once" and "Always allow for this deck". A "Show websites" toggle lists the hosts.
  - App state `allowedOnce: Set<string>` of deck ids, in memory only, so it ends on reload.
  - Deck list menu item "Ask before loading anything from other websites", a checkbox-style `MenuItem` with `role="menuitemcheckbox"` and `aria-checked`.

- [ ] **Step 1: Write the failing tests**

```ts
// external.test.ts
it('lists the hosts of web images, once each, and skips code and data images', () => {
  const d = parseDeck('![a](https://a.example/x.png)\n\n`![b](https://b.example/y.png)`\n\n![c](https://a.example/z.png)\n\n![d](data:image/png;base64,AA==)\n');
  expect(externalHosts(d)).toEqual(['a.example']);
});
// markdown.test.ts
it('draws a blocked web image as a placeholder with its alt text', () => {
  expect(renderMarkdown('![Sales chart](https://x.example/c.png)', { blockExternal: true }))
    .toContain('<span class="us-blocked" role="img" aria-label="Sales chart">Sales chart</span>');
});
it('never blocks data images or stored images', () => {});
```

```ts
// privacy.spec.ts — route https://img.example/** to a local PNG with page.route and count requests.
test('a deck from a share link makes no request to the image host and shows the banner', async ({ page }) => {});
test('Allow once loads the image until reload', async ({ page }) => {});
test('Always allow for this deck survives a reload', async ({ page }) => {});
test('a deck with no web images never shows the banner', async ({ page }) => {});
test('present mode of a blocked deck shows the placeholder', async ({ page }) => {});
test('print of a blocked deck shows the placeholder', async ({ page }) => {
  // stub window.print; click Print; the print container holds .us-blocked and no request reached img.example.
});
test('the ask-first setting blocks a deck made in the app', async ({ page }) => {});
test('an imported deck starts blocked; a duplicate of it is still blocked', async ({ page }) => {});
```

- [ ] **Step 2: Run and check they fail**

Run: `npx vitest run tests/unit/external.test.ts tests/unit/markdown.test.ts && npx playwright test tests/e2e/privacy.spec.ts` — Expected: FAIL.

- [ ] **Step 3: Implement**

The banner sits above the preview, inside `.workspace`, and only when the deck is blocked and `externalHosts` is not empty. Pack images and Download .html keep fetching as today (clicking them counts as allowing for that fetch); the deck's state does not change. Print passes the current `blockExternal`.

- [ ] **Step 4: Run and check they pass**

Run: `npm run build && npx vitest run && npx playwright test` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat(privacy): block other websites' images in decks from outside, with a banner to allow them"
```

---

## Part 3: Fonts

### Task 9: `font` in the format and on the slide

**Files:**
- Modify: `src/core/slide.ts`, `src/core/settings.ts`, `src/render/renderSlide.ts`
- Test: `tests/unit/slide.test.ts`, `tests/unit/settings.test.ts`, `tests/unit/renderSlide.test.ts`

**Interfaces:**
- Produces:
  - `Box.font?: string` and `DeckSettings.font?: string`. `font=default` and a missing value both leave it undefined.
  - A font name is valid only if it matches `/^[A-Za-z0-9][A-Za-z0-9 ]*$/` and is at most 60 characters. Otherwise the parser warns `Invalid font name "X". Font names use only letters, numbers and spaces.` and ignores it. (Catalog checks come in Task 10.)
  - `Box.fontRange?: SourceRange` — the opening line, for the unknown-font warning in Task 10. `font` added to the known box attributes and `KNOWN_KEYS`.
  - `renderSlide` sets `style.fontFamily = '"NAME", var(--us-font)'` on the stage for the deck font and on each box with its own font. Code keeps `var(--us-mono)` because `slide.css` already sets it on `code, pre`.

- [ ] **Step 1: Write the failing tests**

```ts
it('reads font="Playfair Display" on a box', () => {});
it('font=default means no font', () => {});
it('refuses a font name that could break CSS', () => {
  const d = parseDeck('::: box font="a}b"\nHi\n:::\n');
  expect(d.slides[0]!.boxes[0]!.font).toBeUndefined();
  expect(d.warnings[0]!.message).toBe('Invalid font name "a}b". Font names use only letters, numbers and spaces.');
});
it('reads the font deck setting', () => { /* '---\nfont: Inter\n---\n# A\n' → settings.font === 'Inter' */ });
it('the box font wins over the deck font', () => {
  // renderSlide: stage style font-family starts with '"Inter"', box style starts with '"Lora"'.
});
```

- [ ] **Step 2: Run and check they fail** — `npx vitest run` — Expected: FAIL.

- [ ] **Step 3: Implement** as specified.

- [ ] **Step 4: Run and check they pass** — `npx vitest run` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core src/render tests/unit
git commit -m "feat(fonts): font box attribute and deck setting"
```

### Task 10: The font catalog and the unknown-font warning

**Files:**
- Create: `scripts/refresh-fonts.mjs`, `src/fonts/catalog.json`, `src/fonts/catalog.ts`, `src/app/fontWarnings.ts`
- Modify: `src/app/App.tsx` (merge warnings), `package.json` (script `fonts:refresh`)
- Test: `tests/unit/catalog.test.ts`, `tests/unit/fontWarnings.test.ts`

**Interfaces:**
- Produces:
  - `catalog.json`: `{ "updated": "YYYY-MM-DD", "families": [{ "n": "Inter", "c": "sans-serif", "w": [100,…,900], "i": true }] }` sorted by popularity (most popular first). `c` is one of `serif`, `sans-serif`, `display`, `handwriting`, `monospace`.
  - `scripts/refresh-fonts.mjs` fetches `https://fonts.google.com/metadata/fonts`, strips the leading `)]}'` line if present, and writes the file above. It is run by hand only, never in the build or tests.
  - `catalog.ts`: `type Family = { name: string; group: Group; weights: number[]; italic: boolean }`, `findFamily(name: string): Family | undefined` (case-insensitive), `searchFamilies(query: string, group?: Group): Family[]` (substring match, popular first), `allFamilies(): Family[]`. The JSON is imported lazily (`await import('./catalog.json')`) through `loadCatalog(): Promise<void>`, so it is not in the player and does not grow the main chunk beyond need.
  - `fontWarnings(deck: Deck, find: (name: string) => Family | undefined): Warning[]` — for each box font and the deck font not in the catalog: `Unknown font "X". Pick one from the font menu, or check the spelling on fonts.google.com.` App starts `loadCatalog()` once on start and shows no font warnings until it has loaded, so a slow load never flashes false warnings.

- [ ] **Step 1: Write the failing tests**

```ts
it('finds a family ignoring case', () => { expect(findFamily('playfair display')?.name).toBe('Playfair Display'); });
it('search is popular first and filters by group', () => {});
it('the catalog has at least 1,500 families and each has a group and weights', () => {});
it('warns about an unknown font with the exact message', () => {});
```

- [ ] **Step 2: Run and check they fail** — `npx vitest run` — Expected: FAIL.

- [ ] **Step 3: Implement**, then run `node scripts/refresh-fonts.mjs` once and commit the output.

- [ ] **Step 4: Run and check they pass** — `npx vitest run` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/refresh-fonts.mjs src/fonts src/app/fontWarnings.ts src/app/App.tsx package.json tests/unit
git commit -m "feat(fonts): ship the Google Fonts catalog and warn about unknown names"
```

### Task 11: Loading fonts, caching them, and refitting

**Files:**
- Create: `src/fonts/load.ts`
- Modify: `src/app/Preview.tsx`, `src/app/Present.tsx`, `src/export/download.ts` (`printDeck`), `src/core/external.ts`, `vite.config.ts`
- Test: `tests/unit/fontLoad.test.ts`, `tests/unit/external.test.ts`, `tests/e2e/fonts.spec.ts`

**Interfaces:**
- Consumes: `findFamily`, `isBlocked`, `blockExternal`.
- Produces:
  - `deckFonts(deck: Deck): string[]` in `external.ts` — every font name the deck uses, deduplicated case-insensitively.
  - `externalHosts` adds `fonts.googleapis.com` and `fonts.gstatic.com` when `deckFonts` finds a catalog font (the catalog lookup is passed in: `externalHosts(deck, isKnownFont?)`).
  - `fontCssUrl(family: Family): string` — `https://fonts.googleapis.com/css2?family=NAME:ital,wght@0,400;0,700;1,400;1,700&display=swap`, using only weights and styles the family has (400 falls back to the nearest weight).
  - `useDeckFonts(deck: Deck | undefined, blocked: boolean): number` — adds one `<link rel="stylesheet">` per family to `document.head` (never twice), does nothing while blocked, and returns a counter that goes up on each `document.fonts` `loadingdone` event so the preview re-runs `fitSlide` and the cut-off warnings.
  - `waitForFonts(names: string[], ms = 3000): Promise<void>` — resolves when `document.fonts.load` has settled for each name, or after `ms`. Present calls it before showing the first slide. `printDeck` calls it before `window.print()`. Neither waits while the deck is blocked.
  - Workbox runtime caching: `fonts.googleapis.com` with `StaleWhileRevalidate`, cache `uslides-font-css`; `fonts.gstatic.com` with `CacheFirst`, cache `uslides-fonts`, `maxEntries: 100`, `purgeOnQuotaError: true`, statuses `[0, 200]`.

- [ ] **Step 1: Write the failing tests**

```ts
it('fontCssUrl asks only for the styles a family has', () => {});
it('waitForFonts gives up after the limit', async () => { /* fake document.fonts.load never resolves; vi timers; resolves at 3000 ms */ });
// fonts.spec.ts — page.route fonts.googleapis.com and fonts.gstatic.com to a local CSS and woff2 fixture.
test('a box font loads and the box is refitted', async ({ page }) => {});
test('a blocked deck asks for no font and shows the theme font', async ({ page }) => {});
test('present waits for fonts up to 3 seconds', async ({ page }) => { /* delay the route 5 s; slide shows within ~3.5 s */ });
```

- [ ] **Step 2: Run and check they fail.** — Expected: FAIL.

- [ ] **Step 3: Implement** as specified.

- [ ] **Step 4: Run and check they pass** — `npm run build && npx vitest run && npx playwright test` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src vite.config.ts tests
git commit -m "feat(fonts): load Google fonts, keep them offline, refit after they load"
```

### Task 12: The font picker

**Files:**
- Create: `src/app/FontPicker.tsx`
- Modify: `src/app/edit/FloatingBar.tsx`, `src/app/Toolbar.tsx`, `src/app/App.tsx`, `src/app/app.css`
- Test: `tests/e2e/font-picker.spec.ts`

**Interfaces:**
- Consumes: `searchFamilies`, `allFamilies`, `loadCatalog`, `setBoxAttrs`, `isBlocked`.
- Produces:
  - `FontPicker` props `{ value?: string; blocked: boolean; onPick(name: string | null): void; onClose(): void }`. `null` means "Theme font" (removes `font` / writes nothing).
  - `setDeckFont(source: string, name: string | null): EditResult` in `src/core/edit.ts` — adds, replaces or removes the `font:` line in the settings block, making a block if there is none, the same way `setTitle` does in `settings.ts`.
  - Floating bar `fontSlot` gets a `Type` icon button "Font". Toolbar gets a "Deck font" `IconButton` (lucide `Type`) next to Rename.

- [ ] **Step 1: Write the failing tests**

```ts
test('searching narrows the list as you type', async ({ page }) => {});
test('the style group filter shows only that group', async ({ page }) => {});
test('picking a font writes font="Name" and one undo removes it', async ({ page }) => {});
test('Deck font writes font: Name into the settings block', async ({ page }) => {});
test('each visible name loads only its own letters', async ({ page }) => {
  // route fonts.googleapis.com; requests contain '&text=' and there are no more than the visible rows.
});
test('while blocked, names show plain with a Show previews button', async ({ page }) => {});
```

- [ ] **Step 2: Run and check they fail.** — Expected: FAIL.

- [ ] **Step 3: Implement**

The list is virtualised (only visible rows are in the DOM) so 1,800 rows stay quick. Each visible row loads `https://fonts.googleapis.com/css2?family=NAME&text=<url-encoded NAME>`, watched with an `IntersectionObserver`. "Show previews" sets a picker-only flag; it does not change the deck.

- [ ] **Step 4: Run and check they pass** — `npm run build && npx playwright test` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src tests/e2e/font-picker.spec.ts
git commit -m "feat(fonts): a searchable font picker for boxes and the deck"
```

### Task 13: Fonts in Download .html, and the SKILL file

**Files:**
- Create: `src/fonts/embed.ts`
- Modify: `src/export/download.ts`, `src/app/App.tsx`, `src/player/main.ts` (only if the player needs the style tag), `skill/uslides/SKILL.md`
- Test: `tests/unit/download.test.ts`, `tests/unit/fontEmbed.test.ts`, `tests/unit/skill.test.ts`, `tests/e2e/export.spec.ts`

**Interfaces:**
- Consumes: `deckFonts`, `findFamily`, `fontCssUrl`.
- Produces:
  - `embedFonts(names: string[], fetchText: (url: string) => Promise<string | null>, fetchBytes: (url: string) => Promise<Blob | null>): Promise<{ css: string; failed: string[] }>` — fetches each family's CSS, keeps only the `latin` subset blocks, replaces each `url(...)` with a `data:font/woff2;base64,…` URI, and returns the combined `@font-face` CSS.
  - `buildHtml(source, name, playerJs, fontCss = '')` puts `<style id="fonts">…</style>` in the head. The CSP becomes `default-src 'none'; img-src data: blob:; font-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'`.
  - `ExportResult.failedFonts: string[]`. The app's notice for it: `Could not embed ${n === 1 ? 'this font' : `these ${n} fonts`}: NAMES. The file uses the theme font instead.`
  - SKILL.md: the `font` box attribute and deck setting, with the safe examples `Inter`, `Lora`, `"Playfair Display"`, `"JetBrains Mono"`; that names must match the Google Fonts catalog and names with spaces need double quotes in a box; that web images and fonts in decks a user opens from a file or link are blocked until the user allows them, so packing images is the reliable way.

- [ ] **Step 1: Write the failing tests**

```ts
it('embedFonts inlines the woff2 files as data URIs and keeps only latin', async () => {});
it('embedFonts lists a font whose CSS could not be fetched', async () => {});
it('the exported page allows data fonts and nothing else from the network', () => {
  expect(buildHtml('# A', 'A', '')).toContain("font-src data:");
});
// skill.test.ts already parses every example with no warnings; it must still pass with the new font examples.
// export.spec.ts: an exported deck with font=Lora opened offline uses Lora (document.fonts.check('16px Lora') is true).
```

- [ ] **Step 2: Run and check they fail.** — Expected: FAIL.

- [ ] **Step 3: Implement** as specified.

- [ ] **Step 4: Run and check they pass** — `npm run build && npx vitest run && npx playwright test && npm run lint && npm run typecheck` — Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src skill tests
git commit -m "feat(fonts): embed fonts in the downloaded file and document font in the SKILL file"
```
