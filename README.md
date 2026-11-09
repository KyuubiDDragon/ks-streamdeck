# KS Stream Deck for FiveM

[English](README.md) · [Deutsch](README.de.md)

Start and stop animations in your current FiveM session with an Elgato Stream Deck. Click **Connect** to link the session without a chat command. The FiveM resource and companion desktop plugin work independently of a freeroam resource or a specific framework.

## Installation

You need FiveM on Windows, Stream Deck software 7.1 or later, a compatible Stream Deck device, and access to the server's resource configuration. No additional account, database, API key or port forwarding is required. The desktop connection uses localhost port 39175.

1. Download and extract the bundle from this repository's **Releases**.
2. Copy `FiveM/ks_streamdeck` into your server's resources folder. Keep the resource name `ks_streamdeck`.
3. Set `ServerLabel` in `config.lua` to your server's name. Leave `Provider = 'auto'` and `Framework = 'auto'` for an initial test.
4. Add this line to `server.cfg`:

   ```cfg
   ensure ks_streamdeck
   ```

5. Double-click the `.streamDeckPlugin` file in the `StreamDeck` folder to install the companion plugin.
6. Start FiveM and join your server. Add the **Animation** action from **KS FiveM Animations** to a Stream Deck key. Open its settings and click **Connect**. Select a session if more than one is available.
7. Select an animation. Press the key to start it and press again to stop that animation. Dedicated start and stop actions are also available.

Without an animation adapter, the resource offers five example animations from `config.lua`. When an external provider registers, its catalog replaces these fallback examples. Third-party animation packages are not included.

## Languages

English is the default language.

- **Stream Deck:** select **English** or **Deutsch** in the action's **Language** field. The choice is saved per key and applies to its settings panel and key status labels.
- **FiveM:** set `Locale = 'en'` or `Locale = 'de'` in `config.lua`, then restart the resource. This controls in-game messages, built-in animation labels and errors reported by the resource.
- **External animation names:** labels come from the installed provider. Configure that provider's language separately; the bridge does not translate arbitrary catalog entries or custom provider errors.

## Connect an existing animation system

| Animation system | Adapter | Expected interface |
| --- | --- | --- |
| RPEmotes Reborn | `rpemotes.lua` | `EmoteData`, `EmoteType`, `EmoteCommandStart` |
| Older RPEmotes versions | `rpemotes.lua` | `RP` catalog and `EmoteCommandStart` |
| Original dpEmotes | `dpemotes.lua` | `DP` catalog and `EmoteMenuStart` |
| scully_emotemenu | `scully.lua` | `Emotes`, `Scenarios`, `PlayEmoteByCommand` |
| ks_animations | automatic | optional existing provider |
| Custom systems or modified forks | custom adapter | examples in `examples/` |

Add the following at the end of **your animation resource's** `fxmanifest.lua`, after its existing client scripts. This example uses RPEmotes:

```lua
client_scripts {
    '@ks_streamdeck/adapters/common.lua',
    '@ks_streamdeck/adapters/rpemotes.lua',
}
```

For dpEmotes or Scully, replace only the second filename with the adapter listed above. Load exactly one adapter per animation resource. These scripts need access to the animation system's local functions and catalog, so do not add them to the `ks_streamdeck` client script list.

Example start order:

```cfg
ensure ks_streamdeck
ensure rpemotes-reborn
```

Restart both resources after changing their manifests. Renamed animation resources register under their actual names. Multiple providers can coexist. Protected resources without editable manifests or suitable interfaces require an integration approved by their developer.

Adapters delegate playback to the installed animation system so it continues to manage props and cleanup. They expose suitable solo emotes, dances, props and scenarios. Paired animations, group actions, consumable items, expressions and walk styles are outside this integration's scope. Animal animations are exposed only when enabled by the provider. Status tracking covers animations started through the adapter.

Forks may change these interfaces. The table describes the contracts targeted by the adapters, not a guarantee that every version or private fork works unchanged. Use a custom adapter for incompatible systems.

## QBCore, Qbox, ESX and custom restrictions

`Framework = 'auto'` detects `qbx_core`, `qb-core` or `es_extended`, in that order, and otherwise runs without a framework. Framework integration reads player state; animation playback is connected separately as described above.

To select a framework explicitly:

```lua
Framework = 'qbcore', -- alternatively qbox, esx or standalone
```

Use `FrameworkResources` for renamed framework resources. QBCore/Qbox checks include death, last stand, handcuffs and unavailable player data. ESX checks include player loading and death. Native player conditions, UI focus and configured state bags are also checked.

`BlockedStates` lists flags that block playback when `true`; `DenyFalseStates` lists flags that block it when `false`. Add local server rules through `CanPlay`:

```lua
CanPlay = function()
    if LocalPlayer.state.inEvent then
        return false, 'Animations are unavailable during this event.'
    end
    return true
end,
```

These checks do not replace the animation system's access rules. Custom integrations should also check their own permissions inside the adapter.

## Connect a custom animation system

`resources/ks_streamdeck/examples/custom_adapter.lua` shows how to connect a system with known animation dictionaries and clips. Replace the illustrative `MyEmotes` interface with your implementation. Load `adapters/common.lua` and then your adapted example inside the animation resource.

For custom playback handling, see `examples/animation_provider.lua`. The client export `RegisterAnimationProvider(id, provider)` accepts:

- `catalog()`: entries containing `id`, `label`, `category` and optional `keywords`.
- `play(id, canContinue)`: start playback; return `true` only when it actually starts.
- `stop()`: stop only the provider's own animation.
- `current()`: the ID of the provider's animation actually playing, or `nil`.
- Optional `canPlay(id)`: check the provider's permissions and player conditions.

Call `canContinue()` after asynchronous loading and immediately before playback. If an engine schedules playback in a separate background thread, integrate this check into that start path; an outer wrapper cannot guarantee it. The shared adapter also checks native playback state to verify a start.

The shared catalog supports up to 10,000 entries. Use short, stable IDs. The bridge transfers catalog metadata, not arbitrary desktop-provided commands, scripts or events. Stopping the owner resource removes its provider.

## Connections and restarts

Pairing belongs to the selected server session. A short restart of `ks_streamdeck` reconnects automatically, with a recovery window of approximately 25 seconds. A new game session, server switch or longer interruption can require clicking **Connect** again. Pairing is not permanent across arbitrary server sessions.

Code pairing in the expandable settings is an optional fallback. The normal connection workflow does not require a server chat resource.

## Troubleshooting and testing

- **No session found:** `ks_streamdeck` must be running on the server. FiveM and Stream Deck must run on the same PC, with port 39175 available.
- **Only example animations appear:** check the adapter in the animation resource's manifest. It must load after that resource's own scripts. Restart both resources.
- **Provider error:** open FiveM's F8 console. The provider name and error can identify missing interfaces or an incompatible fork.
- **Animation blocked:** check player state, framework selection and the animation system's restrictions.
- **Inspect status:** a local client script can call `exports.ks_streamdeck:GetStatus()` for the connection, active animation, registered providers and detected framework.

Test on your server before distribution: start/stop a normal emote and a prop emote, open a focused UI, check death and handcuff restrictions, restart the animation resource, then restart `ks_streamdeck`. The integration must not cancel another resource's unrelated task. Automated tests simulate provider interfaces and player state; they do not replace in-game tests with the installed versions.

## Build from source

Install Node.js 20 or later, npm, Python 3, and Lua 5.4 for the resource tests. From the repository:

```sh
cd plugin
npm ci
npm run typecheck
npm test
npm run test:lua
npx playwright install chromium
npm run test:browser
npm run release
```

Installers and SHA-256 checksums are written to `dist/`. The bundle includes the FiveM resource, companion plugin and both language versions of this guide. For source installation, use `resources/ks_streamdeck` directly.

## Support and third-party components

Report bugs through [GitHub Issues](https://github.com/KyuubiDDragon/ks-streamdeck/issues). Include the resource/plugin version, framework, animation system and version, reproduction steps, and relevant F8 errors. Do not include pairing credentials.

Bundled dependency notices are in `plugin/com.kyuubisoft.fivem.sdPlugin/THIRD-PARTY-NOTICES.txt`. Animation systems are installed separately: [RPEmotes Reborn](https://github.com/alberttheprince/rpemotes-reborn), [dpEmotes](https://github.com/andristum/dpemotes), [Scully Emote Menu](https://github.com/Scullyy/scully_emotemenu).
