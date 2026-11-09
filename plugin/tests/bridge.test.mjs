import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { Bridge, parseSnapshot } from '../src/bridge.mjs';
import { keyState, keyImage } from '../src/presentation.mjs';

const server = { id: '127.0.0.1:30120/test', label: 'Test Server' };
const catalog = [{ id: 'builtin:wave', label: 'Winken', category: 'Gesten', keywords: 'wave' }];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate) {
  for (let i = 0; i < 200; i++) { const value = predicate(); if (value) return value; await pause(5); }
  throw new Error('condition timed out');
}
async function setup(t, options = {}) {
  const bridge = await new Bridge({ port: 0, ...options }).start();
  t.after(() => bridge.close()); return bridge;
}
async function socket(bridge, origin = 'https://cfx-nui-ks_streamdeck') {
  const ws = new WebSocket(`ws://127.0.0.1:${bridge.port}/v1/fivem`, { origin });
  ws.messages = []; ws.on('message', raw => ws.messages.push(JSON.parse(raw))); ws.on('error', () => {});
  await once(ws, 'open'); return ws;
}
const send = (ws, msg) => ws.send(JSON.stringify(msg));
async function pair(bridge) {
  const code = bridge.beginPairing().pairing.code;
  const ws = await socket(bridge);
  send(ws, { type: 'hello', protocol: 1, code, server, clientId: 'test-client' });
  const welcome = await until(() => ws.messages.find(msg => msg.type === 'welcome'));
  send(ws, { type: 'snapshot', sessionId: welcome.sessionId, catalog, active: null, blocked: null });
  await until(() => bridge.view().connected);
  return { ws, welcome };
}

test('only loopback, no HTTP command endpoint, rejects foreign website origins', async t => {
  const bridge = await setup(t);
  assert.equal(bridge.server.address().address, '127.0.0.1');
  assert.equal((await fetch(`http://127.0.0.1:${bridge.port}/command`, { method: 'POST' })).status, 404);
  await assert.rejects(socket(bridge, 'https://evil.example'), /403/);
});
test('pairing must be explicitly opened, code is one-use and no token leaks into UI status', async t => {
  const bridge = await setup(t);
  const denied = await socket(bridge);
  send(denied, { type: 'hello', protocol: 1, code: '123456', server, clientId: 'uninvited' });
  assert.equal((await until(() => denied.messages[0])).message, 'pairing_required');
  const { welcome } = await pair(bridge);
  assert.equal(bridge.view().pairing, null);
  assert.ok(welcome.token.length >= 64);
  assert.ok(!JSON.stringify(bridge.view()).includes(welcome.token));
  assert.throws(() => bridge.beginPairing(), /disconnect_first/);
});
test('wrong/expired codes and different protocol cannot authorize', async t => {
  const bridge = await setup(t);
  const code = bridge.beginPairing().pairing.code;
  for (const [protocol, attempt, expected] of [[9, code, 'invalid_hello'], [1, 'öööööö', 'wrong_code'], [1, code === '111111' ? '222222' : '111111', 'wrong_code']]) {
    const ws = await socket(bridge); send(ws, { type: 'hello', protocol, code: attempt, server, clientId: 'guest' });
    assert.equal((await until(() => ws.messages[0])).message, expected);
  }
  bridge.pairing.expiresAt = Date.now() - 1;
  const ws = await socket(bridge); send(ws, { type: 'hello', protocol: 1, code, server, clientId: 'guest' });
  assert.equal((await until(() => ws.messages[0])).message, 'pairing_required');
});
test('five failures exhaust pairing window across different sockets', async t => {
  const bridge = await setup(t); const code = bridge.beginPairing().pairing.code;
  for (let i = 0; i < 6; i++) {
    const ws = await socket(bridge); send(ws, { type: 'hello', protocol: 1, code: 'invalid', server, clientId: `try-${i}` });
    await until(() => ws.messages[0]);
  }
  const ws = await socket(bridge); send(ws, { type: 'hello', protocol: 1, code, server, clientId: 'correct-but-late' });
  assert.equal((await until(() => ws.messages[0])).message, 'pairing_required');
});
test('actual game acknowledgement is required; unavailable IDs/server/busy commands are rejected', async t => {
  const bridge = await setup(t); const { ws, welcome } = await pair(bridge);
  assert.equal((await bridge.execute({ serverId: 'different', command: 'play', animation: 'builtin:wave' })).message, 'wrong_server');
  assert.equal((await bridge.execute({ serverId: server.id, command: 'play', animation: 'arbitrary:event' })).message, 'animation_missing');
  assert.equal((await bridge.execute({ serverId: server.id, command: 'eval', animation: 'builtin:wave' })).message, 'invalid_command');
  let resolved = false;
  const command = bridge.execute({ serverId: server.id, command: 'play', animation: 'builtin:wave' }).then(result => { resolved = true; return result; });
  const request = await until(() => ws.messages.find(msg => msg.type === 'execute'));
  assert.equal(resolved, false); assert.equal(bridge.view().snapshot.active, null);
  assert.equal((await bridge.execute({ serverId: server.id, command: 'stop' })).message, 'busy');
  send(ws, { type: 'ack', sessionId: welcome.sessionId, id: request.id, ok: false, message: 'Animation nicht geladen.' });
  assert.deepEqual(await command, { ok: false, message: 'Animation nicht geladen.' });
});
test('toggle of already-active animation remains a stop when starting new animations is blocked', async t => {
  const bridge = await setup(t); const { ws, welcome } = await pair(bridge);
  send(ws, { type: 'snapshot', sessionId: welcome.sessionId, catalog, active: 'builtin:wave', blocked: 'Menü geöffnet.' });
  await until(() => bridge.view().snapshot.active);
  assert.equal((await bridge.execute({ serverId: server.id, command: 'play', animation: 'builtin:wave' })).message, 'Menü geöffnet.');
  const result = bridge.execute({ serverId: server.id, command: 'toggle', animation: 'builtin:wave' });
  const request = await until(() => ws.messages.find(msg => msg.type === 'execute'));
  send(ws, { type: 'ack', sessionId: welcome.sessionId, id: request.id, ok: true });
  assert.equal((await result).ok, true);
});
test('connection loss cancels pending commands; reconnect requires token, same client and server, no replay', async t => {
  const bridge = await setup(t); const { ws, welcome } = await pair(bridge);
  const result = bridge.execute({ serverId: server.id, command: 'play', animation: 'builtin:wave' });
  await until(() => ws.messages.find(msg => msg.type === 'execute'));
  ws.terminate(); assert.equal((await result).ok, false);
  await until(() => !bridge.view().connected);
  const denied = await socket(bridge);
  send(denied, { type: 'hello', protocol: 1, token: welcome.token, server: { ...server, id: 'other' }, clientId: 'test-client' });
  assert.equal((await until(() => denied.messages[0])).message, 'session_in_use');
  const next = await socket(bridge);
  send(next, { type: 'hello', protocol: 1, token: welcome.token, server, clientId: 'test-client' });
  assert.equal((await until(() => next.messages[0])).type, 'welcome');
  assert.equal(bridge.view().connected, false, 'fresh snapshot required after reconnect');
  send(next, { type: 'snapshot', sessionId: welcome.sessionId, catalog, active: null, blocked: null });
  await until(() => bridge.view().connected);
  assert.ok(!next.messages.some(msg => msg.type === 'execute'));
});
test('session expires after reconnect grace period, explicit disconnect immediately revokes it', async t => {
  const bridge = await setup(t, { reconnectMs: 20 }); const { ws, welcome } = await pair(bridge);
  ws.terminate(); await until(() => bridge.session === null);
  const next = await socket(bridge); send(next, { type: 'hello', protocol: 1, token: welcome.token, server, clientId: 'test-client' });
  assert.equal((await until(() => next.messages[0])).message, 'pairing_required');
  await pair(bridge); bridge.disconnect(); assert.equal(bridge.view().server, null);
});
test('malformed snapshots cannot become executable catalogs', () => {
  for (const value of [null, { catalog: {} }, { catalog: [...catalog, ...catalog], active: null, blocked: null }, { catalog, active: 'missing', blocked: null },
    { catalog: [{ ...catalog[0], id: '<script>' }], active: null, blocked: null }]) assert.throws(() => parseSnapshot(value));
  assert.equal(parseSnapshot({ catalog: [], active: null, blocked: null }).catalog.length, 0);
});
test('stale state disables actions even when socket remains open', async t => {
  const bridge = await setup(t, { heartbeatMs: 10 }); await pair(bridge);
  bridge.session.lastSnapshot = Date.now() - 5000;
  await until(() => !bridge.view().connected);
  assert.equal((await bridge.execute({ serverId: server.id, command: 'stop' })).ok, false);
});
test('key state follows actual snapshot, never another server or vanished animation', () => {
  const view = { connected: true, server, snapshot: { catalog, active: null, blocked: null } };
  const settings = { serverId: server.id, animation: 'builtin:wave' };
  assert.equal(keyState(settings, view).state, 'idle');
  view.snapshot.active = 'builtin:wave'; assert.equal(keyState(settings, view).state, 'active');
  assert.equal(keyState({ ...settings, serverId: 'other' }, view).state, 'offline');
  assert.equal(keyState({ ...settings, animation: 'deleted' }, view).title, 'Nicht\nverfügbar');
  assert.ok(keyImage('active').startsWith('data:image/svg+xml,'));
});

test('discovery requires desktop approval, targets the selected session and requires a fresh snapshot', async t => {
  const bridge = await setup(t, { heartbeatMs: 10 });
  const a = await socket(bridge), b = await socket(bridge);
  send(a, { type: 'discover', protocol: 1, server, clientId: 'a' });
  send(b, { type: 'discover', protocol: 1, server: { id: 'second:30120', label: 'Second' }, clientId: 'b' });
  await until(() => bridge.view().candidates.length === 2);
  assert.equal(bridge.session, null);
  assert.equal((await bridge.execute({ serverId: server.id, command: 'stop' })).message, 'disconnected');
  assert.throws(() => bridge.connectCandidate(), /session_unavailable/, 'multiple sessions require a selected ID');
  const chosen = bridge.view().candidates.find(c => c.server.id === 'second:30120');
  bridge.connectCandidate(chosen.id);
  const welcome = await until(() => b.messages.find(m => m.type === 'welcome'));
  assert.ok(!a.messages.some(m => m.type === 'welcome'));
  assert.equal(bridge.view().connected, false);
  assert.equal(bridge.view().candidates.length, 1);
  assert.ok(!JSON.stringify(bridge.view()).includes(welcome.token));
  assert.throws(() => bridge.connectCandidate(bridge.view().candidates[0].id), /disconnect_first/);
  send(b, { type: 'snapshot', sessionId: welcome.sessionId, catalog, active: null, blocked: null });
  await until(() => bridge.view().connected);
  bridge.disconnect();
  const remaining = bridge.view().candidates[0].id;
  a.close(); await until(() => bridge.view().candidates.length === 0);
  assert.throws(() => bridge.connectCandidate(remaining), /session_unavailable/);
});

test('discovery validates identity and rejects commands before approval', async t => {
  const bridge = await setup(t);
  for (const fields of [{protocol: 2}, {clientId: ''}, {server: {id:'',label:'bad'}}]) {
    const ws = await socket(bridge);
    send(ws, {type:'discover',protocol:1,server,clientId:'candidate',...fields});
    await once(ws,'close');
    assert.equal(bridge.view().candidates.length,0);
  }
  const ws = await socket(bridge);
  send(ws, {type:'discover',protocol:1,server,clientId:'candidate'});
  await until(() => bridge.view().candidates.length === 1);
  send(ws, {type:'snapshot',sessionId:'fake',catalog,active:null,blocked:null});
  await once(ws,'close');
  assert.equal(bridge.session,null);
  assert.equal(bridge.view().candidates.length,0);
});

test('large provider catalogs fit the standalone limit and excessive catalogs are rejected', () => {
  const catalog = Array.from({length:10000}, (_,i) => ({id:`emotes:item_${i}`,label:`Emote ${i}`,category:'Emotes',keywords:''}));
  const snapshot = {catalog,active:null,blocked:null};
  assert.equal(parseSnapshot(snapshot).catalog.length,10000);
  assert.throws(() => parseSnapshot({...snapshot,catalog:[...catalog,{id:'emotes:overflow',label:'Overflow',category:'Emotes'}]}), /invalid_catalog/);
});
