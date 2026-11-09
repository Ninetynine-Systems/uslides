import { describe, expect, it } from 'vitest';
import { decideSync, WATCH_MS } from '../../src/files/fileLink';

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
