# uslides — mouse editing, fonts and privacy mode — design

This adds three things to uslides, which is already built. The first design is
`docs/superpowers/specs/2026-11-09-uslides-design.md`. Read it first for the
deck format, the app layout and the rules this document builds on.

Points marked *my call* were decided by me (Claude), not the owner. Everything
else was the owner's choice.

## What this is and why

Today every change to a deck is typed as Markdown. The owner wants to point at
the slide and change it with the mouse: select a box, move it, resize it, make
a new one, change its colours and font, and type in it right on the slide.

They also want more variety in how slides look, so boxes and decks can use
fonts from the Google Fonts catalog.

Loading Google fonts and web images tells those websites that someone opened
the deck. So a privacy mode blocks them for decks that came from outside, until
the user allows them.

## Goals

- Select a box on the slide with the mouse. Move it, resize it, delete it,
  duplicate it, and change its colours, alignment and font from a small bar.
- Make a new box by dragging or clicking on empty space, or with an Add box
  button.
- Double-click a box and type in it, right on the slide.
- Pick a font for a box, or for the whole deck, from the Google Fonts
  catalog, with search.
- Block images and fonts from other websites for decks that came from
  outside, with a banner that lets the user allow them.

## Non-goals

- Rich text editing on the slide (bold buttons, text that looks finished
  while typing). For now, typing on the slide shows the box's Markdown. A
  rich mode may come later (see "Later").
- Dragging boxes to arbitrary pixel positions. Boxes still snap to the grid.
- Uploading your own font files.
- Mouse editing on phones. Phones can still view and present.

## Anti-goals (it fails if it does these, even if it works)

- A mouse edit that changes anything in the Markdown other than what the user
  touched. Moving a box must change only its `col` and `row`. Comments,
  spacing, attribute order and unknown attributes stay as they were.
- Losing typing. Mouse edits and typed edits share one undo history and one
  save path.
- A deck file or share link that can grant itself permission to load from
  other websites.
- Breaking offline use. A deck must still open and present with no network.
  Missing fonts fall back to a plain font, and blocked images show as
  placeholders.

## The rule everything follows: the Markdown is the truth

Every mouse action is turned into an edit of the Markdown text, applied the
same way as typing in the editor. The slide is then redrawn from the Markdown,
as it is today. Nothing about a deck is stored anywhere except its Markdown
(and, for privacy, one per-deck flag described below).

So an AI agent, a share link, a download or a linked file always sees exactly
what the user sees. Undo and redo work the same for typed and mouse edits. One
drag is one undo step.

The parser already records where each box sits in the source text: the whole
block (`range`) and its content (`contentRange`). Mouse edits use these ranges.

*My call:* to change a box's attributes, the app rewrites only that box's
opening `::: box …` line. It replaces the value of an attribute that is
already there, in place. It adds a new attribute at the end of the line. It
removes an attribute when the user sets it back to the default. Everything
else on the line stays as it was.

## Part 1: Mouse editing

### Two preview views

The preview on the right gets a switch with two views. Both stay.

- **All slides:** today's scrolling list of every slide.
- **One slide:** a single large slide, the one the editor's cursor is in,
  with previous and next buttons and the slide number. This is the
  comfortable view for mouse editing.

*My call:* mouse editing works in both views. The one-slide view is where it
is comfortable, because the handles are big enough to grab. The view choice
is remembered per browser.

*My call:* the editor and the one-slide view follow each other. Moving the
cursor to another slide shows that slide. Going to another slide with the
buttons moves the cursor to the start of that slide.

### Selecting a box

- Click a box to select it. It gets a blue outline and a handle at each
  corner and each edge.
- A small floating bar appears just above the box, like Word's mini
  toolbar. If there is no room above the box, it appears below.
- Click empty space on the slide, or press Esc, to deselect.
- *My call:* when boxes overlap, a click selects the top one. Clicking the
  same spot again selects the next one down, so a covered box can still be
  reached.
- *My call:* selecting a box also moves the editor cursor to that box's
  opening line, so the Markdown and the slide stay in step.

### The floating bar

Left to right:

| Control | What it does | What it writes |
|---------|--------------|----------------|
| Fill colour | Picks the box background | `bg=` |
| Text colour | Picks the text colour | `color=` |
| Font | Opens the font picker (Part 3) | `font=` |
| Horizontal alignment | Left, centre, right | `align=` |
| Vertical alignment | Top, middle, bottom | `valign=` |
| Bring to front / Send to back | Changes which box is on top | moves the box block in the slide's text |
| Duplicate | Copies the box | a copy of the block |
| Delete | Removes the box | removes the block |

*My call:* the colour controls show a short palette of colours that look good
with the current theme, a "none" choice that removes the attribute, and a
custom colour field that writes a hex value. Only colour forms the format
already allows are written.

*My call:* Bring to front and Send to back are included because boxes drawn
with the mouse will often overlap. Stacking follows the order of boxes in the
file, so the only way to change it is to move the block. Bring to front moves
the block to just after the slide's last box. Send to back moves it to just
before the first box.

*My call:* Duplicate places the copy one cell right and one cell down, if it
fits on the grid. Otherwise it puts the copy in the same place, on top.

Until Part 3 is built, the bar has no font control.

### Moving and resizing

- Drag the box to move it. Drag a handle to resize it.
- It snaps to the grid as you drag. A faint outline shows where it will land.
- Letting go writes the new `col` and `row`. That is one undo step.
- A box can't be dragged off the grid or made smaller than one cell.
- The grid lines show while dragging, even if they are switched off.

*My call:* keyboard, for a selected box:

| Key | Action |
|-----|--------|
| Arrow keys | Move one cell |
| Shift + arrow keys | Grow or shrink one cell from the right or bottom edge |
| Enter | Start typing in the box |
| Delete or Backspace | Delete the box |
| Ctrl/Cmd + D | Duplicate |
| Esc | Stop typing, or deselect |

### Making a new box

- **Drag on empty space** to draw a box. It snaps to the grid as you drag.
- **Double-click an empty spot with no text under it** to make a box 3
  columns wide and 2 rows high there, made smaller if it would go past the
  edge.
- A single click on empty space never makes a box. It only deselects, and in
  the all-slides view it also picks that slide. (The owner first suggested a
  click; this was changed so that clicking away from a box can't make boxes
  by accident.)
- Double-clicking free-flowing text types into it (see "Typing on the
  slide"), so it does not make a box.
- **The Add box button** makes a box even when the slide has no empty
  space. *My call:* it puts a box 4 columns by 2 rows in the first free area,
  scanning from the top left. If there is none, it puts the box in the middle
  of the slide, on top of everything. The button sits with the view switch
  above the preview.

"Empty space" is any part of the slide not covered by a box, even if the
slide has free-flowing Markdown underneath.

A new box is added as a `::: box col=… row=…` block at the end of the slide's
text, so it is on top. It starts empty and goes straight into typing mode.

*My call:* an empty box shows a dashed outline in the editor preview, so it
can be seen and selected. It shows nothing in present mode or downloads.

### Typing on the slide

- Double-click a box, or press Enter while it is selected, to type in it.
- The box shows its own Markdown, in the same place and size on the slide,
  in a plain monospace font. Symbols like `**` and `###` are visible.
- The text is the box's content, between the `::: box` line and the closing
  `:::`. The opening and closing lines are not shown.
- Every keystroke updates the Markdown on the left straight away.
- Click outside the box or press Esc to stop. The box goes back to looking
  finished.

*My call:* the free-flowing Markdown of a slide (the part outside any box)
can be typed into the same way, by double-clicking where it shows. It can't
be moved or resized, since it always fills the slide. In the source, that
text can sit in several pieces, before, between and after the box blocks.
Typing edits only the piece under the double-click: the run of lines between
two box blocks (or a box block and the slide's edge). The other pieces and
the boxes are not touched.

*My call:* undo. Typing on the slide goes through the same editor history as
typing on the left, and is grouped the same way, so Ctrl/Cmd+Z undoes a burst
of typing, not single letters. The typing area may be a second small editor
view working on the same text, as long as there is one history. It is one
component, so the rich mode in "Later" can replace it.

*My call:* if the box's Markdown is longer than the box can show, the typing
area scrolls inside the box. It doesn't grow past the box.

### Where mouse editing works

Mouse editing is for wide screens, where the editor is shown (768 pixels and
wider). On narrower screens the preview stays view-only, as today. *My
call:* it uses pointer events, so it also works with a pen or finger on a
wide touch screen, but it is not designed around touch.

## Part 2: Privacy mode

### What it blocks

Anything that makes the browser contact another website while showing a
deck:

- images with `http:` or `https:` addresses;
- Google fonts (Part 3).

These always show, because they never leave the device:

- images embedded in the deck (`data:` images);
- images stored with the deck in this browser;
- images from a linked folder.

Links in a deck are not loaded until clicked, so they are not affected.

### Which decks start blocked

A deck that came from outside starts blocked:

- opened from a share link;
- imported, opened or linked from a file or folder;
- dropped onto the app.

Decks made inside uslides load normally. *My call:* that includes copies made
with Duplicate, which keep the choice of the deck they were copied from.

*My call:* restoring a backup keeps each deck's saved choice. The choice is
added to the backup file. Backups made before this change restore as blocked.

*My call:* decks already saved in the browser when privacy mode ships start
allowed. The app has no record of where they came from, and blocking them
would put a banner on all of the owner's own decks. The cost: a deck opened
from a stranger's link before this change keeps loading from other websites.

### The banner

A blocked deck that refers to something from another website shows a banner
above the preview. *My call* on the wording:

> This deck wants to load images and fonts from 2 other websites. They are
> blocked until you allow them.

The banner names the websites when expanded. It has two buttons:

- **Allow once:** loads them until the app is closed or reloaded.
- **Always allow for this deck:** remembers the choice for this deck.

A deck that refers to nothing outside never shows the banner.

### What a blocked deck looks like

- Each blocked image shows as a grey box with its description (alt) text.
- Each blocked font is replaced by the theme's normal font.
- Present mode and print follow the same rule as the preview.

### Where the choice is stored

The choice is stored with the deck in the browser's database, not in the
Markdown. So a deck file, a share link or an AI agent editing a linked file
can never grant itself permission. *My call:* if a linked file's text changes,
the deck keeps its choice. Its websites may change, and the banner then shows
the new count.

### The app-wide setting

The deck list's menu gets a setting: **Ask before loading anything from other
websites**. When it is on, every deck, including your own, starts blocked
until allowed. It is off by default. *My call:* it is stored per browser.

*My call:* how the setting and the per-deck choice combine. Each deck stores
one of three states: allowed, blocked, or not chosen. Decks made inside
uslides are "not chosen". Decks from outside are "blocked". "Always allow for
this deck" makes it "allowed". A "not chosen" deck loads freely when the
setting is off and is blocked when it is on. An "allowed" deck stays allowed
either way, because the user said so for that deck.

### What it does not change

- **The downloaded .html file** already embeds everything and blocks the
  network, so it never contacts other websites when opened.
- **Pack images** fetches images when clicked. Clicking it counts as
  allowing, for that fetch only.
- *My call:* **Download .html** on a blocked deck has to fetch images and
  fonts to embed them. Like Pack images, clicking it counts as allowing, for
  that fetch only. The deck itself stays blocked.
- *My call:* **Print / PDF** uses whatever is currently allowed.

## Part 3: Fonts

### In the format

A box can name a font:

```markdown
::: box col=1-6 row=2-4 font="Playfair Display"
## A headline in a serif
:::
```

The deck settings can name a default font for every box and every slide:

```yaml
---
title: Q3 review
font: Inter
---
```

A box's own font wins over the deck's.

- Names come from the Google Fonts catalog and match its spelling. Matching
  ignores upper and lower case.
- A name with spaces must be wrapped in double quotes in a box attribute.
- An unknown name gives a warning in the editor: `Unknown font "X". Pick one
  from the font menu, or check the spelling on fonts.google.com.` The text
  falls back to the theme's font.
- *My call:* `font=default` (or leaving it out) means the theme's font.

*My call:* fonts apply to box text and to free-flowing text. Code blocks keep
the monospace font, so code stays readable.

*My call:* there is no per-slide font in this version. The deck default and
per-box fonts cover the owner's need.

### The font picker

The font control in the floating bar opens a picker. The same picker sets the
deck's default font. *My call:* the deck-wide picker is reached from the
toolbar, next to Rename.

- A search box at the top filters by name as you type.
- The list shows every family in the catalog, about 1,800. Each name is
  drawn in its own font.
- *My call:* the list can be narrowed by style group (serif, sans serif,
  display, handwriting, monospace), and popular fonts are listed first.
- Choosing a font writes it straight into the Markdown. One choice is one
  undo step.

*My call:* the app ships with the catalog as a list of names, style groups,
popularity order and available weights. It is small and works offline. It
does not call the Google Fonts API, which would need a key. A script in the
repo refreshes the list from Google's public font metadata. Someone runs it by
hand now and then and commits the result.

*My call:* each name is drawn in its own font by loading just the letters of
that name from Google Fonts, and only for names scrolled into view. Under
privacy mode, while blocked, the names show in the plain font with a "Show
previews" button. Pressing it counts as allowing, for the picker only.

### Loading fonts

- Fonts load from Google Fonts while online.
- *My call:* the regular, bold and italic styles are loaded, where the family
  has them, so Markdown `**bold**` and `*italic*` look right.
- *My call:* the offline helper (service worker) keeps a copy of every font
  file it has loaded. So a font that has loaded once still works offline,
  the same way web images already do.
- A font that has never loaded on this device shows in the theme's font until
  it can load.
- The fit-to-box sizing and the cut-off text warning are measured again once
  a font has loaded. A wider font can make text spill out of its box.
- Present and print wait for the deck's fonts to load, up to a short limit,
  before showing or printing. *My call:* the limit is 3 seconds.

### Downloads and links

- **Download .html** embeds the font files, so the file stays fully offline.
  If a font can't be fetched, the file uses the theme's font, and the app
  says which font was left out, as it does for images.
- **Download .md** and share links carry only the font names.
- *My call:* print / PDF uses the fonts as loaded in the app.

### What changes from the first design

The first design said fonts must never load from a CDN. The owner has chosen
to allow Google Fonts. The offline rule still holds: decks always open and
present offline, with a plain font standing in for any font not yet loaded.

## The SKILL file and llms.txt

`skill/uslides/SKILL.md` gets:

- the `font` box attribute and the `font` deck setting, with three or four
  safe example names;
- a note that a font name must match the Google Fonts catalog, and that names
  with spaces need double quotes;
- a note that web images and fonts in decks the user opens from a file or
  link are blocked until the user allows them, so packing images is the
  reliable way to make a deck look right everywhere.

The examples must still parse with no warnings, as the existing test checks.

## Build order

Each part ships on its own and leaves the app working.

1. **Mouse editing** (Part 1), without the font control.
2. **Privacy mode** (Part 2). It comes before fonts, so Google fonts never
   ship without a way to block them.
3. **Fonts** (Part 3), including the font control in the floating bar and
   the SKILL changes.

## Later

- **Rich typing on the slide.** Type into the slide as it will look, with
  bold and list buttons, and have the app write the Markdown. The owner
  chose Markdown-in-place for now and may switch later. The typing area
  should be one component, so it can be swapped without touching selection,
  dragging or the bar.
- **Per-slide fonts**, through the slide comment.

## Left to the builder

- The exact look of the selection outline, handles, floating bar, banner and
  font picker, within the app's existing style.
- How the floating bar avoids running off the edge of the preview.
- The palette colours for each theme.
- How the font catalog is stored and searched, as long as search feels
  instant.
- How the service worker caches fonts, within the offline rule above.
- How to test dragging and font loading without the network in the end-to-end
  tests.
