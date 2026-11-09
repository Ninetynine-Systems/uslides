export type Group = 'serif' | 'sans-serif' | 'display' | 'handwriting' | 'monospace';

export type Family = {
  name: string;
  group: Group;
  weights: number[];
  italic: boolean;
};

let families: Family[] = [];
let loading: Promise<void> | undefined;

function readGroup(value: string): Group {
  if (value === 'serif' || value === 'sans-serif' || value === 'display'
    || value === 'handwriting' || value === 'monospace') return value;
  throw new Error(`Unknown font group "${value}" in the catalog`);
}

/** Loads the shipped catalog once. The JSON stays in its own build chunk. */
export function loadCatalog(): Promise<void> {
  loading ??= import('./catalog.json').then(({ default: catalog }) => {
    families = catalog.families.map((family) => ({
      name: family.n,
      group: readGroup(family.c),
      weights: family.w,
      italic: family.i,
    }));
  });
  return loading;
}

/** Finds a family by its whole name, ignoring upper and lower case. */
export function findFamily(name: string): Family | undefined {
  const wanted = name.toLowerCase();
  return families.find((family) => family.name.toLowerCase() === wanted);
}

/** Finds name substrings in catalog popularity order, optionally within one style group. */
export function searchFamilies(query: string, group?: Group): Family[] {
  const wanted = query.toLowerCase();
  return families.filter(
    (family) => (!group || family.group === group) && family.name.toLowerCase().includes(wanted),
  );
}

/** All families in catalog popularity order. */
export function allFamilies(): Family[] {
  return [...families];
}
