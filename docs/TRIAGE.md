# Neue YouTube-Bausteine einordnen

Der Nachtlauf (`docs/NIGHTLY.md`) und ytx selbst finden Bausteine, die YouTube neu ausliefert. Jeder davon braucht eine Entscheidung: harmlos, Werbung oder neues Regal. Diese Seite beschreibt den Ablauf heute (Mensch entscheidet) und den Plan für später (KI auf dem Mini-PC entscheidet und bereitet die Änderung vor).

## Wo die Aufgaben liegen

Empfehlung und Stand: **eine Liste auf dem Mini-PC** ist die Quelle. GitHub-Issues höchstens später als Spiegel.

- Die Liste funktioniert ohne Konto, Token und Internetdienst. Die Zentrale auf dem Mini-PC kann sie direkt anzeigen.
- Das Repo ist öffentlich, Issues wären es auch. Inhaltlich wäre das unkritisch, es sind nur YouTube-Seitenteile. Viele kleine „harmlos“-Fälle würden dort aber nur rauschen.
- Später sinnvoll: nur Fälle mit Codeänderung (Werbung, Regal) als Pull Request auf GitHub. Der PR ist dann die Aufgabe, ein eigenes Issue braucht es nicht.

Dateien auf `ai-dev` (neben `state.json`):

- `~/ytx-nightly/tasks.json`: maschinenlesbar, Format unten.
- `~/ytx-nightly/tasks.md`: dieselbe Liste zum Lesen, nach Status gruppiert.

Bilder liegen im Bericht der Nacht (`~/ytx-nightly/reports/<datum>/`).

## Status

| Status | Bedeutung | Was danach passiert |
|---|---|---|
| `offen` | neu, noch nicht angesehen | einordnen |
| `harmlos` | normales Seitenteil, z. B. neuer Knopf | in `src/registry/knownTypes.js` eintragen |
| `werbung` | Werbeform oder Promo | Ausblend-Regel in `src/registry/*/targets.js`, dann eintragen |
| `regal` | neues Regal oder neuer Seitenbereich | prüfen, ob eine Regel oder Funktion nötig ist, dann eintragen |
| `unklar` | nicht zu entscheiden | Jakob fragen |
| `erledigt` | steht in der Bekannt-Liste | setzt der Nachtlauf selbst, sobald der Eintrag auf `main` ist |

Regel: Ein Baustein kommt erst in die Bekannt-Liste, wenn er fertig behandelt ist. Bei Werbung also erst, wenn die Regel da ist. So schließt der Eintrag die Aufgabe.

### Woran man es erkennt

- **Werbung:** Name enthält `ad`, `promo`, `promoted`, `sponsor`, `companion`, `upsell`, `offer`. Oder das Bild zeigt „Anzeige“, „Gesponsert“, einen Kauf- oder Installierknopf.
- **Regal:** liegt in `richSectionRenderer`, `itemSectionRenderer` oder `sectionListRenderer` und enthält eine eigene Überschrift oder Kachelreihe (Beispiel: Playables in `richShelfRenderer`).
- **Harmlos:** Teil eines bekannten Bausteins (Knopf, Abzeichen, Overlay, Text), kein eigener Bereich auf der Seite.
- **Unklar:** kein Bild und der Name verrät nichts. Oder er taucht nur angemeldet auf.

## Ablauf heute, ohne KI

1. Meldung per ntfy „neue Bausteine bei YouTube“ oder Hinweis im Bericht.
2. Liste ansehen (Git Bash am Laptop):

```bash
ssh ai-dev 'cat ~/ytx-nightly/tasks.md'
```

3. Einordnen, entweder selbst oder in einer Claude-Sitzung („ordne die offenen ytx-Aufgaben ein“):

```bash
ssh ai-dev 'cd ~/ytx-nightly/repo && node tools/triage.mjs set miniGameCardViewModel regal "Spiele-Regal, Regel mb.games greift"'
```

4. Umsetzen im Repo am Laptop:
   - harmlose Bausteine übernehmen:

```bash
ssh ai-dev 'cd ~/ytx-nightly/repo && node tools/triage.mjs export' > check-out/harmlos.json
```

```bash
node tools/known-types.mjs check-out/harmlos.json
```

   - bei Werbung oder Regal zuerst die Regel bauen, dann eintragen.
5. Commit und Push. In der nächsten Nacht setzt der Lauf die Aufgaben auf `erledigt`.

Funde vom Handy (angemeldet) kommen so in dieselbe Liste:

```bash
scp check-out/<zeit>/types.json ai-dev:/tmp/handy-types.json
```

```bash
ssh ai-dev 'cd ~/ytx-nightly/repo && node tools/triage.mjs import /tmp/handy-types.json'
```

Befehle von `tools/triage.mjs`: `list [--all]`, `set <baustein> <status> [notiz] [--by name]`, `export [datei]`, `import <types.json> [--from handy]`. Ohne `--tasks` nimmt es `~/ytx-nightly/tasks.json`, wenn vorhanden.

## Datenformat `tasks.json`

```json
{ "version": 1, "tasks": [ {
  "id": "mobile:miniGameCardViewModel", "site": "mobile", "type": "miniGameCardViewModel",
  "parent": "richShelfRenderer", "pages": ["m-home"], "url": "https://m.youtube.com/",
  "first": "2026-11-20", "last": "2026-11-22", "seen": 3,
  "shot": "2026-11-20/m-home-miniGameCardViewModel.png", "source": "nachtlauf",
  "status": "offen", "note": "", "decided": null, "by": null
} ] }
```

`site` ist `youtube`, `mobile` oder `music` (wie in `knownTypes.js`). `by` ist, wer entschieden hat (`jakob`, `claude`, `knownTypes`). Das Format bleibt stabil, damit die Zentrale es später anzeigen kann. Logik in `tools/lib/tasks.mjs`.

## Plan für später: KI auf dem Mini-PC (nicht gebaut)

Erst angehen, wenn die Zentrale auf dem Mini-PC (ai-router, Agentenrollen) weiter ist. Bis dahin bleibt alles wie oben.

**Ablauf**

1. Nach dem Nachtlauf: Gibt es Aufgaben mit Status `offen`, startet ein Agent (Claude Code ohne Bildschirm, `claude -p`) im Repo auf ai-dev.
2. Er arbeitet in einem eigenen Arbeitsordner (git worktree) auf einem Branch `triage/<datum>`, nie auf `main`.
3. Je Aufgabe: Bild, Elternbaustein und Seite ansehen, nach den Regeln oben einordnen, mit `tools/triage.mjs set ... --by claude` festhalten.
   - harmlos: in `knownTypes.js` eintragen.
   - Werbung oder Regal: Regel in `src/registry/*/targets.js` (bei Bedarf Tagger in `tags.js`) bauen, Test ergänzen, eintragen.
   - unklar: nichts ändern, Notiz schreiben.
4. Prüfen: `node build.mjs`, `node --test tests/*.test.mjs`, dann der Nachtlauf mit dem Branch in einer Kopie (`--no-notify`, eigene state). Das neue Element muss weg sein, sonst nichts kaputt.
5. Ergebnis: Pull Request mit Begründung je Baustein und Vorher-Nachher-Bild. Danach eine ntfy-Meldung „ytx: Vorschlag bereit“. Bei `unklar`: Meldung mit Frage.
6. Jakob prüft und merged. Danach schließt der nächste Nachtlauf die Aufgaben.

**Grenzen für den Agenten**

- Nur diese Dateien ändern: `src/registry/**`, `tests/**`, `dist/**` (Build), `docs/TRIAGE.md`. Keine Änderung an `tools/nightly*`, `android/`, Secrets.
- Nie auf `main` pushen, nie mergen, keine Force-Pushes.
- Höchstens ein Lauf pro Nacht, mit fester Obergrenze an Schritten und Kosten.
- Kein Zugriff auf `ntfy.env` außer über das Meldeskript.

**Voraussetzungen, bevor es gebaut wird**

- Jakob erlaubt ausdrücklich, dass der Agent auf eigenen Branches committet und PRs anlegt. Bisher gilt „nur Jakob committet“.
- Claude Code auf ai-dev mit eigenem API-Schlüssel oder Abo-Zugang, gespeichert wie `ntfy.env` (Rechte 600, nie im Repo).
- GitHub-Token nur für dieses Repo, nur Inhalte und Pull Requests.
- Einbindung in die Zentrale: Aufgabenliste anzeigen, Lauf starten oder anhalten, Kosten sehen.
- Klären: ob die Zentrale den Agenten startet oder cron direkt nach `run.sh`.

**Offene Fragen**

- Funde vom Handy automatisch übernehmen (z. B. die App schickt sie an die Zentrale), statt per `scp`.
- Ob `harmlos` ganz ohne PR direkt eingetragen werden darf. Empfehlung: nein, auch das über den PR, weil sonst eine falsch eingeordnete Werbung unbemerkt bekannt wird.
