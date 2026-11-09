/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * A fake File System Access API for the end-to-end tests.
 *
 * Install with `page.addInitScript(installFakeFs)`. The function is serialized and run in the page,
 * so it must not use anything from outside itself.
 *
 * Handles are small objects whose only own properties are plain data (`kind`, `name`, `__fakeId`).
 * That lets IndexedDB store them with structured clone, as it does real handles. The methods live on
 * the class prototype. When a stored record is read back, a patched `IDBRequest.result` turns each
 * plain `__fakeId` object into a live handle again. All state is kept in sessionStorage, so it
 * survives `page.reload()`.
 *
 * Tests control it through `window.__fakeFs`.
 */
export function installFakeFs(): void {
  type FileData = { text?: string; base64?: string; modified: number };
  type Entry =
    | { type: 'file'; name: string; file: FileData; removed?: boolean; perm: string; write: string }
    | { type: 'dir'; name: string; files: Record<string, FileData>; perm: string; write: string };
  type State = { entries: Record<string, Entry>; writes: Record<string, string[]>; nextPick: { file?: string; dir?: string }; grantOnRequest: boolean; grantWriteOnRequest: boolean; clock: number };

  const KEY = '__fakeFsState';
  const load = (): State => {
    try {
      const raw = sessionStorage.getItem(KEY);
      if (raw) return JSON.parse(raw) as State;
    } catch {
      /* fall through */
    }
    return { entries: {}, writes: {}, nextPick: {}, grantOnRequest: true, grantWriteOnRequest: true, clock: 1_700_000_000_000 };
  };
  const state = load();
  const save = () => sessionStorage.setItem(KEY, JSON.stringify(state));
  const tick = () => (state.clock += 1000);

  const notFound = (what: string) => new DOMException(`${what} not found`, 'NotFoundError');
  const rootOf = (id: string) => id.split('|')[0]!;
  const subOf = (id: string) => id.split('|').slice(1).join('|');
  // Read and write access are separate, as in Chrome: a picked file starts with read only.
  const permOf = (id: string, mode = 'read') => {
    const root = state.entries[rootOf(id)];
    if (!root) return 'denied';
    return mode === 'readwrite' ? (root.perm === 'granted' ? root.write : root.perm) : root.perm;
  };
  /** Test hooks that run after the next read of a file. Not saved: they last for one page load. */
  const afterRead: Record<string, string> = {};
  const bytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const fileData = (id: string): FileData => {
    const root = state.entries[rootOf(id)];
    if (!root) throw notFound('File');
    if (root.type === 'file') {
      if (root.removed) throw notFound('File');
      return root.file;
    }
    const data = root.files[subOf(id)];
    if (!data) throw notFound('File');
    return data;
  };

  class FakeHandle {
    kind: string;
    name: string;
    __fakeId: string;
    constructor(kind: string, name: string, id: string) {
      this.kind = kind;
      this.name = name;
      this.__fakeId = id;
    }
    async queryPermission(opts?: { mode?: string }): Promise<string> {
      return permOf(this.__fakeId, opts?.mode);
    }
    async requestPermission(opts?: { mode?: string }): Promise<string> {
      const root = state.entries[rootOf(this.__fakeId)];
      const mode = opts?.mode ?? 'read';
      if (root && state.grantOnRequest) {
        root.perm = 'granted';
        if (mode === 'readwrite' && state.grantWriteOnRequest) root.write = 'granted';
        save();
      }
      return permOf(this.__fakeId, mode);
    }
    async isSameEntry(other: FakeHandle): Promise<boolean> {
      return other.__fakeId === this.__fakeId;
    }
  }

  class FakeFileHandle extends FakeHandle {
    constructor(name: string, id: string) {
      super('file', name, id);
    }
    async getFile(): Promise<File> {
      const id = this.__fakeId;
      const data = fileData(id);
      const part: BlobPart = data.base64 !== undefined ? bytes(data.base64) : (data.text ?? '');
      const file = new File([part], this.name, { lastModified: data.modified });
      const later = afterRead[id];
      if (later !== undefined) {
        delete afterRead[id];
        data.text = later;
        data.modified = tick();
        save();
      }
      return file;
    }
    async createWritable() {
      const id = this.__fakeId;
      if (permOf(id, 'readwrite') !== 'granted') throw new DOMException('Write access was not granted', 'NotAllowedError');
      let pending = '';
      return {
        async write(chunk: unknown) {
          pending += typeof chunk === 'string' ? chunk : String((chunk as { data?: unknown })?.data ?? '');
        },
        async close() {
          const data = fileData(id);
          data.text = pending;
          data.modified = tick();
          (state.writes[id] ??= []).push(pending);
          save();
        },
      };
    }
  }

  class FakeDirHandle extends FakeHandle {
    constructor(name: string, id: string) {
      super('directory', name, id);
    }
    private path(name: string): string {
      const sub = subOf(this.__fakeId);
      return sub ? `${sub}/${name}` : name;
    }
    private root() {
      const root = state.entries[rootOf(this.__fakeId)];
      if (!root || root.type !== 'dir') throw notFound('Folder');
      return root;
    }
    async getFileHandle(name: string): Promise<FakeFileHandle> {
      const path = this.path(name);
      if (!this.root().files[path]) throw notFound(name);
      return new FakeFileHandle(name, `${rootOf(this.__fakeId)}|${path}`);
    }
    async getDirectoryHandle(name: string): Promise<FakeDirHandle> {
      const path = this.path(name);
      if (!Object.keys(this.root().files).some((p) => p.startsWith(`${path}/`))) throw notFound(name);
      return new FakeDirHandle(name, `${rootOf(this.__fakeId)}|${path}`);
    }
    private children(): Array<[string, FakeHandle]> {
      const sub = subOf(this.__fakeId);
      const prefix = sub ? `${sub}/` : '';
      const seen = new Map<string, FakeHandle>();
      for (const p of Object.keys(this.root().files)) {
        if (!p.startsWith(prefix)) continue;
        const rest = p.slice(prefix.length);
        const [first, ...more] = rest.split('/');
        if (!first || seen.has(first)) continue;
        const id = `${rootOf(this.__fakeId)}|${prefix}${first}`;
        seen.set(first, more.length ? new FakeDirHandle(first, id) : new FakeFileHandle(first, id));
      }
      return [...seen];
    }
    async *entries() {
      for (const e of this.children()) yield e;
    }
    async *values() {
      for (const [, h] of this.children()) yield h;
    }
    async *keys() {
      for (const [n] of this.children()) yield n;
    }
    [Symbol.asyncIterator]() {
      return this.entries();
    }
  }

  const handleFor = (id: string): FakeHandle => {
    const root = state.entries[rootOf(id)];
    if (!root) throw notFound('Handle');
    if (root.type === 'file') return new FakeFileHandle(root.name, id);
    const sub = subOf(id);
    if (!sub) return new FakeDirHandle(root.name, id);
    const name = sub.split('/').pop()!;
    return root.files[sub] ? new FakeFileHandle(name, id) : new FakeDirHandle(name, id);
  };

  // Turn plain `{__fakeId}` objects read back from IndexedDB into live handles.
  const revive = (value: any, depth = 0): any => {
    if (!value || typeof value !== 'object' || depth > 2) return value;
    if (typeof value.__fakeId === 'string' && typeof value.kind === 'string' && !(value instanceof FakeHandle)) {
      return handleFor(value.__fakeId);
    }
    if (Array.isArray(value)) return value.map((v) => revive(v, depth + 1));
    if (Object.getPrototypeOf(value) === Object.prototype) {
      for (const k of Object.keys(value)) value[k] = revive(value[k], depth + 1);
    }
    return value;
  };
  const resultDescriptor = Object.getOwnPropertyDescriptor(IDBRequest.prototype, 'result')!;
  Object.defineProperty(IDBRequest.prototype, 'result', {
    configurable: true,
    get() {
      return revive(resultDescriptor.get!.call(this));
    },
  });

  (window as any).showOpenFilePicker = async () => {
    const id = state.nextPick.file;
    if (!id) throw new DOMException('The user aborted a request.', 'AbortError');
    return [handleFor(id)];
  };
  (window as any).showDirectoryPicker = async () => {
    const id = state.nextPick.dir;
    if (!id) throw new DOMException('The user aborted a request.', 'AbortError');
    return handleFor(id);
  };

  const controls = {
    /** A single file, as returned by `showOpenFilePicker`. */
    createFile(id: string, name: string, text: string) {
      state.entries[id] = { type: 'file', name, file: { text, modified: tick() }, perm: 'granted', write: 'prompt' };
      save();
    },
    /** An external edit (for example by an agent). */
    setText(id: string, text: string) {
      const data = fileData(id);
      data.text = text;
      delete data.base64;
      data.modified = tick();
      save();
    },
    getText(id: string): string | undefined {
      return fileData(id).text;
    },
    /** Every text the app wrote with `createWritable`, in order. */
    writes(id: string): string[] {
      return state.writes[id] ?? [];
    },
    /** A folder. Values are text, or `{ base64 }` for binary files. Keys are paths like `img/chart.png`. */
    createDir(id: string, name: string, files: Record<string, string | { base64: string }>) {
      const out: Record<string, FileData> = {};
      for (const [path, v] of Object.entries(files)) {
        out[path] = typeof v === 'string' ? { text: v, modified: tick() } : { base64: v.base64, modified: tick() };
      }
      state.entries[id] = { type: 'dir', name, files: out, perm: 'granted', write: 'granted' };
      save();
    },
    /** The id the next `showOpenFilePicker` call returns. */
    pickFile(id: string) {
      state.nextPick.file = id;
      save();
    },
    pickDir(id: string) {
      state.nextPick.dir = id;
      save();
    },
    setPermission(id: string, perm: 'granted' | 'prompt' | 'denied') {
      const root = state.entries[id];
      if (root) {
        root.perm = perm;
        root.write = perm;
      }
      save();
    },
    /** Sets only the write permission, leaving read as it is (a read-only handle is `prompt`). */
    setWritePermission(id: string, perm: 'granted' | 'prompt' | 'denied') {
      const root = state.entries[id];
      if (root) root.write = perm;
      save();
    },
    /** Whether the user allows writing when the app asks for read and write access. */
    grantWriteOnRequest(grant: boolean) {
      state.grantWriteOnRequest = grant;
      save();
    },
    /** The file changes to `text` right after the next time the app reads it (the app sees the old text). */
    changeAfterNextRead(id: string, text: string) {
      afterRead[id] = text;
    },
    /** Whether `requestPermission` grants access (the user clicks Allow) or leaves it as it was. */
    grantOnRequest(grant: boolean) {
      state.grantOnRequest = grant;
      save();
    },
    /** Makes the file disappear: later reads throw NotFoundError. */
    remove(id: string) {
      const root = state.entries[id];
      if (root?.type === 'file') root.removed = true;
      save();
    },
  };
  (window as any).__fakeFs = controls;
}

export type FakeFs = {
  createFile(id: string, name: string, text: string): void;
  setText(id: string, text: string): void;
  getText(id: string): string | undefined;
  writes(id: string): string[];
  createDir(id: string, name: string, files: Record<string, string | { base64: string }>): void;
  pickFile(id: string): void;
  pickDir(id: string): void;
  setPermission(id: string, perm: 'granted' | 'prompt' | 'denied'): void;
  grantOnRequest(grant: boolean): void;
  setWritePermission(id: string, perm: 'granted' | 'prompt' | 'denied'): void;
  grantWriteOnRequest(grant: boolean): void;
  changeAfterNextRead(id: string, text: string): void;
  remove(id: string): void;
};
