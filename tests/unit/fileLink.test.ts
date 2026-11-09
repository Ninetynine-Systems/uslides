import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decideSync, WATCH_MS, watchFile } from '../../src/files/fileLink';

const base = { appSource: 'a', fileSource: 'a', fileModified: 100, lastSyncedSource: 'a', lastSyncedModified: 100 };

describe('decideSync', () => {
  it('does nothing when neither side changed', () => {
    expect(decideSync(base)).toBe('none');
  });

  it('takes the file when only the file changed', () => {
    expect(decideSync({ ...base, fileSource: 'b', fileModified: 200 })).toBe('take-file');
  });

  it('writes the file when only the app changed', () => {
    expect(decideSync({ ...base, appSource: 'b' })).toBe('write-file');
  });

  it('reports a conflict when both changed to different text', () => {
    expect(decideSync({ ...base, appSource: 'b', fileSource: 'c', fileModified: 200 })).toBe('conflict');
  });

  it('does nothing when both changed to the same text', () => {
    expect(decideSync({ ...base, appSource: 'b', fileSource: 'b', fileModified: 200 })).toBe('none');
  });

  it('ignores a new modified time when the text is the same', () => {
    expect(decideSync({ ...base, fileModified: 999 })).toBe('none');
  });

  it('on first sync, equal text means nothing to do', () => {
    expect(decideSync({ appSource: 'a', fileSource: 'a', fileModified: 5 })).toBe('none');
  });

  it('on first sync, the file wins when the text differs', () => {
    expect(decideSync({ appSource: 'a', fileSource: 'b', fileModified: 5 })).toBe('take-file');
  });

  it('polls about once a second', () => {
    expect(WATCH_MS).toBe(1000);
  });
});

describe('watchFile', () => {
  const notFound = () => new DOMException('gone', 'NotFoundError');

  /** A handle whose reads follow a script: each entry is the text to return, or 'missing'. The last entry repeats. */
  function scripted(steps: string[]) {
    let i = 0;
    const handle = {
      async getFile() {
        const step = steps[Math.min(i++, steps.length - 1)]!;
        if (step === 'missing') throw notFound();
        return { text: async () => step, lastModified: 1 };
      },
    } as unknown as FileSystemFileHandle;
    return handle;
  }

  const run = async (handle: FileSystemFileHandle, polls: number) => {
    const seen: string[] = [];
    const errors: unknown[] = [];
    const stop = watchFile(handle, (text) => void seen.push(text), { onError: (e) => void errors.push(e) });
    await vi.advanceTimersByTimeAsync(Math.floor(WATCH_MS * polls));
    stop();
    return { seen, errors };
  };

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('stays linked when the file is deleted and recreated within two polls', async () => {
    const { seen, errors } = await run(scripted(['a', 'missing', 'missing', 'b']), 6);
    expect(errors).toEqual([]);
    expect(seen.slice(0, 2)).toEqual(['a', 'b']);
  });

  it('unlinks after three missing polls in a row', async () => {
    const { errors } = await run(scripted(['a', 'missing']), 6);
    expect(errors).toHaveLength(1);
    expect((errors[0] as DOMException).name).toBe('NotFoundError');
  });

  it('a successful read resets the count', async () => {
    const { errors } = await run(scripted(['a', 'missing', 'missing', 'a', 'missing', 'missing', 'a']), 8);
    expect(errors).toEqual([]);
  });

  it('does not unlink on the first or second missing poll', async () => {
    const { errors } = await run(scripted(['missing']), 1.9);
    expect(errors).toEqual([]);
  });
});
