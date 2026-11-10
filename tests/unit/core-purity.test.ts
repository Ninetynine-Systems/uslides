import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const coreDir = join(__dirname, '../../src/core');
const forbidden = ["from 'react'", '/render/', '/app/', '/fonts/', 'window.', 'document.'];

describe('src/core purity', () => {
  const files = readdirSync(coreDir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => join(e.parentPath, e.name));

  it('has files to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(`${file.slice(coreDir.length + 1)} has no UI or browser dependencies`, () => {
      const text = readFileSync(file, 'utf8');
      for (const bad of forbidden) expect(text, bad).not.toContain(bad);
    });
  }
});
