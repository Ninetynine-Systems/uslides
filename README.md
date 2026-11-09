# uslides

uslides is a slides app that runs in your browser. A deck is one Markdown file. It works offline, needs no account, and has no server. Your decks stay in your browser.

Open the app: https://uslides.ninetynine.systems/

## For AI agents

An agent can write decks for uslides if it follows the rules in the skill file.

- Skill file: https://uslides.ninetynine.systems/SKILL.md
- Same file in this repo: [`skill/uslides/`](skill/uslides/) (the skill plus three example decks)
- A short index for agents: https://uslides.ninetynine.systems/llms.txt

To install the skill, copy the `skill/uslides` folder into your agent's skills folder. For Claude Code, that is `~/.claude/skills/` for all projects, or `.claude/skills/` inside one project. The result should be `~/.claude/skills/uslides/SKILL.md`.

## The deck format

- A deck is one `.md` file. A line that is exactly `---` starts a new slide.
- An optional block at the top, between two `---` lines, sets `title`, `grid`, `aspect` and `theme`.
- Slides are normal Markdown: headings, lists, links, images, code and tables.
- A box puts Markdown in a rectangle on the slide grid. It starts with `::: box col=1-6 row=2-4 bg=white` and ends with `:::`.
- A comment like `<!-- note: text -->` is a speaker note. It is never shown on the slide.

[SKILL.md](skill/uslides/SKILL.md) has the full rules and examples.

## Local development

You need Node 22 or newer.

```sh
npm ci            # install dependencies
npm run dev       # start the dev server
npm run lint      # check code style
npm run typecheck # check types
npm test          # unit tests
npm run build     # build the site into dist/
npm run preview   # serve dist/ locally
```

The end-to-end tests drive a real browser. Install it once with `npx playwright install chromium`. Then run `npm run test:e2e`. It builds the site and serves it on port 4173. Some tests start extra servers on ports 4175 and 4176. Make sure ports 4173, 4175 and 4176 are free.

## Deploying

The site is hosted on GitHub Pages at https://uslides.ninetynine.systems/. The workflow in `.github/workflows/deploy.yml` runs on every push to `main`. It runs lint, type check, unit tests and end-to-end tests first. It builds and publishes the site only if they all pass.

These steps are for the repo owner, in this order:

1. Create the GitHub repo.
2. Push this code to it, on the `main` branch.
3. In the repo, open Settings, then Pages. Set the source to "GitHub Actions".
4. At your DNS provider for `ninetynine.systems`, add a `CNAME` record. The name is `uslides`. The value is `<github-user>.github.io`. Replace `<github-user>` with the GitHub user or organisation that owns the repo.
5. Back in Settings, then Pages, set the custom domain to `uslides.ninetynine.systems`. Tick "Enforce HTTPS" once GitHub offers it. This can take a few minutes after the DNS change.

The file `public/CNAME` already holds the domain name, so builds keep it.
