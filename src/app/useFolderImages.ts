import { useEffect, useMemo, useState } from 'react';
import { readFolderImage } from '../files/fileLink';
import { imageKey } from './Preview';

/** Relative image paths in the Markdown: `![alt](./img/a.png)`. Web, data: and absolute paths are skipped. */
export function relativeImagePaths(source: string): string[] {
  const found = new Set<string>();
  for (const m of source.matchAll(/!\[[^\]]*\]\(\s*<?([^)\s>]+)/g)) {
    let src = m[1]!;
    if (/^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith('/')) continue;
    try {
      src = decodeURIComponent(src);
    } catch {
      // keep the raw text
    }
    const key = imageKey(src);
    if (key && !key.split('/').includes('..')) found.add(key);
  }
  return [...found].sort();
}

/**
 * Images read from the linked folder, keyed by normalized path. Empty without a folder or without
 * access. Read again when the paths change, when access arrives, or when the file reloaded from disk.
 */
export function useFolderImages(
  folder: FileSystemDirectoryHandle | undefined,
  source: string,
  allowed: boolean,
  version: number,
): Map<string, Blob> {
  const paths = useMemo(() => relativeImagePaths(source).join('\n'), [source]);
  const [images, setImages] = useState<Map<string, Blob>>(new Map());

  useEffect(() => {
    if (!folder || !allowed || paths === '') {
      setImages((old) => (old.size === 0 ? old : new Map()));
      return;
    }
    let cancelled = false;
    void Promise.all(
      paths.split('\n').map(async (p) => [p, await readFolderImage(folder, p)] as const),
    ).then((rows) => {
      if (cancelled) return;
      const next = new Map<string, Blob>();
      for (const [p, blob] of rows) if (blob) next.set(p, blob);
      setImages(next);
    });
    return () => {
      cancelled = true;
    };
  }, [folder, allowed, paths, version]);

  return images;
}
