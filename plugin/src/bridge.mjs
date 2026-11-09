import { EventEmitter } from 'node:events';
import { randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';

export const PORT = 39175;
export const PROTOCOL = 1;
const identifier = value => typeof value === 'string' && /^[a-zA-Z0-9_.:@/+-]{1,160}$/.test(value);
const string = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max;
const equal = (a, b) => typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const validClient = msg => msg.protocol === PROTOCOL && identifier(msg.clientId) &&
  msg.server && string(msg.server.id, 200) && string(msg.server.label, 96);

export function parseSnapshot(value) {
  if (!value || !Array.isArray(value.catalog) || value.catalog.length > 10000) throw new Error('invalid_catalog');
  const ids = new Set();
  const catalog = value.catalog.map(item => {
    if (!item || !identifier(item.id) || ids.has(item.id) || !string(item.label, 96) || !string(item.category, 64)) throw new Error('invalid_animation');
    ids.add(item.id);
    return { id: item.id, label: item.label, category: item.category,
      keywords: typeof item.keywords === 'string' ? item.keywords.slice(0, 256) : '' };
  });
  if (value.active !== null && (!identifier(value.active) || !ids.has(value.active))) throw new Error('invalid_active');
  if (value.blocked !== null && !string(value.blocked, 160)) throw new Error('invalid_blocked');
  return { catalog, active: value.active, blocked: value.blocked };
}

/** Local-only, opt-in bridge. Tokens never enter Elgato's persisted settings. */
export class Bridge extends EventEmitter {
  constructor({ port = PORT, reconnectMs = 30000, heartbeatMs = 5000 } = {}) {
    super();
    this.port = port; this.reconnectMs = reconnectMs; this.heartbeatMs = heartbeatMs;
    this.session = null; this.pairing = null; this.pending = new Map(); this.error = null;
    this.candidates = new Map();
  }
  view() {
    const s = this.session;
    return { connected: Boolean(s?.ready && s.socket?.readyState === WebSocket.OPEN),
      server: s?.server ?? null, snapshot: s?.ready ? s.snapshot : null,
      pairing: this.pairing && this.pairing.expiresAt > Date.now() ? { code: this.pairing.code, expiresAt: this.pairing.expiresAt } : null,
      candidates: [...this.candidates.values()].filter(c => c.socket.readyState === WebSocket.OPEN)
        .map(c => ({ id: c.id, server: c.server })),
      error: this.error, port: this.port };
  }
  connectCandidate(id) {
    if (this.session) throw new Error('disconnect_first');
    const candidate = this.candidates.get(id);
    if (!candidate || candidate.socket.readyState !== WebSocket.OPEN) throw new Error('session_unavailable');
    candidate.approve();
    this.candidates.delete(id);
    this.establish(candidate.socket, candidate);
  }
  establish(ws, client) {
    const s = { id: randomUUID(), token: randomBytes(32).toString('hex'), clientId: client.clientId,
      server: { id: client.server.id, label: client.server.label }, snapshot: null, ready: false };
    this.session = s; this.pairing = null;
    this.welcome(ws, s);
  }
  welcome(ws, s) {
    s.socket = ws; s.lastSeen = Date.now(); s.lastSnapshot = Date.now(); s.ready = false;
    ws.send(JSON.stringify({ type: 'welcome', protocol: PROTOCOL, sessionId: s.id, token: s.token }));
    this.emit('change');
  }
  beginPairing() {
    if (this.session) throw new Error('disconnect_first');
    this.pairing = { code: String(randomInt(0, 1000000)).padStart(6, '0'), expiresAt: Date.now() + 90000, attempts: 0 };
    this.emit('change');
    return this.view();
  }
  async start() {
    this.server = http.createServer((_req, res) => { res.writeHead(404); res.end(); });
    this.wss = new WebSocketServer({ noServer: true, maxPayload: 8 * 1024 * 1024, perMessageDeflate: false });
    this.server.on('upgrade', (req, socket, head) => {
      const origin = req.headers.origin;
      if (req.url !== '/v1/fivem' || origin !== 'https://cfx-nui-ks_streamdeck' ||
          req.headers.host !== `127.0.0.1:${this.port}` || this.wss.clients.size >= 8) {
        socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); socket.destroy(); return;
      }
      this.wss.handleUpgrade(req, socket, head, ws => this.accept(ws));
    });
    await new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(this.port, '127.0.0.1', () => {
        this.port = this.server.address().port; this.server.removeListener('error', reject); resolve();
      });
    });
    this.server.on('error', () => { this.error = 'bridge_error'; this.emit('change'); });
    this.heartbeat = setInterval(() => {
      for (const c of this.candidates.values()) {
        if (Date.now() - c.lastSeen > 15000) c.socket.terminate();
        else c.socket.ping();
      }
      const s = this.session;
      if (s?.socket && Date.now() - s.lastSeen > 15000) s.socket.terminate();
      if (s?.ready && Date.now() - s.lastSnapshot > 4000) { s.ready = false; this.failPending('stale_state'); this.emit('change'); }
      if (this.pairing && this.pairing.expiresAt < Date.now()) { this.pairing = null; this.emit('change'); }
    }, this.heartbeatMs);
    this.heartbeat.unref();
    return this;
  }
  accept(ws) {
    let authenticated = false, received = 0, windowStart = Date.now();
    let candidateId;
    const authTimer = setTimeout(() => ws.close(1008, 'auth_timeout'), 5000);
    ws.on('error', () => {});
    ws.on('pong', () => {
      const candidate = this.candidates.get(candidateId);
      if (candidate) candidate.lastSeen = Date.now();
    });
    ws.on('message', data => {
      if (Date.now() - windowStart >= 1000) { windowStart = Date.now(); received = 0; }
      if (++received > 16) { ws.close(1008, 'rate_limit'); return; }
      let msg;
      try { msg = JSON.parse(data.toString()); } catch { ws.close(1008, 'invalid_json'); return; }
      if (!msg || typeof msg !== 'object') { ws.close(1008, 'invalid_message'); return; }
      if (!authenticated) {
        if (candidateId) {
          // Discovery grants no animation access. Only the desktop UI can approve it.
          ws.close(1008, 'not_connected'); return;
        }
        if (msg.type === 'discover') {
          if (!validClient(msg)) { ws.close(1008, 'invalid_discovery'); return; }
          clearTimeout(authTimer);
          candidateId = randomUUID();
          this.candidates.set(candidateId, { id: candidateId, socket: ws, clientId: msg.clientId,
            server: { id: msg.server.id, label: msg.server.label }, lastSeen: Date.now(),
            approve: () => { authenticated = true; } });
          ws.send(JSON.stringify({ type: 'available' }));
          this.emit('change'); return;
        }
        if (!this.authenticate(ws, msg)) return;
        authenticated = true; clearTimeout(authTimer); return;
      }
      const s = this.session;
      if (!s || s.socket !== ws || msg.sessionId !== s.id) { ws.close(1008, 'wrong_session'); return; }
      s.lastSeen = Date.now();
      if (msg.type === 'snapshot') {
        try { s.snapshot = parseSnapshot(msg); } catch { ws.close(1008, 'invalid_snapshot'); return; }
        s.ready = true; s.lastSnapshot = Date.now(); this.emit('change');
      } else if (msg.type === 'ack') {
        const pending = this.pending.get(msg.id);
        if (!pending || typeof msg.ok !== 'boolean') return;
        clearTimeout(pending.timer); this.pending.delete(msg.id);
        pending.resolve({ ok: msg.ok, message: typeof msg.message === 'string' ? msg.message.slice(0, 160) : '' });
      } else if (msg.type === 'bye') this.disconnect();
      else if (msg.type !== 'ping') ws.close(1008, 'unknown_message');
    });
    ws.on('close', () => {
      clearTimeout(authTimer);
      if (this.candidates.delete(candidateId)) this.emit('change');
      const s = this.session;
      if (s?.socket !== ws) return;
      s.socket = null; s.ready = false; this.failPending('disconnected');
      s.expiry = setTimeout(() => { if (this.session === s && !s.socket) this.disconnect(); }, this.reconnectMs);
      this.emit('change');
    });
  }
  authenticate(ws, msg) {
    const reject = reason => { ws.send(JSON.stringify({ type: 'error', message: reason })); ws.close(1008, reason); return false; };
    if (msg.type !== 'hello' || !validClient(msg)) return reject('invalid_hello');
    let s = this.session;
    if (s) {
      if (s.socket || !equal(msg.token, s.token) || msg.clientId !== s.clientId || msg.server.id !== s.server.id) return reject('session_in_use');
      clearTimeout(s.expiry);
    } else {
      const p = this.pairing;
      if (!p || p.expiresAt < Date.now() || ++p.attempts > 5) { this.pairing = null; this.emit('change'); return reject('pairing_required'); }
      if (!equal(msg.code, p.code)) return reject('wrong_code');
      this.establish(ws, msg); return true;
    }
    this.welcome(ws, s); return true;
  }
  async execute({ serverId, command, animation }) {
    const s = this.session;
    if (!this.view().connected) return { ok: false, message: 'disconnected' };
    if (serverId !== s.server.id) return { ok: false, message: 'wrong_server' };
    if (!['play', 'toggle', 'stop'].includes(command)) return { ok: false, message: 'invalid_command' };
    if (this.pending.size) return { ok: false, message: 'busy' };
    const stopping = command === 'stop' || (command === 'toggle' && s.snapshot.active === animation);
    if (!stopping && s.snapshot.blocked) return { ok: false, message: s.snapshot.blocked };
    if (command !== 'stop' && !s.snapshot.catalog.some(entry => entry.id === animation)) return { ok: false, message: 'animation_missing' };
    const id = randomUUID();
    return new Promise(resolve => {
      const timer = setTimeout(() => { this.pending.delete(id); resolve({ ok: false, message: 'timeout' }); }, 4000);
      this.pending.set(id, { resolve, timer });
      s.socket.send(JSON.stringify({ type: 'execute', id, sessionId: s.id, command, animation: command === 'stop' ? null : animation, expiresAt: Date.now() + 3500 }));
    });
  }
  failPending(message) {
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.resolve({ ok: false, message }); }
    this.pending.clear();
  }
  disconnect() {
    const s = this.session; this.session = null; this.pairing = null;
    clearTimeout(s?.expiry); s?.socket?.close(1000, 'unpaired'); this.failPending('disconnected'); this.emit('change');
  }
  async close() {
    clearInterval(this.heartbeat); this.disconnect();
    this.wss?.clients.forEach(ws => ws.terminate());
    await new Promise(resolve => this.wss ? this.wss.close(resolve) : resolve());
    await new Promise(resolve => this.server ? this.server.close(resolve) : resolve());
  }
}
