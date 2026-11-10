# uslides: easier first run

Date: 2026-11-10
Status: draft, waiting for the owner's review

## Why

The owner's model for ease of use is Excalidraw. In Excalidraw a new person
can make something before reading anything. In uslides today a new person
has to read first:

- The toolbar is ten icon buttons of equal weight with no text. Present,
  Share and Delete look the same.
- Nothing says a slide can be edited with the mouse. Drawing a box by
  dragging is invisible.
- There is no button for a new slide. You must know that a line with `---`
  starts one.
- Rename and Delete use the browser's own pop-up dialogs, which look foreign.

This design fixes those four things. It adds no new capability. It only makes
existing capabilities easier to find.

## Goals

1. A new person can add a slide, add a box and type in it using only the
   mouse, without reading the sample deck.
2. The toolbar shows, at a glance, the two things people do most: present
   and share.
3. No browser pop-up dialogs remain in the rename and delete flows.

## Not in scope

- A mode that hides the Markdown editor. That changes what the product is
  and needs its own decision.
- Dark mode for the app.
- Changing when grid lines show.
- Per-deck menus in the deck list.
- Any change to the Markdown format, the exported HTML file or present mode.

## What would make this a failure

- Any existing action becomes unreachable, or takes more than two clicks.
- A hint or button appears in present mode, in a downloaded file, in print,
  or in a shared link's read-only view.
- Deleting a deck by mistake loses it for good.

## Part 1: a smaller toolbar

### Layout, left to right

| Item | Form | Notes |
|---|---|---|
| Show or hide decks | icon button | unchanged |
| Deck name | text; click to rename | see Part 3 |
| "Allow access" warning, linked-file badge | unchanged | shown only when a file is linked |
| Deck font | icon button | unchanged |
| Download | icon button with its menu | menu unchanged |
| Share | button with icon and the word "Share" | menu unchanged |
| Present | button with icon and the word "Present", in the accent colour | the one primary button |
| More | icon button (three dots), label "More" | opens the menu below |

### The More menu

In this order, each with its icon and text:

1. Open file
2. Open folder (only when the browser supports it, as today)
3. Pack images
4. Duplicate deck
5. Delete deck (red, separated from the rest by a line)

Rename leaves the toolbar. It is done by clicking the name.

The menu behaves like the existing Share and Download menus: Escape closes
it, choosing an item closes it. It must also close on a click outside it.
If the existing menus do not do that, fix all three the same way.

### Narrow screens

Below 768px the two text buttons drop their words and become icon buttons
with the same accessible labels. Nothing else changes there.

## Part 2: add a slide, and a hint on the slide

### Add slide

Two buttons, both labelled "Add slide", shown only where editing is allowed
(the same condition as the existing "Add box" button):

- In the bar above the preview, next to "Add box". It inserts a new slide
  directly after the slide being shown.
- In the all-slides view, a wide dashed button under the last slide. It
  adds a slide at the end.

Both do the same thing through one new function in `src/core/edit.ts`:

```ts
insertSlideAfter(source: string, slide: Slide): EditResult
```

It inserts a slide break and the line `# New slide` after the given slide.
Speaker notes that belong to the given slide must stay with it. The front
matter block at the top of the file must not be touched.

After the insert:

- the new slide becomes the shown slide, and the preview scrolls to it;
- the words "New slide" are selected in the editor, so typing replaces them;
- one undo step removes the whole new slide.

### Hint on the slide

A single faint line of text, centred near the bottom of the slide frame:

> Drag on the slide to draw a box. Double-click text to edit it.

Rules:

- It shows only on the slide being shown, only when that slide has no
  boxes, and only where editing is allowed.
- It goes away for good the first time the person draws a box or uses
  "Add box". Remember this in `localStorage`. If storage is unavailable,
  the hint simply shows each session.
- It is part of the editing overlay, never of the rendered slide. It must
  not appear in present mode, downloads, print or thumbnails.
- It must not catch mouse events. Dragging through it still draws a box.
- Screen readers skip it. The buttons already carry the same information.

The builder must check that both sentences are true before shipping the
text. If double-click does not edit plain slide text in some case, change
the wording to match what the app does.

## Part 3: rename in place, delete with undo

### Rename

The deck name in the toolbar is a button inside the `h1`. Clicking it, or
pressing Enter or F2 on it, turns it into a text field holding the name,
with all the text selected.

- Enter or leaving the field saves.
- Escape cancels.
- An empty name, or a name of only spaces, cancels.
- An unchanged name does nothing.
- The saved name is trimmed, as today.
- While a linked file is read-only or needs access again, rename behaves as
  it does today. This design does not change what rename is allowed to do.

`window.prompt` is removed.

### Delete with undo

Choosing "Delete deck" deletes at once, with no question. A notice appears:

> Deleted "Deck name". [Undo]

How it works:

- The deck record gets a `deletedAt` time. Nothing else about it changes,
  and its images stay. This is a plain new field. No database version
  change is needed.
- A deck with `deletedAt` set is left out of the deck list, the backup file
  and every other listing.
- Opening the address of a deleted deck behaves as it does today for a
  deck that does not exist.
- Clicking Undo must not also trigger the permanent removal when the
  notice closes.
- The app switches to another deck, or makes a new empty one if none is
  left, as it does today.
- Undo clears `deletedAt`, refreshes the list and opens the deck again.
- The deck and its images are removed for good when the notice goes away
  without Undo: when its timer ends or the person dismisses it.
- On start-up, any deck with `deletedAt` older than one minute is removed
  for good. This cleans up after a tab that was closed while the notice
  was showing.
- Other open tabs must drop the deck from their lists, using the existing
  cross-tab message channel. If another tab has that deck open, it behaves
  as it does today when a deck is deleted elsewhere.
- A linked file on disk is never touched by delete or undo. Undo brings the
  link back with the deck, because the record was never removed.

`window.confirm` is removed from this flow.

## Tests

- Unit tests for `insertSlideAfter`: a middle slide, the last slide, a
  slide with speaker notes, a deck with front matter, an empty deck.
- Unit tests for the storage change: a deleted deck is hidden from lists
  and backup, undo restores it with its images, start-up cleanup removes
  only old ones.
- End-to-end tests for: the More menu and each item in it; rename by click,
  Enter, Escape and empty name; delete then Undo; delete then let the
  notice end; both Add slide buttons; the hint showing, and staying gone
  after the first box.
- About 21 existing end-to-end checks click toolbar buttons by name (Open,
  Rename, Delete, Duplicate, Pack images, Open folder). They must be
  updated to go through the More menu or the name. Put the new steps in the
  shared test helpers so each test changes in one place. These tests change
  because the behaviour was meant to change. None may be weakened.
- The existing checks that slides render identically (the image snapshots)
  must pass unchanged.

## Left to the builder

- Exact spacing, sizes and icon choices, following `app.css` as it is.
- Whether the three menus share one small component.
- The `localStorage` key name.

## Calls made by Claude, for the owner to check

1. Duplicate and Delete go in the More menu, not in the deck list. This is
   less work and keeps every deck action in one place.
2. "Pack images" keeps its name. Renaming it is a separate, small decision.
3. Delete has no confirmation question at all. Undo is the safety net.
4. The deleted deck is kept for the life of the notice (8 seconds today),
   not in a longer-lived bin.
5. A new slide starts with the title "New slide" selected, not empty.
6. The hint disappears for good after the first box, not after a number of
   visits.
