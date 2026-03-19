import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createApp } from './index.js';
import { loadRuntimeConfig } from './env.js';
import { startDailyNotificationScheduler } from './scheduler.js';

async function readRequestBody(request: IncomingMessage): Promise<Buffer | undefined> {
  if (request.method === 'GET' || request.method === 'HEAD') {
    return undefined;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

async function toWebRequest(request: IncomingMessage): Promise<Request> {
  const headers = new Headers();

  for (const [key, value] of Object.entries(request.headers)) {
    if (value === undefined) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item);
      }
      continue;
    }

    headers.set(key, value);
  }

  const body = await readRequestBody(request);
  const host = request.headers.host ?? '127.0.0.1';
  const url = new URL(request.url ?? '/', `http://${host}`);
  const init: RequestInit = {
    method: request.method,
    headers,
  };

  if (body) {
    init.body = new Uint8Array(body);
  }

  return new Request(url, init);
}

async function writeNodeResponse(response: Response, serverResponse: ServerResponse): Promise<void> {
  serverResponse.statusCode = response.status;
  serverResponse.statusMessage = response.statusText;

  response.headers.forEach((value, key) => {
    serverResponse.setHeader(key, value);
  });

  if (response.body === null || response.bodyUsed || serverResponse.req?.method === 'HEAD') {
    serverResponse.end();
    return;
  }

  const arrayBuffer = await response.arrayBuffer();
  serverResponse.end(Buffer.from(arrayBuffer));
}

async function main(): Promise<void> {
  const { env, port, enableDailyNotification } = loadRuntimeConfig();
  const app = createApp(env);
  const stopScheduler = enableDailyNotification
    ? startDailyNotificationScheduler(env)
    : () => undefined;

  const server = createServer(async (request, response) => {
    try {
      const webRequest = await toWebRequest(request);
      const webResponse = await app.fetch(webRequest);
      await writeNodeResponse(webResponse, response);
    } catch (error) {
      console.error('Request handling failed:', error);
      response.statusCode = 500;
      response.setHeader('content-type', 'application/json; charset=utf-8');
      response.end(JSON.stringify({ error: 'Internal Server Error' }));
    }
  });

  server.listen(port, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${port}`);
    console.log(`Daily notification scheduler: ${enableDailyNotification ? 'enabled' : 'disabled'}`);
  });

  const shutdown = (signal: NodeJS.Signals) => {
    console.log(`Received ${signal}, shutting down`);
    stopScheduler();
    server.close((error) => {
      if (error) {
        console.error('Server shutdown failed:', error);
        process.exitCode = 1;
      }
      process.exit();
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

void main().catch((error) => {
  console.error('Server startup failed:', error);
  process.exit(1);
});
