const escape = value => String(value).replace(/[<>&"']/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[char]);
export function keyState(settings, view) {
  const t = (en, de) => settings.locale === 'de' ? de : en;
  if (!view.connected) return { title: t('Not\nconnected', 'Nicht\nverbunden'), state: 'offline' };
  if (!settings.serverId || (settings.command !== 'stop' && !settings.animation)) return { title: t('Select\nanimation', 'Animation\nwählen'), state: 'offline' };
  if (settings.serverId !== view.server.id) return { title: t('Different\nserver', 'Anderer\nServer'), state: 'offline' };
  if (settings.command === 'stop') return { title: t('Stop\nanimation', 'Animation\nstoppen'), state: view.snapshot.active ? 'stop' : 'idle' };
  const entry = view.snapshot.catalog.find(item => item.id === settings.animation);
  if (!entry) return { title: t('Not\navailable', 'Nicht\nverfügbar'), state: 'offline' };
  const active = view.snapshot.active === entry.id;
  return { title: entry.label, state: active ? 'active' : view.snapshot.blocked ? 'blocked' : 'idle' };
}
export function keyImage(state) {
  const color = { active: '#ff914d', stop: '#ed775f', blocked: '#d7af66', offline: '#667078', idle: '#cbd3d8' }[state] || '#cbd3d8';
  const symbol = state === 'stop' ? '<rect x="57" y="21" width="30" height="30" rx="5"/>' : '<circle cx="72" cy="22" r="8"/><path d="M72 35v23m-21-20 21 5 21-5M72 58 59 75m13-17 13 17" fill="none" stroke-width="5" stroke-linecap="round"/>';
  return 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144"><rect width="144" height="144" rx="14" fill="#151c22"/><rect x="3" y="3" width="138" height="138" rx="12" fill="none" stroke="${escape(color)}" stroke-width="${state === 'active' ? 5 : 2}"/><g fill="${escape(color)}" stroke="${escape(color)}">${symbol}</g><circle cx="123" cy="20" r="4" fill="${escape(color)}"/></svg>`);
}
