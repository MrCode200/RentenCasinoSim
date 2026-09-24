# Renten-Kasino

Kleine clientseitige Simulation für eine Schulpräsentation über finanzielle Altersvorsorge.

## Start

Das Projekt kann direkt auf GitHub Pages veröffentlicht werden.

Wichtig: Die JSON-Dateien werden per `fetch()` geladen. Deshalb funktioniert die App nicht zuverlässig durch Doppelklick auf `index.html` (`file://`). Auf GitHub Pages funktioniert sie.

## Struktur

```text
renten-kasino/
├── index.html
├── style.css
├── app.js
└── data/
    ├── game.json
    ├── assets.json
    └── rounds.json
    
Spielwerte ändern
data/game.json: Startkapital, Rundenzahl, Beginn des Ruhestands
data/assets.json: Anlageformen und sichere Zinsen
data/rounds.json: Einkommen, Ausgaben, Events, Marktänderungen und Codes

Die Events werden in der angegebenen Reihenfolge abgespielt. Es gibt keine Zufallslogik und keine Serverkommunikation.

Hinweis

Die angezeigten Marktänderungen sind bewusst eine vereinfachte Spielsimulation und stellen keine Finanzberatung oder reale Marktprognose dar.
