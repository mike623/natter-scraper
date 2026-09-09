import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { after, test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { createClient } from '../src/http.ts';

/**
 * The retry and concurrency logic is the part of `http.ts` worth proving, and both need a
 * server that misbehaves on demand. A loopback server is cheaper than a mocking framework
 * and keeps the suite off the network, same as the fixtures (ADR-0011).
 */
async function serve(handler: (requestNumber: number) => { status: number; body: string; delayMs?: number }) {
  let requests = 0;
  let active = 0;
  let peakActive = 0;

  const server: Server = createServer(async (_request, response) => {
    const { status, body, delayMs = 0 } = handler(++requests);
    active++;
    peakActive = Math.max(peakActive, active);
    if (delayMs > 0) await sleep(delayMs);
    active--;
    response.writeHead(status, { 'content-type': 'text/html' }).end(body);
  });

  await new Promise<void>((listening) => server.listen(0, '127.0.0.1', listening));
  const { port } = server.address() as { port: number };

  after(() => server.close());
  return {
    url: `http://127.0.0.1:${port}/`,
    get requests() {
      return requests;
    },
    get peakActive() {
      return peakActive;
    },
  };
}

test('returns the body of a successful response', async () => {
  const site = await serve(() => ({ status: 200, body: '<h1>ok</h1>' }));

  assert.equal(await createClient(1)(site.url), '<h1>ok</h1>');
  assert.equal(site.requests, 1);
});

test('retries a 5xx and returns the eventual success', async () => {
  const site = await serve((n) => (n === 1 ? { status: 503, body: '' } : { status: 200, body: 'recovered' }));

  assert.equal(await createClient(1)(site.url), 'recovered');
  assert.equal(site.requests, 2);
});

test('does not retry a 404', async () => {
  const site = await serve(() => ({ status: 404, body: 'gone' }));

  await assert.rejects(createClient(1)(site.url), /returned 404/);
  assert.equal(site.requests, 1, 'a 404 is the site telling us the page is not there');
});

test('never exceeds the requested number of in-flight requests', async () => {
  const site = await serve(() => ({ status: 200, body: 'slow', delayMs: 25 }));
  const fetchText = createClient(2);

  await Promise.all(Array.from({ length: 6 }, () => fetchText(site.url)));

  assert.equal(site.requests, 6);
  assert.equal(site.peakActive, 2);
});

test('gives up after four attempts on a persistently failing page', async () => {
  const site = await serve(() => ({ status: 500, body: '' }));

  await assert.rejects(createClient(1)(site.url), /returned 500/);
  assert.equal(site.requests, 4, 'one attempt plus three retries (ADR-0009)');
});

test('refuses a Retry-After longer than the run will wait', async () => {
  const server = createServer((_request, response) => {
    response.writeHead(429, { 'retry-after': '3600' }).end();
  });
  await new Promise<void>((listening) => server.listen(0, '127.0.0.1', listening));
  after(() => server.close());
  const { port } = server.address() as { port: number };

  await assert.rejects(createClient(1)(`http://127.0.0.1:${port}/`), /longer than this run will wait/);
});
