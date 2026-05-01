import { createServer } from 'node:http';
import type { ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AtlasProfile } from '@agent-atlas/core';
import { handleAtlasUiApiRequest } from './api.js';

export interface StartAtlasUiServerOptions {
  rootPath: string;
  profile: AtlasProfile;
  host?: string;
  port?: number;
  open?: boolean;
}

export interface AtlasUiServerHandle {
  url: string;
  host: string;
  port: number;
  close: () => Promise<void>;
}

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 4388;

export async function startAtlasUiServer(
  options: StartAtlasUiServerOptions,
): Promise<AtlasUiServerHandle> {
  const host = options.host ?? DEFAULT_HOST;
  const requestedPort = options.port ?? DEFAULT_PORT;
  const rootPath = path.resolve(options.rootPath);
  const clientRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'client');

  for (let port = requestedPort; port < requestedPort + 50; port += 1) {
    const server = createServer(async (request, response) => {
      const handled = await handleAtlasUiApiRequest(request, response, {
        rootPath,
        profile: options.profile,
      });
      if (handled) {
        return;
      }
      await serveClientAsset(clientRoot, request.url ?? '/', response);
    });

    const handle = await tryListen(server, host, port);
    if (handle) {
      if (options.open) {
        await openBrowser(handle.url);
      }
      return handle;
    }
  }

  throw new Error(`No available port found from ${requestedPort} to ${requestedPort + 49}.`);
}

async function tryListen(
  server: ReturnType<typeof createServer>,
  host: string,
  port: number,
): Promise<AtlasUiServerHandle | undefined> {
  return new Promise((resolve, reject) => {
    const onError = (error: NodeJS.ErrnoException): void => {
      server.off('listening', onListening);
      if (error.code === 'EADDRINUSE') {
        resolve(undefined);
        return;
      }
      reject(error);
    };
    const onListening = (): void => {
      server.off('error', onError);
      const address = server.address() as AddressInfo;
      const actualHost = address.address === '::' ? '127.0.0.1' : address.address;
      resolve({
        host: actualHost,
        port: address.port,
        url: `http://${actualHost}:${address.port}`,
        close: () =>
          new Promise((closeResolve, closeReject) => {
            server.close((error) => (error ? closeReject(error) : closeResolve()));
          }),
      });
    };

    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });
}

async function serveClientAsset(
  clientRoot: string,
  requestUrl: string,
  response: ServerResponse,
): Promise<void> {
  const url = new URL(requestUrl, 'http://127.0.0.1');
  const requestedPath = url.pathname === '/' ? '/index.html' : url.pathname;
  const filePath = path.join(clientRoot, normalizeAssetPath(requestedPath));

  if (!isPathWithin(clientRoot, filePath)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  try {
    const content = await readFile(filePath);
    response.writeHead(200, {
      'content-type': contentType(filePath),
      'cache-control': filePath.endsWith('index.html') ? 'no-store' : 'public, max-age=31536000',
    });
    response.end(content);
  } catch {
    try {
      const indexHtml = await readFile(path.join(clientRoot, 'index.html'));
      response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
      });
      response.end(indexHtml);
    } catch {
      response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Agent Atlas UI assets are missing. Run `pnpm --filter @agent-atlas/ui build`.');
    }
  }
}

function normalizeAssetPath(requestedPath: string): string {
  return requestedPath.replace(/^\/+/, '').replaceAll('\\', '/');
}

function isPathWithin(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function contentType(filePath: string): string {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.svg')) return 'image/svg+xml';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  return 'application/octet-stream';
}

async function openBrowser(url: string): Promise<void> {
  const { spawn } = await import('node:child_process');
  const command =
    process.platform === 'darwin'
      ? 'open'
      : process.platform === 'win32'
        ? 'cmd'
        : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  const child = spawn(command, args, {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
}
