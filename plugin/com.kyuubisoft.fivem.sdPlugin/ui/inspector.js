/* Elgato Property Inspector protocol; this socket is separate from the FiveM bridge. */
let socket, context, actionId, settings = {}, view = { connected: false }, favoritesOnly = false;
let hostConnected = false;
const el = id => document.getElementById(id);
const messages = { disconnected: 'FiveM ist nicht verbunden.', wrong_server: 'Die Taste gehört zu einem anderen Server.',
  animation_missing: 'Diese Animation ist auf dem Server nicht verfügbar.', timeout: 'Keine rechtzeitige Antwort aus dem Spiel.',
  busy: 'Eine Aktion wird gerade ausgeführt.', stale_state: 'Der Spielzustand ist nicht aktuell.',
  disconnect_first: 'Trenne zuerst die aktuelle Sitzung.', port_in_use: 'Der lokale Anschluss 39175 ist belegt. Beende eine zweite Plugin-Instanz und starte das Plugin neu.',
  bridge_error: 'Die lokale Verbindung konnte nicht gestartet werden.',
  session_unavailable: 'Diese FiveM-Sitzung ist nicht mehr verfügbar. Wähle die aktuelle Sitzung.' };
function send(event, payload) { if (socket?.readyState === 1) socket.send(JSON.stringify({ event, context, action: actionId, payload })); }
function request(type, extra = {}) { send('sendToPlugin', { type, ...extra }); }
function save() { send('setSettings', settings); }
function notice(text) { el('notice').textContent = messages[text] || text || ''; el('notice').hidden = !text; }
function renderOptions() {
  const catalog = view.snapshot?.catalog || [];
  const selected = settings.animation || '';
  const category = el('category').value;
  const query = el('search').value.trim().toLocaleLowerCase();
  const categories = [...new Set(catalog.map(item => item.category))].sort((a,b) => a.localeCompare(b, 'de'));
  el('category').replaceChildren(new Option('Alle Kategorien', ''), ...categories.map(value => new Option(value, value)));
  el('category').value = categories.includes(category) ? category : '';
  const items = catalog.filter(item => (!el('category').value || item.category === el('category').value) &&
    (!favoritesOnly || (settings.favorites || []).includes(item.id)) &&
    (!query || `${item.label} ${item.keywords}`.toLocaleLowerCase().includes(query)));
  const missing = selected && !catalog.some(item => item.id === selected);
  const options = [new Option(view.connected ? 'Animation auswählen …' : 'Bitte verbinden …', '')];
  if (selected && !items.some(item => item.id === selected)) {
    const current = catalog.find(item => item.id === selected);
    options.push(new Option(current ? `${current.label} · ausgewählt` : 'Gespeicherte Animation · nicht verfügbar', selected));
  }
  options.push(...items.map(item => new Option(item.label, item.id)));
  el('animation').replaceChildren(...options); el('animation').value = selected;
  el('animation').disabled = !view.connected || (settings.serverId && settings.serverId !== view.server?.id);
  el('count').textContent = `· ${items.length}`;
  const favorite = (settings.favorites || []).includes(selected);
  el('favorite').textContent = favorite ? '★' : '☆'; el('favorite').setAttribute('aria-pressed', String(favorite));
  el('favorite').disabled = !selected || missing;
}
function render() {
  if (view.connected && settings.command === 'stop' && !settings.serverId) {
    settings.serverId = view.server.id; save();
  }
  el('status').textContent = view.connected ? 'Verbunden' : 'Nicht verbunden';
  el('status').classList.toggle('connected', view.connected);
  el('server').textContent = view.server?.label || 'Dein Spiel. Deine Tasten.';
  const candidates = view.candidates || [];
  const selectedSession = el('session').value;
  el('session').replaceChildren(new Option('Sitzung auswählen …', ''), ...candidates.map((c, index) => new Option(`${c.server.label} · ${c.server.id} · Sitzung ${index + 1}`, c.id)));
  el('session').value = candidates.some(c => c.id === selectedSession) ? selectedSession : candidates.length === 1 ? candidates[0].id : '';
  el('session-choice').hidden = Boolean(view.server) || candidates.length < 2;
  el('connect').hidden = Boolean(view.server);
  el('connect').disabled = !hostConnected || !el('session').value || Boolean(view.error);
  el('connection-help').textContent = view.connected ? 'Deine Animationen sind bereit. Wähle unten die Funktion dieser Taste.' : view.server ? 'Die Verbindung wird wiederhergestellt …' : candidates.length ? 'FiveM erkannt. Klicke auf Verbinden – kein Chat-Befehl nötig.' : 'FiveM öffnen und einem Server mit ks_streamdeck beitreten. Die Sitzung wird automatisch erkannt.';
  el('manual').hidden = Boolean(view.server);
  el('pair').hidden = Boolean(view.server); el('pair').disabled = !hostConnected || Boolean(view.pairing || view.error);
  el('disconnect').hidden = !view.server && !view.pairing;
  el('pair-code').hidden = !view.pairing;
  el('code').textContent = view.pairing ? `streamdeck ${view.pairing.code}` : '';
  el('command').value = settings.command || 'toggle';
  el('animation-fields').hidden = settings.command === 'stop';
  const mismatch = settings.serverId && view.server && settings.serverId !== view.server.id;
  el('binding').hidden = !settings.serverId;
  el('binding-text').textContent = mismatch ? 'Diese Taste gehört zu einem anderen Server.' : 'Belegung für diesen Server gespeichert.';
  el('rebind').hidden = !mismatch || !view.connected;
  if (view.error) notice(view.error);
  renderOptions(); updateTimer();
}
function updateTimer() {
  if (!view.pairing) return;
  const seconds = Math.max(0, Math.ceil((view.pairing.expiresAt - Date.now()) / 1000));
  el('expires').textContent = seconds ? `Noch ${seconds} Sekunden gültig` : 'Code abgelaufen. Bitte neu koppeln.';
  if (!seconds) { view.pairing = null; render(); }
}
window.connectElgatoStreamDeckSocket = (port, uuid, registerEvent, _info, actionInfo) => {
  const info = JSON.parse(actionInfo); context = uuid; actionId = info.action; settings = info.payload.settings || {};
  socket = new WebSocket(`ws://127.0.0.1:${port}`);
  socket.onopen = () => { hostConnected = true; socket.send(JSON.stringify({ event: registerEvent, uuid })); request('refresh'); render(); };
  socket.onclose = () => { hostConnected = false; render(); notice('Verbindung zur Stream-Deck-Anwendung getrennt.'); };
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.event === 'didReceiveSettings') { settings = message.payload.settings || {}; render(); }
    if (message.event === 'sendToPropertyInspector') {
      if (message.payload.type === 'status') { view = message.payload; render(); }
      if (message.payload.type === 'notice') notice(message.payload.message);
    }
  };
};
el('pair').onclick = () => { notice(''); request('pair'); };
el('connect').onclick = () => { notice(''); request('connect', { candidateId: el('session').value }); };
el('session').onchange = render;
el('disconnect').onclick = () => { notice(''); request('disconnect'); };
el('command').onchange = () => { settings.command = el('command').value; if (!settings.serverId && view.connected) settings.serverId = view.server.id; save(); render(); };
el('animation').onchange = () => { settings.animation = el('animation').value; if (view.connected) settings.serverId = view.server.id; settings.command ||= 'toggle'; notice(''); save(); render(); };
el('rebind').onclick = () => { settings.serverId = view.server.id; settings.animation = ''; save(); render(); };
el('search').oninput = renderOptions; el('category').onchange = renderOptions;
el('favorites-only').onclick = () => { favoritesOnly = !favoritesOnly; el('favorites-only').setAttribute('aria-pressed', String(favoritesOnly)); el('favorites-only').textContent = favoritesOnly ? '★' : '☆'; renderOptions(); };
el('favorite').onclick = () => { const values = new Set(settings.favorites || []); if (values.has(settings.animation)) values.delete(settings.animation); else values.add(settings.animation); settings.favorites = [...values].slice(-200); save(); renderOptions(); };
setInterval(updateTimer, 1000);
render();
