# KS Stream Deck für FiveM

Animationen der aktuellen FiveM-Sitzung mit einem Elgato Stream Deck auslösen und stoppen. Die Verbindung erfolgt über **Verbinden**, ohne Chatbefehl. Ressource und Desktop-Plugin sind unabhängig von einem Freeroam-Mod oder einem bestimmten Framework.

## Installation

Voraussetzungen: FiveM unter Windows, Stream Deck Software ab 7.1 und Zugriff auf die Ressourcen des FiveM-Servers. Es sind weder ein zusätzliches Konto noch Datenbank, API-Schlüssel oder Portfreigabe erforderlich. Das Plugin kommuniziert ausschließlich lokal über Port 39175.

1. Das Bundle aus den **Releases** dieses Repositorys herunterladen und entpacken.
2. Den Ordner `FiveM/ks_streamdeck` in den Ressourcenordner des Servers kopieren. Den Namen `ks_streamdeck` beibehalten.
3. In `config.lua` den `ServerLabel` auf den eigenen Servernamen setzen. Für einen ersten Test können `Provider = 'auto'` und `Framework = 'auto'` bleiben.
4. In der `server.cfg` ergänzen:

   ```cfg
   ensure ks_streamdeck
   ```

5. Die Datei im Ordner `StreamDeck` doppelt anklicken und mit der Stream Deck Software installieren.
6. FiveM starten und dem Server beitreten. Die Aktion **Animation** aus **KS FiveM Animations** auf eine Taste ziehen, ihre Einstellungen öffnen und **Verbinden** anklicken. Bei mehreren Sitzungen die gewünschte auswählen.
7. Eine Animation auswählen. Die Taste startet sie; erneutes Drücken stoppt die zugehörige laufende Animation.

Ohne eingebundenes Animationssystem stehen die fünf Beispiele aus `config.lua` zur Verfügung. Beim Start eines registrierten Animationsanbieters ersetzt dessen Katalog diese Beispiele. Die Ressource enthält keine fremden Animationspakete.

## Vorhandenes Animationssystem einbinden

| Animationssystem | Adapter | Schnittstelle |
| --- | --- | --- |
| RPEmotes Reborn | `rpemotes.lua` | `EmoteData`, `EmoteType`, `EmoteCommandStart` |
| Ältere RPEmotes-Versionen | `rpemotes.lua` | `RP`-Katalog und `EmoteCommandStart` |
| Original dpEmotes | `dpemotes.lua` | `DP`-Katalog und `EmoteMenuStart` |
| scully_emotemenu | `scully.lua` | `Emotes`, `Scenarios`, `PlayEmoteByCommand` |
| ks_animations | automatisch | optionaler bestehender Anbieter |
| Eigenes System oder abweichender Fork | eigenes Adapter-Skript | Beispiele unter `examples/` |

Im `fxmanifest.lua` **der Animationsressource** am Ende, nach deren eigenen Client-Skripten, ergänzen. Beispiel für RPEmotes:

```lua
client_scripts {
    '@ks_streamdeck/adapters/common.lua',
    '@ks_streamdeck/adapters/rpemotes.lua',
}
```

Für dpEmotes oder Scully nur die zweite Zeile durch den passenden Dateinamen aus der Tabelle ersetzen. Pro Animationsressource genau einen Adapter laden. Die Adapter gehören nicht als zusätzliche Client-Skripte in das Manifest von `ks_streamdeck`: Sie benötigen die lokalen Funktionen und Kataloge des Animationssystems.

Startreihenfolge beispielsweise:

```cfg
ensure ks_streamdeck
ensure rpemotes-reborn
```

Bei Änderungen beide Ressourcen neu starten. Umbenannte Animationsressourcen werden unter ihrem tatsächlichen Namen registriert. Mehrere Anbieter können nebeneinander verwendet werden. Geschützte Ressourcen ohne Zugriff auf Manifest oder passende Schnittstellen benötigen eine vom Anbieter freigegebene Integration.

Die Adapter übergeben die Ausführung an das jeweilige Animationssystem, damit dessen Props und Aufräumlogik erhalten bleiben. Unterstützt werden geeignete Einzelanimationen, Tänze, Props und Szenarien. Paaranimationen, Gruppenaktionen, Verbrauchsgegenstände, Gesichtsausdrücke und Gangarten sind nicht Bestandteil dieser Steuerung. Tieranimationen erscheinen nur, wenn das jeweilige System sie erlaubt. Die Statusanzeige verfolgt Animationen, die über den Adapter gestartet wurden.

Nicht jeder Fork hat dieselben Schnittstellen. Die Tabelle beschreibt die vorgesehenen Verträge; beliebige private oder veränderte Systeme werden über einen eigenen Adapter angebunden. Eine pauschale Kompatibilität mit jedem Animationssystem besteht nicht.

## QBCore, Qbox, ESX und eigene Regeln

`Framework = 'auto'` erkennt `qbx_core`, `qb-core` oder `es_extended`, andernfalls läuft die Ressource ohne Framework. Bei mehreren installierten Frameworks gilt diese Reihenfolge. Ein Framework stellt die Spielerzustände bereit; das Animationssystem wird separat wie oben angeschlossen.

Für eine feste Auswahl:

```lua
Framework = 'qbcore', -- alternativ qbox, esx oder standalone
```

Abweichende Ressourcennamen in `FrameworkResources` eintragen. QBCore/Qbox sperren unter anderem bei Tod, Last Stand, Handschellen und fehlenden Spielerdaten. ESX berücksichtigt Ladezustand und Tod. Zusätzlich werden die nativen Spielerzustände, der UI-Fokus und die konfigurierten State Bags geprüft.

`BlockedStates` enthält Zustände, die bei `true` sperren; `DenyFalseStates` enthält Zustände, die bei `false` sperren. Zusätzliche lokale Serverregeln lassen sich in `CanPlay` hinterlegen:

```lua
CanPlay = function()
    if LocalPlayer.state.inEvent then
        return false, 'Während des Events nicht verfügbar.'
    end
    return true
end,
```

Diese Prüfung ersetzt keine Zugriffsregeln des eigentlichen Animationssystems. Eigene Systeme sollten ihre Berechtigungsprüfung auch im Adapter ausführen.

## Eigenes Animationssystem

`resources/ks_streamdeck/examples/custom_adapter.lua` zeigt den Anschluss eines Systems mit bekannten Animations-Dictionaries und Clips. Das Beispiel ist eine Vorlage: Die dort verwendete `MyEmotes`-Schnittstelle muss durch die eigene Implementierung ersetzt werden. Zuerst `adapters/common.lua`, dann das angepasste Beispiel innerhalb der eigenen Animationsressource laden.

Für vollständig eigene Ausführung gibt es `examples/animation_provider.lua`. Der Client-Export `RegisterAnimationProvider(id, provider)` erwartet:

- `catalog()`: Liste mit `id`, `label`, `category` und optional `keywords`.
- `play(id, canContinue)`: Starten; nur bei erfolgreichem Start `true` zurückgeben.
- `stop()`: Nur die eigene Animation beenden.
- `current()`: ID der tatsächlich laufenden eigenen Animation oder `nil`.
- Optional `canPlay(id)`: Eigene Berechtigungen und Spielerzustände prüfen.

Nach jedem asynchronen Laden und unmittelbar vor dem Start muss `canContinue()` geprüft werden. Bei Systemen, die Starts in eigene Hintergrund-Threads verlagern, muss diese Prüfung in deren Startpfad integriert werden; ein äußerer Wrapper allein kann das nicht garantieren. Der Beispieladapter prüft zusätzlich anhand der nativen Animation, ob der Start tatsächlich erfolgt ist.

Der Katalog darf bis zu 10.000 Einträge enthalten. IDs müssen kurze, stabile Kennungen sein. Es werden Metadaten übertragen, keine frei ausführbaren Befehle, Skripte oder Events vom Desktop. Beim Stoppen der Eigentümerressource wird deren Anbieter entfernt.

## Verbindung und Neustarts

Die Verbindung gilt für die gewählte Serversitzung. Bei einem kurzen Neustart von `ks_streamdeck` wird sie automatisch wiederhergestellt; das Wiederaufnahmefenster beträgt ungefähr 25 Sekunden. Eine neue Spielsitzung, ein Serverwechsel oder eine längere Unterbrechung kann erneutes **Verbinden** erfordern. Eine dauerhaft globale Kopplung über beliebige Serversitzungen hinweg ist nicht vorgesehen.

Der manuelle Kopplungscode unter den erweiterten Einstellungen ist nur ein optionaler Ersatzweg. Für den normalen Verbindungsablauf muss der Server keinen Chat anbieten.

## Fehler finden und testen

- **Keine Sitzung gefunden:** Auf dem Server muss `ks_streamdeck` laufen; FiveM und Stream Deck müssen auf demselben PC geöffnet sein. Port 39175 darf nicht von einer anderen Anwendung belegt sein.
- **Nur Beispielanimationen sichtbar:** Adapter im Manifest des Animationssystems prüfen. Er muss nach dessen eigenen Skripten geladen werden. Beide Ressourcen neu starten.
- **Anbieter meldet Fehler:** Die FiveM-Konsole mit F8 öffnen. Anbietername und Fehler helfen dabei, einen abweichenden Fork oder fehlende Schnittstellen zu erkennen.
- **Animation gesperrt:** Spielerzustände, Framework-Auswahl und Regeln des Animationssystems prüfen.
- **Status prüfen:** In einem lokalen Client-Skript liefert `exports.ks_streamdeck:GetStatus()` Verbindung, aktive Animation, registrierte Anbieter und erkanntes Framework.

Zum Abnahmetest auf dem eigenen Server: normale Animation und Prop starten/stoppen, UI öffnen, Tod/Handschellen prüfen, Animationsressource neu starten und anschließend `ks_streamdeck` neu starten. Dabei darf die Steuerung keine fremde laufende Aufgabe abbrechen. Die automatisierten Tests simulieren Anbieter-Schnittstellen und Spielerzustände; sie ersetzen keinen Test mit der konkret installierten Version im Spiel.

## Aus dem Quellcode bauen

Benötigt werden Node.js 20 oder neuer, npm, Python 3 und für die Ressourcentests Lua 5.4. Im Repository:

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

Die fertigen Installationsdateien und SHA-256-Prüfsummen liegen danach unter `dist/`. Das Bundle enthält die Ressource, das installierbare Stream Deck Plugin und diese Anleitung. Zum direkten Installieren aus dem Quellcode kann der Ordner `resources/ks_streamdeck` verwendet werden.

Hinweise zu eingebundenen Drittanbieter-Komponenten stehen in `plugin/com.kyuubisoft.fivem.sdPlugin/THIRD-PARTY-NOTICES.txt`. Die Animationssysteme selbst werden nicht mitgeliefert: [RPEmotes Reborn](https://github.com/alberttheprince/rpemotes-reborn), [dpEmotes](https://github.com/andristum/dpemotes), [Scully Emote Menu](https://github.com/Scullyy/scully_emotemenu).
