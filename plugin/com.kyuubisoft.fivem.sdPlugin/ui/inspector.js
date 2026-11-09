/* Elgato Property Inspector protocol; this socket is separate from the FiveM bridge. */
let socket, context, actionId, settings = {}, view = { connected: false }, favoritesOnly = false;
let hostConnected = false;
const t = (key, values) => KSLocale.text(settings.locale, key, values);
const el = id => document.getElementById(id);
const messages = { disconnected: "FiveM is not connected.", wrong_server: "This key belongs to another server.",
  animation_missing: "This animation is unavailable on the server.", timeout: "The game did not respond in time.",
  busy: "An action is in progress.", stale_state: "The game state is out of date.",
  disconnect_first: "Disconnect the current session first.", port_in_use: "Local port 39175 is in use. Close any second plugin instance and restart the plugin.",
  bridge_error: "Could not start the local connection.",
  session_unavailable: "This FiveM session is no longer available. Select the current session." };
function send(event, payload) { if (socket?.readyState === 1) socket.send(JSON.stringify({ event, context, action: actionId, payload })); }
function request(type, extra = {}) { send('sendToPlugin', { type, ...extra }); }
function save() { send('setSettings', settings); }
function notice(text) { el('notice').textContent = t(messages[text] || text || ''); el('notice').hidden = !text; }
function renderOptions() {
  const catalog = view.snapshot?.catalog || [];
  const selected = settings.animation || '';
  const category = el('category').value;
  const query = el('search').value.trim().toLocaleLowerCase();
  const categories = [...new Set(catalog.map(item => item.category))].sort((a,b) => a.localeCompare(b, settings.locale === 'de' ? 'de' : 'en'));
  el('category').replaceChildren(new Option(t("All categories"), ''), ...categories.map(value => new Option(value, value)));
  el('category').value = categories.includes(category) ? category : '';
  const items = catalog.filter(item => (!el('category').value || item.category === el('category').value) &&
    (!favoritesOnly || (settings.favorites || []).includes(item.id)) &&
    (!query || `${item.label} ${item.keywords}`.toLocaleLowerCase().includes(query)));
  const missing = selected && !catalog.some(item => item.id === selected);
  const options = [new Option(view.connected ? t("Select animation …") : t("Please connect …"), '')];
  if (selected && !items.some(item => item.id === selected)) {
    const current = catalog.find(item => item.id === selected);
    options.push(new Option(current ? `${current.label} · ${t('selected')}` : t("Saved animation · unavailable"), selected));
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
  KSLocale.apply(settings.locale);
  el('language').value = settings.locale === 'de' ? 'de' : 'en';
  if (view.connected && settings.command === 'stop' && !settings.serverId) {
    settings.serverId = view.server.id; save();
  }
  el('status').textContent = view.connected ? t("Connected") : t("Not connected");
  el('status').classList.toggle('connected', view.connected);
  el('server').textContent = view.server?.label || t("Your game. Your keys.");
  const candidates = view.candidates || [];
  const selectedSession = el('session').value;
  el('session').replaceChildren(new Option(t("Select session …"), ''), ...candidates.map((c, index) => new Option(`${c.server.label} · ${c.server.id} · ${t('Session')} ${index + 1}`, c.id)));
  el('session').value = candidates.some(c => c.id === selectedSession) ? selectedSession : candidates.length === 1 ? candidates[0].id : '';
  el('session-choice').hidden = Boolean(view.server) || candidates.length < 2;
  el('connect').hidden = Boolean(view.server);
  el('connect').disabled = !hostConnected || !el('session').value || Boolean(view.error);
  el('connection-help').textContent = view.connected ? t("Your animations are ready. Choose what this key does below.") : view.server ? t("Reconnecting …") : candidates.length ? t("FiveM detected. Click Connect; no chat command needed.") : t("Open FiveM and join a server running ks_streamdeck. Your session will appear automatically.");
  el('manual').hidden = Boolean(view.server);
  el('pair').hidden = Boolean(view.server); el('pair').disabled = !hostConnected || Boolean(view.pairing || view.error);
  el('disconnect').hidden = !view.server && !view.pairing;
  el('pair-code').hidden = !view.pairing;
  el('code').textContent = view.pairing ? `streamdeck ${view.pairing.code}` : '';
  el('command').value = settings.command || 'toggle';
  el('animation-fields').hidden = settings.command === 'stop';
  const mismatch = settings.serverId && view.server && settings.serverId !== view.server.id;
  el('binding').hidden = !settings.serverId;
  el('binding-text').textContent = mismatch ? t("This key belongs to a different server.") : t("Key binding saved for this server.");
  el('rebind').hidden = !mismatch || !view.connected;
  if (view.error) notice(view.error);
  renderOptions(); updateTimer();
}
function updateTimer() {
  if (!view.pairing) return;
  const seconds = Math.max(0, Math.ceil((view.pairing.expiresAt - Date.now()) / 1000));
  el('expires').textContent = seconds ? t('Valid for {seconds} more seconds', {seconds}) : t("Code expired. Please pair again.");
  if (!seconds) { view.pairing = null; render(); }
}
window.connectElgatoStreamDeckSocket = (port, uuid, registerEvent, _info, actionInfo) => {
  const info = JSON.parse(actionInfo); context = uuid; actionId = info.action; settings = info.payload.settings || {};
  socket = new WebSocket(`ws://127.0.0.1:${port}`);
  socket.onopen = () => { hostConnected = true; socket.send(JSON.stringify({ event: registerEvent, uuid })); request('refresh'); render(); };
  socket.onclose = () => { hostConnected = false; render(); notice(t("Disconnected from the Stream Deck application.")); };
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.event === 'didReceiveSettings') { settings = message.payload.settings || {}; render(); }
    if (message.event === 'sendToPropertyInspector') {
      if (message.payload.type === 'status') { view = message.payload; render(); }
      if (message.payload.type === 'notice') notice(message.payload.message);
    }
  };
};
el('language').onchange = () => { settings.locale = el('language').value; save(); notice(''); render(); };
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
