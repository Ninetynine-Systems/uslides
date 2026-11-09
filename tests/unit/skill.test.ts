import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { APP_ORIGIN } from '../../src/config';
import { parseDeck } from '../../src/core/parse';
import { readShareHash } from '../../src/share/link';

const SKILL_DIR = 'skill/uslides';
const skill = readFileSync(`${SKILL_DIR}/SKILL.md`, 'utf8');
const llms = readFileSync('public/llms.txt', 'utf8');
const exampleFiles = readdirSync(`${SKILL_DIR}/examples`).filter((f) => f.endsWith('.md'));
const example = (file: string) => readFileSync(`${SKILL_DIR}/examples/${file}`, 'utf8');

/** The contents of every fenced block with the given info string, such as `markdown deck`. */
function fencedBlocks(text: string, info: string): string[] {
  const re = new RegExp('^```' + info + '\\n([\\s\\S]*?)^```$', 'gm');
  return [...text.matchAll(re)].map((m) => m[1]!);
}

describe('SKILL.md', () => {
  const decks = fencedBlocks(skill, 'markdown deck');

  it('starts with the skill frontmatter', () => {
    expect(skill.startsWith('---\nname: uslides\ndescription: ')).toBe(true);
  });

  it('has at least three example decks', () => {
    expect(decks.length).toBeGreaterThanOrEqual(3);
  });

  it.each(decks.map((d, i) => [i, d] as const))('example deck %i parses with no warnings', (_i, deck) => {
    expect(parseDeck(deck).warnings).toEqual([]);
  });

  it.each(exampleFiles)('includes examples/%s in full', (file) => {
    expect(decks).toContain(example(file));
  });

  it('shows a #md= link that is encodeURIComponent of the deck', () => {
    expect(fencedBlocks(skill, 'text')).toContain(`${APP_ORIGIN}/#md=${encodeURIComponent('# Hello\n')}\n`);
  });

  it('gives a #z= snippet that makes a link the app can read', async () => {
    const [code] = fencedBlocks(skill, 'js');
    expect(code).toBeDefined();
    const makeLink = new Function(`${code}\nreturn uslidesLink;`)() as (md: string) => Promise<string>;
    const deck = example('boxes.md');
    const link = await makeLink(deck);
    expect(link.startsWith(`${APP_ORIGIN}/#z=`)).toBe(true);
    expect(await readShareHash(link.slice(link.indexOf('#')))).toBe(deck);
  });

  const hasPython = (() => {
    try {
      execFileSync('python3', ['--version']);
      return true;
    } catch {
      return false;
    }
  })();

  it.skipIf(!hasPython)('gives a Python #z= recipe that prints a full link the app can read', async () => {
    const [code] = fencedBlocks(skill, 'python');
    expect(code).toBeDefined();
    const deck = example('boxes.md');
    const script = `import sys\nmd = sys.stdin.read()\n${code}print(link)\n`;
    const link = execFileSync('python3', ['-I', '-c', script], { input: deck, encoding: 'utf8' }).trim();
    expect(link.startsWith(`${APP_ORIGIN}/#z=`)).toBe(true);
    expect(await readShareHash(link.slice(link.indexOf('#')))).toBe(deck);
  });

  it('tells agents to quote a title that contains a colon', () => {
    expect(skill).toContain('title: "Q3 review: what changed"');
  });
});

describe('the examples folder', () => {
  it('holds the three example decks', () => {
    expect(exampleFiles.sort()).toEqual(['boxes.md', 'pixels.md', 'plain.md']);
  });

  it.each(exampleFiles)('%s parses with no warnings', (file) => {
    expect(parseDeck(example(file)).warnings).toEqual([]);
  });
});

describe('llms.txt', () => {
  it('links to the SKILL file', () => {
    expect(llms).toContain(`${APP_ORIGIN}/SKILL.md`);
  });
});

describe('URLs', () => {
  it.each([
    ['SKILL.md', skill],
    ['llms.txt', llms],
  ])('every web address in %s is on the uslides site', (_name, text) => {
    const urls = text.match(/\bhttps?:\/\/[^\s)>\]"'`]+/g) ?? [];
    expect(urls.length).toBeGreaterThan(0);
    // The origin must end there: `https://uslides.ninetynine.systems.example.com` is not allowed.
    for (const url of urls) expect(url).toMatch(/^https:\/\/uslides\.ninetynine\.systems(?:[/?#]|$)/);
  });
});
