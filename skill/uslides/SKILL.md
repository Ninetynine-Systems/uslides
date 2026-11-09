---
name: uslides
description: Write slide decks for uslides (https://uslides.ninetynine.systems) as Markdown files or share links. Use when asked to make slides, a deck or a presentation for uslides, or when a .md deck for uslides needs editing.
---

# Writing decks for uslides

uslides is a slides app that runs in the browser at https://uslides.ninetynine.systems/.
A deck is one plain Markdown file. The app shows the slides next to the text, presents
them full screen, and shares them as links. It has no server and no accounts. You
cannot see the rendered slides, so follow these rules exactly. The three examples at
the end are tested against the app and render with no warnings.

## The format

### Settings (optional)

The file may start with a settings block between two `---` lines:

```yaml
---
title: Quarterly review
grid: 12x6
aspect: 16:9
theme: light
---
```

- `title`: the deck name in the app. Without it, the first heading is used.
- `grid`: columns x rows for boxes, written with a lowercase `x`. Default `12x6`.
  Each number is 1 to 200.
- `aspect`: `16:9` (default, slides are 1920×1080 pixels) or `4:3` (1440×1080).
- `theme`: `light` (default) or `dark`. There are no other themes.

Use only these four keys. Any other key gets a warning. The block counts as
settings only if `---` is the very first line and it holds at least one of these keys.

The block is YAML. Wrap a value in double quotes if it contains `: ` or starts with
`#`, `"`, `'`, `[`, `{`, `&`, `*`, `!`, `|`, `>`, `%` or `@`:

```yaml
title: "Q3 review: what changed"
```

Without the quotes, a `: ` makes the block invalid YAML, and a leading `#` makes the
value empty. The app warns in both cases. An invalid block is not used as settings:
it shows up as text on the first slides.

### Slides

A line that is exactly `---` starts a new slide. Nothing else may be on that line,
not even a trailing space. Inside a fenced code block it does not count. Text right
above a `---` line stays normal text. It does not become a heading.

Because `---` splits slides, write a horizontal rule as `***`.

A slide with no boxes is ordinary Markdown spread over the whole slide: headings,
lists, **bold**, *italic*, links, `code`, code blocks, tables, quotes and images.
Most slides should look like this.

### Boxes

A box puts some Markdown in a rectangle on the slide's grid:

```markdown
::: box col=1-7 row=2-6 bg=#1e3a8a color=white
## Left title
- a point
:::
```

- The box opens with a line that starts with `::: box`, then attributes. It closes
  with a line that is only `:::`. Both lines start at the beginning of the line.
- An attribute is `key=value`. Wrap a value in double quotes if you like: `bg="#fff"`.
- `col` and `row` count from 1 and include both ends. `col=3` is one column.
  `col=1-7` is columns 1 to 7. With the default 12x6 grid, `col` goes up to 12
  and `row` up to 6.
- If `col` is missing, the box spans every column. The same goes for `row`.
- A position past the edge of the grid is cut back to the edge, with a warning.
- Do not put a box inside another box. The inner `:::` line closes the outer box
  early, so the rest of the layout breaks. The app warns when this happens.

| attribute | values | default |
|-----------|--------|---------|
| `col`, `row` | `n` or `a-b` | the whole grid |
| `bg` | background colour | none (the slide shows through) |
| `color` | text colour | the theme's text colour |
| `align` | `left`, `center`, `right` | `left` |
| `valign` | `top`, `middle`, `bottom` | `top` |
| `fit` | `contain` or `cover`, for an image | `contain` |

A colour is `#rgb`, `#rrggbb`, `#rrggbbaa`, or a CSS colour name such as `white`
or `tomato`. Anything else is ignored, with a warning.

### Stacking

Boxes are drawn in the order they appear in the file. A later box draws on top of
an earlier one. A 1×1 box with only a `bg` and no text is one coloured square, so
on a fine grid you can draw a picture square by square.

Markdown on a slide that is outside every box fills the whole slide, underneath
all the boxes.

### Slide settings

If the first non-blank line of a slide is a `slide` comment, it sets options for
that slide only:

```markdown
<!-- slide grid=16x9 bg=#0f172a color=white -->
```

The keys are `grid`, `bg` and `color`. The comment must be on one line. A slide
`grid` replaces the deck grid on that slide, so box positions on it use that grid.

### Speaker notes

A comment that starts with `note:` is a speaker note. It is never shown on the
slide. It may span several lines.

```markdown
<!-- note: Say that the numbers are from September. -->
```

Other `<!-- ... -->` comments are hidden too. Raw HTML tags are not rendered:
they show up as literal text, so do not write HTML.

### Images

Write `![what the image shows](src)`, on a slide or in a box. `src` can be:

1. A web address starting with `https:` (or `http:`). It needs a network connection
   the first time.
2. A path relative to the deck file, such as `./chart.png`. It works when the user
   opens the folder in the app, or drops the image in together with the `.md`
   file. Otherwise the slide shows an "Image not found" note in its place.
3. A `data:image/...` URI (png, jpeg, gif, webp, svg+xml or avif). Only use one the
   user gave you. Never write base64 yourself.

A box that holds only an image is filled by it. `fit=contain` shows the whole
image. `fit=cover` fills the box and crops the edges.

Links may use `https:`, `http:`, `mailto:` or a relative path. Anything else, such
as `javascript:`, is dropped and only the link text is kept.

### Text that does not fit

Text in a box, or on a slide with no boxes, shrinks to fit. The normal size is
32 pixels on a 1920×1080 slide. It never goes below 20 pixels. Text that still
does not fit is cut off. The app then shows a warning on that box's `::: box` line
in the editor (or on the slide's first line if the slide has no boxes), and under
the slide in the preview.

On the default 12x6 grid, one row is 180 pixels tall, and a box has 32 pixels of
padding on each side. So a one-row box holds one `#` heading or two short lines of text. A full-height
box holds about 15 short bullet points.

## Delivering a deck

### If you can write files

Write the deck to a file such as `quarterly-review.md`. Tell the user to open it in
uslides at https://uslides.ninetynine.systems/ with the Open button, or to drag the
file onto the page. If the deck uses relative images, tell them to use Open folder
instead (Chrome and Edge), or to drag the images in together with the file.

**Working with a linked file.** In Chrome and Edge, a file opened with Open stays
linked to the deck. You can keep editing the `.md` file on disk while the user has
it linked in uslides. The app checks the file about once a second and shows your
changes within about a second. The user does not need to reload anything. The app
also saves the user's own edits back to the file, so read the file again before each
edit. Otherwise you may overwrite changes the user made in the app.

### If you cannot write files or run code: a `#md=` link

Put the whole file in the link, after `#md=`, encoded exactly like JavaScript's
`encodeURIComponent` does it. Every character except `A-Z a-z 0-9 - _ . ! ~ * ' ( )`
becomes `%` and two hex digits per UTF-8 byte. For example a space is `%20`, a
new line is `%0A`, `#` is `%23`, `%` is `%25`, and `—` is `%E2%80%94`. Never use `+`
for a space.

End the deck with a new line, so the link ends in `%0A`. Chat apps often drop a
`.`, `)` or `!` from the end of a link. So a deck that is just `# Hello` and a new
line becomes:

```text
https://uslides.ninetynine.systems/#md=%23%20Hello%0A
```

### If you can run code: a shorter `#z=` link

A `#z=` link holds the deck compressed with raw deflate (no zlib header) and then
base64url-encoded with no `=` padding. This function makes one. It runs in Node 18
or newer and in any modern browser:

```js
async function uslidesLink(md) {
  const stream = new Blob([md]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  const bin = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
  return 'https://uslides.ninetynine.systems/#z=' + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
```

The same in Python, given the deck text in `md`:

```python
import base64, zlib
c = zlib.compressobj(wbits=-15)
data = base64.urlsafe_b64encode(c.compress(md.encode()) + c.flush()).rstrip(b'=').decode()
link = 'https://uslides.ninetynine.systems/#z=' + data
```

### Size limits

- Chat apps may cut off a link longer than about 8,000 characters. For a longer
  deck, write a file instead, or give the user the Markdown to paste.
- The app refuses a link whose deck is larger than 10 MB once decoded.
- Links never carry relative images. Only web images and `data:` images travel
  in a link.

Opening a link always adds a new deck in the user's browser. It never replaces an
existing one.

## Rules that keep decks working

- One idea per slide. A title and three to five short bullets is plenty.
- Keep box text short for the box size. Give a box with a heading and bullets at
  least three rows.
- Stay inside the grid: never use a `col` or `row` number larger than the grid.
- Use `***` for a horizontal rule, never `---`.
- Never write base64 by hand, in images or in links.
- Prefer slides without boxes. Use boxes when the layout matters.

## Examples

These decks render with no warnings and no text cut off.

### Plain slides

Most decks need nothing more than this.

```markdown deck
---
title: Why we should adopt weekly demos
---

# Why we should adopt weekly demos

A 15 minute habit that keeps the whole team informed.

<!-- note: Open with the problem. People find out what shipped from the changelog, if at all. -->

---

## The problem

- Work ships, but few people see it
- Feedback arrives after the design is fixed
- New joiners cannot tell what the team is building

---

## The proposal

Every Friday, one person shows **one thing that works**, live, for five minutes.

1. Pick a volunteer on Thursday
2. Demo on Friday at 15:00
3. Collect questions in the team channel

<!-- note: Stress that slides are not required. A live demo is better. -->
```

### A box layout

The image is `./chart.png`, next to the deck file. The orange box at the bottom
right is drawn on top of the image because it comes later in the file.

```markdown deck
---
title: Quarterly review
grid: 12x6
---

# Quarterly review

Q3 results and what comes next

---

::: box col=1-12 row=1 bg=#1e3a8a color=white align=center valign=middle
# Growth is up 24%
:::

::: box col=1-7 row=2-6
## What changed

- Faster onboarding
- A new pricing page
- Fewer support tickets
:::

::: box col=8-12 row=2-6 fit=cover
![A colour gradient placeholder chart](./chart.png)
:::

::: box col=9-12 row=6 bg=#f59e0b color=#111827 align=right valign=middle
**Best quarter yet**
:::

<!-- note: The accent box overlaps the image on purpose. Later boxes draw on top. -->
```

### Pixel art on a fine grid

The first slide sets a 16x9 grid and a dark background. Each 1×1 box is one square
of the heart.

```markdown deck
<!-- slide grid=16x9 bg=#0f172a -->

<!-- note: A fine grid turns each 1x1 box into one pixel. This slide draws a heart. -->

::: box col=6 row=3 bg=#ef4444
:::
::: box col=7 row=3 bg=#ef4444
:::
::: box col=10 row=3 bg=#ef4444
:::
::: box col=11 row=3 bg=#ef4444
:::
::: box col=5 row=4 bg=#ef4444
:::
::: box col=6 row=4 bg=#fca5a5
:::
::: box col=7 row=4 bg=#ef4444
:::
::: box col=8 row=4 bg=#ef4444
:::
::: box col=9 row=4 bg=#ef4444
:::
::: box col=10 row=4 bg=#ef4444
:::
::: box col=11 row=4 bg=#ef4444
:::
::: box col=12 row=4 bg=#ef4444
:::
::: box col=6 row=5 bg=#ef4444
:::
::: box col=7 row=5 bg=#ef4444
:::
::: box col=8 row=5 bg=#ef4444
:::
::: box col=9 row=5 bg=#ef4444
:::
::: box col=10 row=5 bg=#ef4444
:::
::: box col=11 row=5 bg=#ef4444
:::
::: box col=7 row=6 bg=#ef4444
:::
::: box col=8 row=6 bg=#ef4444
:::
::: box col=9 row=6 bg=#ef4444
:::
::: box col=10 row=6 bg=#ef4444
:::
::: box col=8 row=7 bg=#ef4444
:::
::: box col=9 row=7 bg=#ef4444
:::

---

# One box, one pixel

The previous slide is a heart made from 24 boxes of one cell each.
Each box has only a `bg`, so the heart is built from the grid itself.
```
