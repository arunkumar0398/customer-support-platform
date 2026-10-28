import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Server } from 'node:http';
import app from './app.js';
import { closePrismaClient } from './db/client.js';

export interface LocalServerOptions {
  host?: string;
  port?: number;
}

export function startLocalServer(options: LocalServerOptions = {}): Server {
  const host = options.host ?? process.env.HOST ?? '0.0.0.0';
  const port = options.port ?? Number(process.env.PORT ?? '3101');
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error('PORT must be an integer from 0 through 65535.');
  }
  return app.listen(port, host);
}

function startProcessServer(): void {
  const server = startLocalServer();
  let shuttingDown = false;
  console.log(`API listening on ${process.env.HOST ?? '0.0.0.0'}:${process.env.PORT ?? '3101'}`);
  const shutdown = (signal: NodeJS.Signals): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Received ${signal}; closing API server.`);
    const deadline = setTimeout(() => server.closeAllConnections(), 10_000);
    deadline.unref();
    server.close((error) => {
      clearTimeout(deadline);
      void closePrismaClient()
        .catch(() => undefined)
        .finally(() => {
          if (error) {
            console.error('API server shutdown failed.');
            process.exitCode = 1;
          }
        });
    });
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(resolve(entrypoint)).href) {
  startProcessServer();
}
