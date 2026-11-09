import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

export function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
}

export function close(server: Server): Promise<void> {
  server.closeAllConnections();
  return new Promise((resolve) => server.close(() => resolve()));
}

/** Serves one built folder. `setRoot` switches to another folder without changing the address. */
export function staticServer(initialRoot: string): { server: Server; setRoot(dir: string): void } {
  let root = initialRoot;
  const server = createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? '/').split('?')[0]!);
    let file = join(root, normalize(path));
    try {
      if (statSync(file).isDirectory()) file = join(file, 'index.html');
      const body = readFileSync(file);
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  return { server, setRoot: (dir) => void (root = dir) };
}

/** Builds the app into a new temporary folder with the given build id. */
export function buildApp(buildId: string): string {
  const outDir = mkdtempSync(join(tmpdir(), `uslides-${buildId}-`));
  execFileSync('npx', ['vite', 'build', '--outDir', outDir, '--emptyOutDir'], {
    env: { ...process.env, BUILD_ID: buildId },
    stdio: 'pipe',
  });
  return outDir;
}

/** A server on another port that serves one PNG: a different origin from the app. */
export function imageServer(png: Buffer): Server {
  return createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'image/png' });
    res.end(png);
  });
}
