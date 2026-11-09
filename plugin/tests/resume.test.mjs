import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { WebSocket } from 'ws';
import { Bridge } from '../src/bridge.mjs';
const code = await readFile(new URL('../../resources/ks_streamdeck/html/bridge.js', import.meta.url), 'utf8');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate) {
  for (let i = 0; i < 400; i++) { if (predicate()) return; await pause(5); }
  throw new Error('condition timeout');
}
const key = 'ks_streamdeck.resume.v1';
const server = { id: 'localhost:30120', label: 'Restart test' };
const catalog = [{ id: 'test:wave', label: 'Winken', category: 'Gesten' }];
async function harness(t) {
  const bridge = await new Bridge({ port: 0 }).start();
  const storage = new Map(), clients = [], calls = [];
  let active = null;
  const localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key),
  };
  t.after(async () => { clients.forEach(c => c.dispatch({ type: 'suspend' })); await bridge.close(); });
  function client(serverOverride = server, options = {}) {
    const listeners = {}, sockets = [];
    const dispatch = msg => listeners.message({ data: msg });
    const update = () => dispatch({ type: 'snapshot', data: { catalog, active, blocked: null } });
    class LocalSocket extends WebSocket {
      constructor(url) { super(url, { origin: 'https://cfx-nui-ks_streamdeck' }); sockets.push(this); }
    }
    vm.runInNewContext(code, {
      window: { addEventListener: (name, fn) => listeners[name] = fn },
      localStorage, WebSocket: LocalSocket, crypto: crypto.webcrypto,
      setTimeout, clearTimeout, AbortSignal, GetParentResourceName: () => 'ks_streamdeck',
      fetch: async (url, request) => {
        const name = url.split('/').at(-1), data = JSON.parse(request.body);
        calls.push({ name, data });
        if (name === 'connection' && data.connected) queueMicrotask(update);
        if (name === 'execute') {
          active = data.command === 'stop' ? null : data.animation;
          if (options.executeWait) await options.executeWait;
          queueMicrotask(update);
        }
        return { json: async () => ({ ok: true }) };
      },
    });
    const config = { type: 'config', enabled: true, resource: 'ks_streamdeck', port: bridge.port, server: serverOverride };
    const result = { dispatch, listeners, sockets, config };
    clients.push(result);
    dispatch(config);
    return result;
  }
  async function pair(options) {
    const c = client(server, options);
    await until(() => bridge.view().candidates.length === 1);
    assert.equal(bridge.view().connected, false, 'discovery alone never authorizes actions');
    bridge.connectCandidate(bridge.view().candidates[0].id);
    await until(() => bridge.view().connected);
    return c;
  }
  return { bridge, storage, calls, client, pair };
}

for (const shutdown of ['resource stop', 'pagehide only']) {
  test(`NUI ${shutdown} resumes without a code and preserves bindings`, async t => {
    const h = await harness(t), first = await h.pair();
    const sessionId = h.bridge.session.id, oldSocket = h.bridge.session.socket;
    assert.equal((await h.bridge.execute({ serverId: server.id, command: 'play', animation: 'test:wave' })).ok, true);
    if (shutdown === 'resource stop') first.dispatch({ type: 'suspend' });
    first.listeners.pagehide();
    await until(() => h.bridge.session?.socket === null);
    assert.ok(h.storage.has(key), 'restart retains short-lived credentials');
    const next = h.client();
    await until(() => h.bridge.view().connected);
    assert.equal(h.bridge.session.id, sessionId);
    assert.notEqual(h.bridge.session.socket, oldSocket);
    assert.equal(h.bridge.view().snapshot.active, 'test:wave');
    next.dispatch(next.config);
    assert.equal(next.sockets.length, 1, 'repeated config does not open another connection');
    assert.equal((await h.bridge.execute({ serverId: server.id, command: 'stop' })).ok, true);
    next.dispatch({ type: 'disconnect' });
    await until(() => h.bridge.session === null);
    assert.equal(h.storage.has(key), false, 'explicit disconnect clears recovery credentials');
    h.client();
    await until(() => h.bridge.view().candidates.length > 0);
    assert.equal(h.bridge.view().connected, false, 'explicit disconnect requires another click');
  });
}

test('resource reload discards pending actions and late acknowledgements', async t => {
  const h = await harness(t);
  let finish;
  const first = await h.pair({ executeWait: new Promise(resolve => finish = resolve) });
  const command = h.bridge.execute({ serverId: server.id, command: 'play', animation: 'test:wave' });
  await until(() => h.calls.some(c => c.name === 'execute'));
  first.dispatch({ type: 'suspend' });
  await until(() => h.bridge.session?.socket === null);
  assert.equal((await command).ok, false);
  h.client();
  await until(() => h.bridge.view().connected);
  finish();
  await pause(30);
  assert.equal(h.calls.filter(c => c.name === 'execute').length, 1, 'old command is not replayed');
  assert.equal(h.bridge.pending.size, 0);
});

test('fast reload retries while old socket is still closing', async t => {
  const h = await harness(t), first = await h.pair();
  const next = h.client();
  await until(() => next.sockets.length && next.sockets[0].readyState === WebSocket.CLOSED);
  first.listeners.pagehide();
  await until(() => h.bridge.view().connected && next.sockets.length > 1);
  assert.ok(!h.calls.some(c => c.name === 'notice'), 'temporary overlap does not prompt for pairing');
});

for (const invalid of ['expired', 'server', 'port', 'malformed']) {
  test(`restart does not resume ${invalid} credentials`, async t => {
    const h = await harness(t), first = await h.pair();
    first.listeners.pagehide();
    await until(() => h.bridge.session?.socket === null);
    const saved = JSON.parse(h.storage.get(key));
    if (invalid === 'expired') saved.expiresAt = Date.now() - 1;
    if (invalid === 'server') saved.serverId = 'other:30120';
    if (invalid === 'port') saved.port++;
    if (invalid === 'malformed') saved.token = 'bad';
    h.storage.set(key, JSON.stringify(saved));
    h.client();
    await until(() => h.bridge.view().candidates.length === 1);
    assert.equal(h.bridge.view().connected, false, 'invalid credentials only allow discovery');
    assert.equal(h.storage.has(key), false);
  });
}

test('desktop revocation clears cached credentials on the next restart', async t => {
  const h = await harness(t), first = await h.pair();
  first.listeners.pagehide();
  await until(() => h.bridge.session?.socket === null);
  h.bridge.disconnect();
  h.client();
  await until(() => !h.storage.has(key));
  assert.ok(h.calls.some(c => c.name === 'notice' && c.data.message === 'pairing_required'));
});

test('FiveM discovers Stream Deck when the desktop plugin starts later', async t => {
  const h = await harness(t);
  await h.bridge.close();
  h.client();
  await pause(50);
  await h.bridge.start();
  await until(() => h.bridge.view().candidates.length === 1);
  assert.equal(h.bridge.view().connected, false);
  h.bridge.connectCandidate(h.bridge.view().candidates[0].id);
  await until(() => h.bridge.view().connected);
});

test('desktop disconnect leaves the session discoverable but requires a new click', async t => {
  const h = await harness(t);
  await h.pair();
  h.bridge.disconnect();
  await until(() => h.bridge.view().candidates.length === 1);
  assert.equal(h.bridge.view().connected, false);
  assert.equal(h.storage.has(key), false);
  h.bridge.connectCandidate(h.bridge.view().candidates[0].id);
  await until(() => h.bridge.view().connected);
});
