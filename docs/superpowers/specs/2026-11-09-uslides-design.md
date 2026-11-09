# uslides — design

Date: 2026-11-09
Status: draft, waiting for approval

## What this is and why

uslides is a slides app that runs entirely in the browser. You open the page
and start typing. There is no account, no server, and nothing to set up. It
works offline, installs as an app (a PWA), and is served as static files from
GitHub Pages. Excalidraw is the model for how it should feel: open it and use
it.

The owner looked for a tool like this and could not find one. The gap is a
slides tool that is equally good for people and for AI agents. Agents are a
first-class user, not an afterthought. So a deck is one plain-text Markdown
file. An agent can write that file reliably. A person can read and edit it
just as easily. The repo ships a SKILL file that teaches an agent the format
and how to hand a deck over.

Success looks like this. Someone with a meeting in a few hours can make two
slides in minutes, with no setup. An agent can produce a correct, good-looking
deck on its first try just by following the SKILL file.

## Goals

- Make a deck by typing Markdown on the left and seeing slides on the right.
- Simple slides need no layout syntax at all. Text just fills the slide.
- When you want layout, place boxes on a grid by row and column numbers.
- Present full screen, share as a link, and download as `.md`, PDF, or a
  single `.html` file.
- Work fully offline once loaded. Install as a PWA.
- Give agents two ways to deliver a deck: write a file, or produce a link.

## Non-goals (v1)

- Accounts, a backend, or any server-side storage.
- Real-time collaboration.
- Animations and slide transitions beyond a plain cut.
- Dragging boxes to arbitrary pixel positions. Every position is on the grid.
- Importing PowerPoint, Keynote, or Google Slides.
- Maths typesetting, diagrams (Mermaid), and embedded video.

## Anti-goals (it fails if it does these, even if it works)

- Asking the user to configure anything before the first slide.
- Making a two-slide deck feel like ceremony: required settings, required
  boxes, required themes.
- A format agents get wrong often. If the SKILL examples need caveats to
  work, the format is too clever.
- Losing work. Autosave must be reliable.

## Later (designed for, not built in v1)

- **Click-to-edit on the slide** (mockup "C"). You click text on the rendered
  slide and type, and the edit is written back into the Markdown. The
  Markdown stays the only source of truth. Build the parser so it records
  where each box and text block sits in the source text, so this can be
  added without a rewrite.
- **Presenter view.** A second window with speaker notes, a timer and the
  next slide.
- **Browser commands for agents.** A small `window.uslides` set of functions
  (load deck, get deck, go to slide) that a browser-driving agent can call
  instead of clicking around.
- **A command-line checker.** Something like `npx uslides check deck.md` that
  an agent runs to find format mistakes. To keep this possible, the parser
  must be a separate module with no browser dependencies.

## The deck format

A deck is one UTF-8 Markdown file, usually named `something.md`. Below is the
whole format. The SKILL file will teach the same rules with examples.

### Deck settings

The file may start with a YAML block between two `---` lines. It is optional.

```yaml
---
title: Why we should switch to X
grid: 12x6        # columns x rows. Default 12x6.
aspect: 16:9      # 16:9 (default) or 4:3
theme: light      # light (default), dark, or another built-in theme
---
```

Unknown keys are ignored, with a warning in the editor.

*My call:* the parser is lenient here, because agents that know other slide
tools often start a file with `---`. The opening block counts as settings only
if it has a closing `---`, parses as a YAML mapping, and has at least one
known key. Otherwise a leading `---` is ignored, and everything is read as
slides.

### Slides

A line that contains only `---` starts a new slide. This only counts outside
fenced code blocks, and it does not count as the closing line of the settings
block. Because `---` is taken, a horizontal rule inside a slide must be
written as `***`. Text directly above a `---` line is not treated as a
heading (normal Markdown would do that). The parser must not do it here.

### Slides without boxes

A slide with no boxes renders its Markdown across the whole slide. It uses the
theme's normal styles: headings, lists, bold, links, code, images, tables,
quotes. Most slides should look like this.

### Per-slide settings

If the first non-blank line of a slide is an HTML comment that starts with
`slide`, it holds settings for that slide only:

```markdown
<!-- slide grid=32x18 bg=#111111 color=white -->
```

Supported keys: `grid`, `bg`, `color`. A per-slide `grid` replaces the deck
grid on that slide. That is how one slide can use a fine grid for pixel art.

*My call:* a comment line instead of per-slide YAML. A YAML block would need
`---` lines, which already mean "new slide", so it would be confusing for
people and easy for agents to get wrong. Comments are also invisible in
ordinary Markdown viewers such as GitHub.

### Boxes

A box wraps some Markdown and places it on the grid:

```markdown
::: box col=1-7 row=2-6 bg=#1e3a8a color=white
## Left title
- a point
:::
```

- The box starts with a line `::: box` plus attributes, and ends with a line
  `:::`.
- `col` and `row` are 1-based and inclusive. `col=3` means one column.
  `col=1-7` means columns 1 to 7. `row=2-6` means rows 2 to 6.
- If `col` is missing, the box spans every column. The same goes for `row`.
- Positions past the edge of the grid are cut back to the edge, with a
  warning in the editor.
- Attribute values may be wrapped in double quotes. Unknown attributes are
  ignored, with a warning.
- Boxes inside boxes are not allowed in v1. The inner one renders as plain
  text, with a warning.

Box attributes:

| attribute | values | default |
|-----------|--------|---------|
| `col`, `row` | `n` or `a-b` | whole grid |
| `bg` | hex colour (`#rgb`, `#rrggbb`, `#rrggbbaa`) or a CSS colour name | transparent |
| `color` | text colour, same values as `bg` | theme text colour |
| `align` | `left`, `center`, `right` | `left` |
| `valign` | `top`, `middle`, `bottom` | `top` |
| `fit` | for images: `contain` or `cover` | `contain` |

*My call:* the `:::` wrapper. It is an existing Markdown convention
(markdown-it's container plugin, Pandoc's fenced divs). The start and end of
each box are explicit, which matters when there are many boxes.

### Stacking

Boxes are drawn in the order they appear in the file. Later boxes draw on top
of earlier ones. A 1×1 box with only a `bg` is a single "pixel". So you can
draw a picture box by box on a fine grid.

If a slide has boxes and also Markdown outside any box, that loose Markdown
fills the whole slide. It is drawn first, underneath every box.

### Text that doesn't fit

Text in a box, or on a slide with no boxes, shrinks to fit its area, down to a
minimum size. If it still does not fit at the minimum size, it is cut off.
The editor shows a warning on that slide. This matters most for agents, which
cannot see the rendered result.

### Images

`![alt](src)` works anywhere, including inside boxes. `src` can be:

1. **A web URL** (`https://...`). It needs a network connection the first time
   it loads. *My call:* images that have loaded once are cached so the deck
   still shows them offline.
2. **A relative path** (`./chart.png`). It resolves when the user opened a
   folder, or dropped the image files in together with the `.md` file.
   Otherwise the slide shows a clear placeholder that says the image is
   missing. *My call:* image files dropped in with a deck are copied into
   IndexedDB next to that deck, so they survive a reload in every browser.
   Duplicating a deck copies them, and deleting a deck deletes them. Share
   links do not carry them. The app warns about that when sharing. In Chrome
   and Edge, if the deck came from a folder and the browser forgot access
   after a reload, the app shows one "Allow access to the folder again"
   button.
3. **A `data:` URI** (base64). It always works, but makes the file large.

Pasting or dropping an image into the editor embeds it as a `data:` URI. The
editor folds long `data:` URIs into a small chip so the text stays readable.
A "Pack images" action turns web and relative images into `data:` URIs, for
when you want one self-contained file. The SKILL file tells agents to prefer
URLs and relative paths and to never write base64 by hand.

### Speaker notes

Any HTML comment that starts with `note:` is a speaker note. It is never shown
on the slide. In v1 it is shown in the editor and included in the exported
`.md`. The presenter view will use it later.

### Safety

Decks can come from share links written by strangers, so all deck content is
untrusted:

- Raw HTML in Markdown is not rendered. The only comments the app reads are
  `slide` and `note:` comments.
- Links and image sources allow only `https:`, `http:`, `data:image/...`, and
  relative paths. `javascript:` and any other scheme is dropped.
- Colour values are checked against the allowed forms above before they
  reach CSS.

## Rendering

There is one renderer, and every view uses it: the editor preview, present
mode, PDF printing, and the exported `.html` file. So what you see while
editing is exactly what you get everywhere else.

*My call:* each slide is laid out at a fixed size (1920×1080 for 16:9) and
scaled to fit wherever it is shown. Text sizes and the fit-to-box rule then
behave the same at every screen size. The grid is a CSS grid with
`columns × rows` equal cells. Grid lines show in the editor preview only, and
can be turned off.

Themes set fonts, sizes, colours and spacing. v1 ships `light` and `dark`.
Fonts must work offline: either system fonts or fonts bundled with the app,
never fonts loaded from a CDN.

## The app

### Layout

A list of your decks (it can be collapsed), the Markdown editor, and the live
preview of every slide, side by side. On a phone you can view and present.
Editing is designed for a desktop screen.

The first time someone opens the app, they land on a short sample deck that
explains the format by example. They can start typing right away.

### Storage

- Decks are stored in the browser's IndexedDB (its built-in local database).
  Every change is saved automatically.
- The deck list supports new, rename, duplicate and delete. Delete asks to
  confirm.
- *My call on deck names:* the name shown is the `title` setting. If there is
  none, it is the first heading. If there is no heading, it is "Untitled".
  Rename writes the `title` setting into the Markdown, adding a settings
  block if needed. The name stays in the text, so it survives export and
  sharing. Renaming a deck linked to a file does not rename the file.
- Nothing ever leaves the browser unless the user exports or shares.
- *My call on data loss:* Safari deletes a site's saved data after about
  7 days without a visit, unless the app is installed. Other browsers can
  clear it when the disk is low. So the app asks the browser for permanent
  storage (`navigator.storage.persist()`). In Safari, when the app is not
  installed, it shows a one-time note recommending install or download.
  There is also a "Back up all decks" button that saves one file, and a
  matching restore.

### Working with a file on disk

- Open or drag in a `.md` file. The app makes a deck from it.
- In Chrome and Edge, the app keeps a link to the original file, using the
  browser's File System Access API. It checks the file for changes about once
  a second, and reloads the deck when the file changes. That is how you watch
  an agent edit slides live. Edits made in the app are saved back to the same
  file. If the file and the app both changed since the last sync, the app
  asks which version to keep.
- In Safari and Firefox there is no link to the file. You re-open the file to
  see changes, and save by downloading.
- In Chrome and Edge, opening a folder instead of a file also makes relative
  image paths work.

### Present

A Present button and a keyboard shortcut open the deck full screen. Right
arrow, Down arrow, Space, Page Down and a click go forward. Left arrow, Up
arrow and Page Up go back. Home and End go to the first and last slide. Esc
leaves. The URL records the current slide, so a reload stays on it.

### Share as a link

The whole deck is packed into the part of the URL after `#`. Browsers never
send that part to the server. So sharing still works with no backend, and
GitHub Pages never sees the deck. There are two link forms:

- `#z=<data>`: made by the app. The Markdown is compressed with deflate
  (built into browsers as `CompressionStream`) and base64url-encoded. Short.
- `#md=<data>`: the Markdown percent-encoded as plain text, the way URLs
  normally encode text. Not compressed. This form exists so that an agent
  with no way to run code can still build a link by hand.

Opening a link always makes a new deck in the local list. It never overwrites
an existing deck. If a link is long enough that chat apps may cut it off,
the app warns and suggests downloading the file instead. *Builder's call:*
the exact length threshold.

### Download

- **`.md`:** the source text.
- **PDF:** the browser's print dialog, with print styles set to one slide per
  page at the deck's aspect ratio. No PDF library.
- **Single `.html` file:** the deck, a small player (the renderer plus present
  mode only, no editor), and images packed in as `data:` URIs. It opens in
  any browser, offline, without the app.

### Install and offline

The app is a PWA. After the first visit, everything works with no network,
including the editor, present mode and all exports. When a new version is
deployed, the app shows a small "Update available — reload" notice. It never
reloads by itself in the middle of editing.

## The SKILL file

The repo ships `skill/uslides/SKILL.md`. It follows the standard agent skill
format (a short frontmatter `name` and `description`, then instructions). The
same file is also published with the app at
`https://uslides.ninetynine.systems/SKILL.md`, and is linked from
`https://uslides.ninetynine.systems/llms.txt`, so an agent can fetch it from
the web.

It teaches:

1. The format, as short rules plus three complete example decks: plain text
   slides, a box layout, and a small pixel-art slide.
2. How to deliver a deck:
   - If the agent can write files: write `name.md`, and tell the user to open
     it in the app (or that it will update live if it's already open).
   - If the agent cannot write files: build a `#md=` link. If the agent can
     run code: build a `#z=` link, which is shorter.
3. Rules that keep decks working: keep text short for the box size, never
   write base64 images, use `***` for a horizontal rule, and stay inside the
   grid.

Every example deck in the SKILL file is also a test case. An automated test
renders each one and fails if there are any warnings. That way the SKILL file
cannot drift out of date with the parser.

## How it's built

All of these are my calls. The owner asked for TypeScript plus whatever fits
best and will last, hosted on GitHub Pages.

- **TypeScript** everywhere.
- **Vite** to build plain static files. The app lives for good at
  `https://uslides.ninetynine.systems/`. That is a custom domain on GitHub
  Pages, served from the root, so the build's base path is `/`. The repo has
  a `CNAME` file containing `uslides.ninetynine.systems`. The DNS record for
  that name (a `CNAME` pointing at the GitHub Pages host) is set up by the
  owner. All share links, `SKILL.md` and `llms.txt` use this address.
- **vite-plugin-pwa** for installing and working offline.
- **React** for the UI. It has the longest track record, and future
  contributors and agents know it best.
- **CodeMirror 6** for the Markdown editor. It handles Markdown well, and
  folding `data:` URIs fits its model.
- **markdown-it** with **markdown-it-container** to parse Markdown and `:::`
  boxes. The slide splitting and the `slide`/`note:` comments are our own
  layer on top. The parser is a separate module with no browser or React
  imports, so the future command-line checker can reuse it.
- **IndexedDB** for storage, through a small wrapper such as `idb`.
- **Vitest** for unit tests (mainly the parser). **Playwright** for browser
  tests (rendering, present mode, sharing, offline, the SKILL examples).
- **GitHub Actions** builds, runs the tests, and deploys to GitHub Pages on
  every push to `main`.

The project folder is not a git repository yet. Setting one up comes first.

## Left to the builder

- Visual design of the app and the two themes. Keep it calm and plain.
- Keyboard shortcuts other than the present-mode keys above.
- The minimum text size for fit-to-box, and how the shrinking is done.
- How often to check a linked file, as long as it feels live (about 1s).
- The exact link-length warning threshold.
- Code block syntax highlighting: include it if it stays light.
- Folder layout inside the repo.
