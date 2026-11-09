/* Static inspector labels and persisted per-key language selection. */
const KSLocale = (() => {
  const german = {
  "Not connected": "Nicht verbunden",
  "Connected": "Verbunden",
  "CONNECTION": "VERBINDUNG",
  "Your game. Your keys.": "Dein Spiel. Deine Tasten.",
  "Open FiveM and join a server. Your session will appear here automatically.": "FiveM öffnen und einem Server beitreten. Die Sitzung wird hier automatisch erkannt.",
  "FiveM session": "FiveM-Sitzung",
  "Connect": "Verbinden",
  "Disconnect": "Trennen",
  "Pair with a code instead": "Alternativ mit Code koppeln",
  "Enter in F8 (prefix with / in chat)": "In F8 eingeben (im Chat mit / davor)",
  "Generate pairing code": "Kopplungscode erzeugen",
  "THIS KEY": "DIESE TASTE",
  "On press": "Beim Drücken",
  "Start / Stop": "Starten / Stoppen",
  "Start animation": "Animation starten",
  "Stop current animation": "Aktuelle Animation stoppen",
  "Find animation": "Animation suchen",
  "Name or keyword …": "Name oder Stichwort …",
  "Category": "Kategorie",
  "All categories": "Alle Kategorien",
  "Favorites only": "Nur Favoriten",
  "Please connect …": "Bitte verbinden …",
  "Save as favorite": "Als Favorit speichern",
  "Assign to this server": "Diesem Server zuordnen",
  "The key reflects the state in your game.": "Die Taste zeigt den Zustand aus dem Spiel.",
  "No commands needed. No extra account.": "Keine Befehle nötig. Kein zusätzliches Konto.",
  "FiveM is not connected.": "FiveM ist nicht verbunden.",
  "This key belongs to another server.": "Die Taste gehört zu einem anderen Server.",
  "This animation is unavailable on the server.": "Diese Animation ist auf dem Server nicht verfügbar.",
  "The game did not respond in time.": "Keine rechtzeitige Antwort aus dem Spiel.",
  "An action is in progress.": "Eine Aktion wird gerade ausgeführt.",
  "The game state is out of date.": "Der Spielzustand ist nicht aktuell.",
  "Disconnect the current session first.": "Trenne zuerst die aktuelle Sitzung.",
  "Local port 39175 is in use. Close any second plugin instance and restart the plugin.": "Der lokale Anschluss 39175 ist belegt. Beende eine zweite Plugin-Instanz und starte das Plugin neu.",
  "Could not start the local connection.": "Die lokale Verbindung konnte nicht gestartet werden.",
  "This FiveM session is no longer available. Select the current session.": "Diese FiveM-Sitzung ist nicht mehr verfügbar. Wähle die aktuelle Sitzung.",
  "Select animation …": "Animation auswählen …",
  "Saved animation · unavailable": "Gespeicherte Animation · nicht verfügbar",
  "Select session …": "Sitzung auswählen …",
  "Your animations are ready. Choose what this key does below.": "Deine Animationen sind bereit. Wähle unten die Funktion dieser Taste.",
  "Reconnecting …": "Die Verbindung wird wiederhergestellt …",
  "FiveM detected. Click Connect; no chat command needed.": "FiveM erkannt. Klicke auf Verbinden – kein Chat-Befehl nötig.",
  "Open FiveM and join a server running ks_streamdeck. Your session will appear automatically.": "FiveM öffnen und einem Server mit ks_streamdeck beitreten. Die Sitzung wird automatisch erkannt.",
  "This key belongs to a different server.": "Diese Taste gehört zu einem anderen Server.",
  "Key binding saved for this server.": "Belegung für diesen Server gespeichert.",
  "Code expired. Please pair again.": "Code abgelaufen. Bitte neu koppeln.",
  "Disconnected from the Stream Deck application.": "Verbindung zur Stream-Deck-Anwendung getrennt.",
  "selected": "ausgewählt",
  "Session": "Sitzung",
  "Valid for {seconds} more seconds": "Noch {seconds} Sekunden gültig",
  "Language": "Sprache"
};
  const labels = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (Object.hasOwn(german, node.textContent.trim())) labels.push([node, null, node.textContent.trim()]);
  }
  document.querySelectorAll('[placeholder], [aria-label]').forEach(node => {
    for (const attribute of ['placeholder', 'aria-label']) {
      const key = node.getAttribute(attribute);
      if (Object.hasOwn(german, key)) labels.push([node, attribute, key]);
    }
  });
  function text(locale, key, values = {}) {
    let value = locale === 'de' ? german[key] || key : key;
    for (const [name, replacement] of Object.entries(values)) value = value.replaceAll(`{${name}}`, String(replacement));
    return value;
  }
  function apply(locale) {
    document.documentElement.lang = locale === 'de' ? 'de' : 'en';
    for (const [node, attribute, key] of labels) {
      if (attribute) node.setAttribute(attribute, text(locale, key));
      else node.textContent = text(locale, key);
    }
  }
  return {text, apply};
})();
