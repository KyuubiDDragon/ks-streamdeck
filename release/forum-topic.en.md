# [FREE] [Standalone] KS Stream Deck — FiveM animation controls

KS Stream Deck lets you start and stop FiveM animations from an Elgato Stream Deck. Connect to your current game session, choose an animation and assign it to a key. The key reflects whether the selected animation is playing.

The integration consists of one FiveM resource and a companion Stream Deck plugin. Server owners install the resource; players install the plugin on the same Windows PC that runs FiveM.

## Preview

[Add an actual in-game demonstration here: connect, select an animation, start/stop it and show resource restart recovery.]

## Features

- Connect with one click; no server chat resource or chat command is needed.
- Choose between start, stop and toggle actions.
- Search the animation catalog, filter categories and save favorites.
- Keep key bindings associated with their server.
- Reconnect after a short resource restart, within an approximately 25-second recovery window.
- Run without a framework, or use player-state checks for QBCore, Qbox and ESX.
- Use English by default, with a German language option.
- Extend the integration through custom animation providers.

Communication between FiveM and the desktop plugin stays on localhost. No additional account, database, API key or port forwarding is required.

## Animation systems

Adapters are included for RPEmotes/Reborn, original dpEmotes and scully_emotemenu. These adapters run inside the installed animation resource, which continues to handle playback, props and cleanup. The README explains which scripts to add to its manifest.

Custom systems and modified forks can use the included provider examples. Compatibility depends on the interfaces exposed by the installed version; this is not an automatic integration with every emote menu.

Without an external provider, five configurable example animations are available. Third-party animation packs are not included. Paired/group actions, consumables, expressions and walk styles are outside the scope of this integration.

## Installation

1. Download the bundle linked below.
2. Copy `FiveM/ks_streamdeck` to your server's resources folder and add `ensure ks_streamdeck` to `server.cfg`.
3. Set your server name in `config.lua`. Add an animation adapter if you want to use an existing emote system.
4. Install the included `.streamDeckPlugin` file on the player's PC.
5. Join the server, add the **Animation** action to a Stream Deck key, click **Connect** and select an animation.

Requirements: FiveM on Windows, Stream Deck software 7.1 or newer, a compatible Stream Deck device, and the server-side installation of the `ks_streamdeck` resource. It is not a player-only mod that can be used on servers without the resource.

## Performance and size

[Add measured FiveM resource-monitor values for idle, connected and active playback, together with a profiler/resource-monitor screenshot. State the tested framework, animation provider and catalog size.]

Version 1.3.0 compressed downloads: FiveM resource 33.8 KiB; complete resource and plugin bundle 170.3 KiB. No custom models or streamed textures are included.

## Download and documentation

- [Download the latest release](https://github.com/KyuubiDDragon/ks-streamdeck/releases/latest)
- [Source and English installation guide](https://github.com/KyuubiDDragon/ks-streamdeck)
- [Deutsche Anleitung](https://github.com/KyuubiDDragon/ks-streamdeck/blob/main/README.de.md)
- [Support / bug reports](https://github.com/KyuubiDDragon/ks-streamdeck/issues)

For bug reports, include the plugin/resource version, framework, animation provider and version, reproduction steps, and relevant F8 errors.

| | |
| --- | --- |
| Code is accessible | Yes |
| Subscription-based | No |
| Lines (approximately) | ~2,000 including FiveM resource, adapters, desktop plugin and UI; excluding tests, examples and bundled dependencies |
| Requirements & dependencies | FiveM on Windows; Stream Deck software 7.1+ and compatible device; installed ks_streamdeck resource. Animation providers and frameworks are optional. |
| Support | Yes, via GitHub Issues |
