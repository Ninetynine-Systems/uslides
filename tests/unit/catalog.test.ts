import { beforeAll, describe, expect, it } from 'vitest';
import catalog from '../../src/fonts/catalog.json';
import { allFamilies, findFamily, loadCatalog, searchFamilies } from '../../src/fonts/catalog';

beforeAll(() => loadCatalog());

describe('font catalog', () => {
  it('finds a family ignoring case', () => {
    expect(findFamily('playfair display')?.name).toBe('Playfair Display');
  });

  it('search is popular first and filters by group', () => {
    const expected = catalog.families
      .filter((family) => family.c === 'serif' && family.n.toLowerCase().includes('ro'))
      .map((family) => family.n);

    expect(searchFamilies('RO', 'serif').map((family) => family.name)).toEqual(expected);
  });

  it('the catalog has at least 1,500 families and each has a group and weights', () => {
    expect(catalog.families.length).toBeGreaterThanOrEqual(1_500);
    for (const family of catalog.families) {
      expect(['serif', 'sans-serif', 'display', 'handwriting', 'monospace']).toContain(family.c);
      expect(family.w.length + family.i.length).toBeGreaterThan(0);
      expect(family.w.every((weight) => Number.isInteger(weight))).toBe(true);
      expect(family.i.every((weight) => Number.isInteger(weight))).toBe(true);
    }
    expect(allFamilies()).toHaveLength(catalog.families.length);
  });
});
