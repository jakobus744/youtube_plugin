# Prüfläufe

Zwei Werkzeuge finden Brüche, wenn YouTube seine Seiten umbaut.

| | Nächtlich auf dem Mini-PC | Von Hand am Handy |
|---|---|---|
| Skript | `tools/nightly.mjs`, gestartet von `tools/nightly/run.sh` | `tools/phone-check.mjs` (`npm run check:phone`) |
| Umgebung | Chromium ohne Bildschirm, nicht angemeldet | ytx-App per adb, mit dem eigenen Konto |
| Prüft | ytx läuft, Diagnose, Prüfmodus, Selektoren, Umbau der Originalseiten | Zurück, Leiste, Video, Graph-Daten am echten Gerät (siehe `docs/ANDROID-APP.md`, Abschnitt 6) |
| Meldung | ntfy, nur bei Problemen | Bericht `check-out/<zeit>/report.md` |

## Was der nächtliche Lauf prüft

Er lädt YouTube mobil, Music in der Handy-Ansicht, YouTube am Desktop und Music am Desktop. Dabei spielt er `dist/ytx.min.js` ein, so wie Tampermonkey. Für die Handy-Seiten tut er so, als liefe ytx in der App (`window.__ytxNative`). Damit sind die App-Funktionen und der Prüfmodus `appCheck` aktiv.

- **ytx geladen**, keine Skriptfehler von ytx auf der Seite.
- **Diagnose** (`__ytx.diagnose()`): Fehler, die in der letzten Nacht noch nicht da waren.
- **Prüfmodus** (`__ytxReport()`): Player da, Graph-Daten für Despacito geliefert, Suche liefert Treffer, Music-Player öffnet, Startseite liegt im Verlauf darunter, ytx-Navigation sichtbar.
- **Selektoren** aus `src/registry/*/targets.js` und `anchors.js`: gemeldet wird einer, der mindestens drei Nächte in Folge traf und jetzt auf keiner Seite mehr.
- **Umbau der Originalseite**: Liste der eigenen Elemente (`ytm-*`, `ytmusic-*`, `yt-*` …) je Seite. Fehlen 8 oder mehr, die drei Nächte in Folge da waren, gilt das als großer Umbau. Weniger steht nur als Hinweis im Bericht.

YouTube testet ständig Varianten (zwei Player-Versionen gleichzeitig, wechselnde Elemente). Deshalb zählen nur Dinge, die mehrere Nächte stabil waren. Nach dem ersten Einrichten meldet der Lauf drei Nächte lang noch keine Umbauten.

Abgemeldet heißt: Alles, was nur mit Konto auftritt (Music-Leiste angemeldet, Premium), sieht nur das Prüfskript am Handy.

## Einrichtung auf dem Mini-PC (VM `ai-dev`)

Stand und Orte:

- Chromium aus Debian (`/usr/bin/chromium`), Node 20.
- `~/ytx-nightly/repo`: Klon von GitHub (öffentlich lesbar, kein Schlüssel nötig). `run.sh` holt vor jedem Lauf den neuesten Stand von `main`. Geprüft wird also das, was committet und gepusht ist.
- `~/ytx-nightly/run.sh`: Kopie von `tools/nightly/run.sh`.
- `~/ytx-nightly/state.json`: Stand der letzten Nächte. Löschen setzt den Vergleich zurück.
- `~/ytx-nightly/reports/<datum>/report.md` mit Screenshots, 30 Tage aufbewahrt.
- `~/ytx-nightly/ntfy.env` (Rechte 600): `NTFY_URL`, `NTFY_TOPIC`, `NTFY_TOKEN`. Inhalt nie ins Repo.
- cron von `jakob`: `0 4 * * * $HOME/ytx-nightly/run.sh >> $HOME/ytx-nightly/cron.log 2>&1`

Von Hand starten (in Git Bash am Laptop):

```bash
ssh ai-dev '~/ytx-nightly/run.sh'
```

Letzten Bericht ansehen:

```bash
ssh ai-dev 'cat ~/ytx-nightly/reports/$(ls ~/ytx-nightly/reports | tail -1)/report.md'
```

## Neue Prüfungen ergänzen

- Weitere Seiten: Eintrag in `SITES` in `tools/nightly.mjs`, optional mit `expect`.
- Neue Zustände aus der Seite: in `report()` in `src/behaviors/appCheck.js` ergänzen. Dann nutzen sie beide Werkzeuge.
- Die Chrome-Kennung in `tools/nightly.mjs` entspricht der der App (`MainActivity.CHROME_UA`). Beide zusammen anheben.
