import { load } from 'js-yaml';
import { parseGrid } from './attrs';
import { fencedLines } from './fences';
import type { Grid, SourceRange, Warning } from './types';

export type DeckSettings = {
  title?: string;
  grid: Grid;
  aspect: '16:9' | '4:3';
  theme: string;
};

const KNOWN_KEYS = ['title', 'grid', 'aspect', 'theme'];
const DEFAULT_GRID: Grid = { cols: 12, rows: 6 };

/** Strips a BOM and converts CRLF / CR line endings to LF. */
export function normalizeSource(src: string): string {
  return src.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
}

type Block = {
  data: Record<string, unknown>;
  /** Offset of the first character of the YAML content (after the opening line). */
  contentStart: number;
  /** Offset where the closing `---` line begins. */
  contentEnd: number;
  /** Offset of the first character after the closing line and its newline. */
  bodyStart: number;
};

/** Finds a valid settings block: opening `---`, closing `---`, a YAML mapping with a known key. */
function findBlock(src: string): Block | null {
  if (!src.startsWith('---\n')) return null;
  const contentStart = 4;
  let pos = contentStart;
  while (pos <= src.length) {
    const nl = src.indexOf('\n', pos);
    const end = nl === -1 ? src.length : nl;
    if (src.slice(pos, end) === '---') {
      let data: unknown;
      try {
        data = load(src.slice(contentStart, pos));
      } catch {
        return null;
      }
      if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
      const record = data as Record<string, unknown>;
      if (!KNOWN_KEYS.some((k) => k in record)) return null;
      return {
        data: record,
        contentStart,
        contentEnd: pos,
        bodyStart: nl === -1 ? src.length : nl + 1,
      };
    }
    if (nl === -1) break;
    pos = nl + 1;
  }
  return null;
}

/** Range of the line in the block that starts with `key:`; falls back to the whole block. */
function keyRange(src: string, block: Block, key: string): SourceRange {
  let pos = block.contentStart;
  while (pos < block.contentEnd) {
    const nl = src.indexOf('\n', pos);
    const end = nl === -1 || nl > block.contentEnd ? block.contentEnd : nl;
    const line = src.slice(pos, end);
    if (new RegExp(`^["']?${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']?\\s*:`).test(line)) {
      return { from: pos, to: end };
    }
    pos = end + 1;
  }
  return { from: block.contentStart, to: block.contentEnd };
}

export function parseSettings(src: string): {
  settings: DeckSettings;
  bodyStart: number;
  warnings: Warning[];
} {
  const settings: DeckSettings = { grid: { ...DEFAULT_GRID }, aspect: '16:9', theme: 'light' };
  const block = findBlock(src);
  if (!block) return { settings, bodyStart: 0, warnings: [] };

  const warnings: Warning[] = [];
  const warn = (key: string, message: string) =>
    warnings.push({ message, range: keyRange(src, block, key) });

  for (const [key, value] of Object.entries(block.data)) {
    switch (key) {
      case 'title':
        if (value !== null && value !== undefined) settings.title = String(value);
        break;
      case 'grid': {
        const grid = typeof value === 'string' ? parseGrid(value) : null;
        if (grid) settings.grid = grid;
        else warn(key, `Invalid grid "${String(value)}". Use COLSxROWS, such as 12x6. Using 12x6.`);
        break;
      }
      case 'aspect':
        if (value === '16:9' || value === '4:3') settings.aspect = value;
        else warn(key, `Invalid aspect "${String(value)}". Use 16:9 or 4:3. Using 16:9.`);
        break;
      case 'theme':
        if (typeof value === 'string' && value.trim() !== '') settings.theme = value.trim();
        else warn(key, `Invalid theme "${String(value)}". Using light.`);
        break;
      default:
        warn(key, `Unknown setting "${key}" was ignored.`);
    }
  }
  return { settings, bodyStart: block.bodyStart, warnings };
}

function stripInlineMarkdown(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/\s+#+\s*$/, '')
    .trim();
}

/** Deck name: settings title, else the first heading's text, else "Untitled". */
export function deckName(src: string): string {
  const { settings, bodyStart } = parseSettings(src);
  if (settings.title && settings.title.trim()) return settings.title.trim();

  const lines = src.slice(bodyStart).split('\n');
  const fenced = fencedLines(lines);
  for (const [i, line] of lines.entries()) {
    if (fenced[i]) continue;
    const h = /^ {0,3}#{1,6}\s+(.*)$/.exec(line);
    if (h) {
      const text = stripInlineMarkdown(h[1]!);
      if (text) return text;
    }
  }
  return 'Untitled';
}

function yamlScalar(value: string): string {
  const plain = /^[A-Za-z0-9][A-Za-z0-9 _.,()/&-]*$/.test(value);
  const reserved = /^(true|false|null|yes|no|on|off|y|n|[\d.+-]+)$/i.test(value);
  return plain && !reserved && value === value.trim() ? value : JSON.stringify(value);
}

/** Sets `title:` in the settings block, creating the block if needed. */
export function setTitle(src: string, title: string): string {
  const line = `title: ${yamlScalar(title)}`;
  const block = findBlock(src);
  if (!block) return `---\n${line}\n---\n\n${src}`;

  const range = 'title' in block.data ? keyRange(src, block, 'title') : null;
  if (range) return src.slice(0, range.from) + line + src.slice(range.to);
  return src.slice(0, block.contentStart) + line + '\n' + src.slice(block.contentStart);
}
