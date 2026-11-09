import streamDeck, { action, SingletonAction, type KeyDownEvent, type WillAppearEvent, type DidReceiveSettingsEvent, type WillDisappearEvent, type SendToPluginEvent } from '@elgato/streamdeck';
import { Bridge } from './bridge.mjs';
import { keyImage, keyState } from './presentation.mjs';

type Settings = { locale?: string; serverId?: string; animation?: string; command?: string; favorites?: string[] };
const bridge = new Bridge();
const renderCache = new Map<string, string>();
const settingsCache = new Map<string, Settings>();
let lastInspector = '';

async function render() {
  const view = bridge.view();
  const tasks: Promise<unknown>[] = [];
  streamDeck.actions.forEach(key => {
    if (!key.isKey()) return;
    const state = keyState(settingsCache.get(key.id) ?? {}, view);
    const fingerprint = JSON.stringify(state);
    if (renderCache.get(key.id) === fingerprint) return;
    renderCache.set(key.id, fingerprint);
    tasks.push(Promise.all([key.setImage(keyImage(state.state)), key.setTitle(state.title)]));
  });
  if (streamDeck.ui.action) {
    const fingerprint = JSON.stringify(view);
    if (fingerprint !== lastInspector) {
      lastInspector = fingerprint;
      tasks.push(streamDeck.ui.sendToPropertyInspector({ type: 'status', ...view }));
    }
  }
  await Promise.all(tasks);
}
const safeRender = () => { void render().catch(() => streamDeck.logger.warn('Stream Deck display update failed.')); };
bridge.on('change', safeRender);

@action({ UUID: 'com.kyuubisoft.fivem.animation' })
class AnimationAction extends SingletonAction<Settings> {
  override onWillAppear(ev: WillAppearEvent<Settings>) {
    settingsCache.set(ev.action.id, ev.payload.settings); safeRender();
  }
  override onWillDisappear(ev: WillDisappearEvent<Settings>) {
    renderCache.delete(ev.action.id); settingsCache.delete(ev.action.id);
  }
  override onDidReceiveSettings(ev: DidReceiveSettingsEvent<Settings>) {
    settingsCache.set(ev.action.id, ev.payload.settings); renderCache.delete(ev.action.id); safeRender();
  }
  override onPropertyInspectorDidAppear() { lastInspector = ''; safeRender(); }
  override async onSendToPlugin(ev: SendToPluginEvent<{ type?: string; candidateId?: string }, Settings>) {
    const type = ev.payload?.type;
    try {
      if (type === 'connect') bridge.connectCandidate(ev.payload.candidateId);
      else if (type === 'pair') bridge.beginPairing();
      else if (type === 'disconnect') bridge.disconnect();
      else if (type === 'refresh') { lastInspector = ''; safeRender(); }
    } catch (error) {
      await streamDeck.ui.sendToPropertyInspector({ type: 'notice', message: error instanceof Error ? error.message : 'unknown_error' });
    }
  }
  override async onKeyDown(ev: KeyDownEvent<Settings>) {
    const settings = ev.payload.settings;
    const result = await bridge.execute({ serverId: settings.serverId, command: settings.command ?? 'toggle', animation: settings.animation });
    if (!result.ok) {
      await ev.action.showAlert();
      if (streamDeck.ui.action?.id === ev.action.id) await streamDeck.ui.sendToPropertyInspector({ type: 'notice', message: result.message });
    }
  }
}

streamDeck.actions.registerAction(new AnimationAction());
await streamDeck.connect();
try { await bridge.start(); }
catch (error) {
  bridge.error = (error as NodeJS.ErrnoException).code === 'EADDRINUSE' ? 'port_in_use' : 'bridge_error';
  streamDeck.logger.error('Local FiveM bridge could not start.'); safeRender();
}
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { void bridge.close().finally(() => process.exit(0)); });
