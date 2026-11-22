# Statistik für YouTube und Music

Plan vom 22.11.2026, mit Jakob abgestimmt. Stand der Umsetzung steht unten.

## Ziel

Einblick und Spaß („Wrapped“) und Gewohnheiten verstehen. Nicht: Selbstkontrolle (dafür gibt es Schauzeit und Tageslimit schon).

## Entscheidungen

| Frage | Entscheidung |
|---|---|
| Geräte | alle Geräte zusammen, über den Mini-PC |
| Ort | ytx-Panel (kompakt) und eigene Statistik-Seite (Vollbild in ytx) |
| Aufteilung | Startansicht „Medienzeit“ mit YouTube und Music zusammen, darunter je ein Detailbereich |
| Farben | feste Farbe je Genre/Kategorie, überall gleich. YouTube und Music je eine Grundfarbe |
| Antippen | Detailansicht für Künstler/YouTuber/Genre |
| Zeiträume | Woche, Monat (blätterbar), Jahr, gesamt, Vergleich mit dem Zeitraum davor |
| YouTube-Genres | YouTube-Kategorie des Videos, dazu die eigenen Abo-Gruppen als Themen |
| Music-Genres | MusicBrainz (frei, ohne Konto), nur Künstlernamen gehen raus, Ergebnis wird gespeichert |
| Aufbewahrung | jede Wiedergabe einzeln, für immer (wenige MB pro Jahr) |
| Extras | Rekorde und Meilensteine, Neu vs. bekannt |
| Reihenfolge | Grafiken und Zusammenführen parallel |

## Inhalte

**Medienzeit (YouTube + Music)**
- Zeit pro Tag/Woche/Monat als gestapelte Balken (YouTube, Music).
- Heatmap Wochentag × Stunde, umschaltbar YouTube, Music, beide.
- Vergleich zum Zeitraum davor: „+20 % Music, −1 h YouTube“.

**YouTube**
- Top-YouTuber mit Zeit, Anteil und Trend gegenüber dem Zeitraum davor (Aufsteiger, Absteiger).
- Kategorien und Abo-Gruppen als Anteile (Ring oder gestapelter Balken) und als Verlauf über Wochen.
- Verhalten: zu Ende geschaut, abgebrochen (bei welchem Anteil), Shorts-Anteil, Sitzungslänge am Stück.

**Music**
- Top-Künstler, Top-Songs, Top-Alben mit Trend.
- Genres als Anteile und Verlauf.
- Verhalten: übersprungen (Anteil, an welcher Stelle im Song), schnell übersprungen, Wiederholungen, Likes.

**Detailansicht** (Künstler, YouTuber, Genre)
- Zeit über die Zeit (Linie), typische Uhrzeit (kleine Heatmap), Lieblingssongs/-videos, erstes Mal gehört/gesehen, Link zur Künstler-/Kanalseite.

**Extras**
- Rekorde: längste Serie an Tagen, meistgehörter Tag, längste Sitzung, Meilensteine (100. Wiedergabe eines Künstlers, 1000 h gesamt).
- Neu vs. bekannt: Anteil neu entdeckter Künstler/Kanäle, neue pro Monat.

## Farben

- Grundfarben: YouTube und Music je eine, auch in gestapelten Balken.
- Genre-Gruppen (Music, aus `src/features/music/logic/genres.js`) und YouTube-Kategorien bekommen feste Farben aus einer Palette, die auf hellem und dunklem Hintergrund lesbar ist. Ein Genre hat überall dieselbe Farbe.
- Rangfolgen (Top-Listen) nutzen keine Regenbogenfarben, sondern Balken in der Grundfarbe.

## Daten

Heute vorhanden, je Gerät in IndexedDB:

- YouTube `ytx-youtube` / `views`: je Sitzung Video, Kanal, Video oder Short, Start, Ende, Laufzeit, gesehener Anteil.
- Music `plays`: je Wiedergabe Künstler, Album, Start, Hördauer, zu Ende, übersprungen (wo), Wiederholung, Like.

Neu in Phase 1:

- `device`: feste zufällige Geräte-ID je Browser/App (`src/core/device.js`), in jedem neuen Eintrag. Damit lassen sich Geräte zusammenführen, ohne doppelt zu zählen.
- YouTube `category`: Kategorie aus den Videodaten (`microformat.playerMicroformatRenderer.category`).
- Stunde und Wochentag werden beim Auswerten aus `startedAt` berechnet, nicht gespeichert.

## Zusammenführen über den Mini-PC

Empfohlener Weg, weil alle Teile schon da sind:

1. **Transport über die Nextcloud** (wie heute die Profile, `src/core/cloudSync.js`): Jede Seite (YouTube, m.youtube, Music) schreibt ihre Monate nach `ytx/history/<gerät>/<seite>-<jahr-monat>.json` (immer der laufende und der vorige Monat, ganze Datei neu). Beim Öffnen der Statistik werden alle anderen Dateien gelesen, nur geänderte (ETag) neu geladen und in IndexedDB `ytx-stats` zwischengespeichert. So sieht jedes Gerät alles, auch YouTube und Music auf demselben Gerät gegenseitig.
2. **Mini-PC als Arbeiter**: liest den Ordner, holt Genres von MusicBrainz (gedrosselt, Ergebnis zwischengespeichert), legt die YouTube-Kategorien je Kanal fest und schreibt `ytx/history/enriched.json` (Genres je Künstler, Kategorie je Kanal) zurück. Später zeigt die Zentrale daraus auch eine eigene Seite.
3. Fällt der Mini-PC aus, gehen keine Daten verloren. Es fehlen nur die Genres, bis er wieder läuft.

Vorteil: Kein neuer Server muss vom Handy erreichbar sein, Anmeldung und Tailscale-Weg der Nextcloud funktionieren schon. Offen: Aufbewahrung der YouTube-Schauzeit lokal (heute 365 Tage) bleibt, die Nextcloud hält alles.

## Phasen

**Phase 1, Grafiken (lokal, sofort nutzbar)**
1. Daten erweitern: `device`, YouTube `category`. Reine Auswertung `src/features/stats/logic.js` mit Tests (Zeit pro Tag, Heatmap, Rangfolgen mit Trend, Anteile, Verhalten, Rekorde, neu vs. bekannt).
2. Grafik-Bausteine als SVG ohne fremde Bibliotheken (`src/features/stats/charts.js`): gestapelte Balken, Heatmap, Anteilsbalken, Linie, Rangliste.
3. Statistik-Seite (Vollbild) und kompakter Panel-Tab, Zeitraum-Wahl, Detailansicht.
4. Prüfen am Handy und am PC.

**Phase 2, Zusammenführen (parallel)**
1. Export je Gerät nach Nextcloud, Lesen der anderen Geräte.
2. Arbeiter auf dem Mini-PC (Genres, Kategorien), cron wie der Nachtlauf.
3. Statistik nutzt die zusammengeführten Daten, zeigt auf Wunsch je Gerät.

## Stand

- 22.11.2026: Plan. Phase 1, Schritt 1 gebaut: Geräte-ID (`src/core/device.js`) in neuen YouTube- und Music-Einträgen, YouTube-Kategorie in neuen Sitzungen, Auswertung `src/features/stats/logic.js` mit Tests (`tests/stats.test.mjs`). Am Handy geprüft: Kategorie kommt an (englischer Name, z. B. „Film & Animation“, Übersetzung und Farben in Schritt 2), Skriptspeicher für die Geräte-ID vorhanden. Alte Einträge haben noch keine Kategorie und kein Gerät.
- 22.11.2026: Phase 1, Schritt 2 und 3 gebaut, Phase 2, Schritt 1 gebaut.
  - Farben `src/features/stats/colors.js`: YouTube rot, Music lila, feste Farbe je Kategorie (deutsch beschriftet), Music-Genres als Abstufungen ihrer Genre-Gruppe, „Sonstige“ grau, keine doppelten Farben in einer Liste.
  - Grafiken `src/features/stats/charts.js` (SVG): gestapelte Balken, Heatmap Wochentag × Stunde, Anteilsbalken, Rangliste mit Trend, Überspring-Verteilung, Stunden-Balken.
  - Seite `src/features/stats/view.js`: Panel-Tab „Medienzeit“ (alter Music-Tab heißt jetzt „Hörstatistik“) und Vollbild „⤢ Groß“. Woche/Monat/Jahr/Gesamt mit ‹ ›, Vergleich zum Zeitraum davor, Filter Alle/YouTube/Music, Rekorde, Neu entdeckt, Detailansicht je YouTuber/Künstler/Kategorie.
  - Transport `src/features/stats/data.js` und Verhalten „Statistik in Nextcloud teilen“ (`src/behaviors/statsSync.js`, an, höchstens alle 6 h, 60 s nach dem Laden).
  - Geprüft: Tests (89 grün), Build, APK. Oberfläche nur lokal mit Testdaten im Browser (alle Zeiträume, Vollbild, Detail). Nicht geprüft: am Handy und am PC mit echten Daten, echter Nextcloud-Abgleich.
- Nächster Schritt: Prüfen am Handy (Phase 1, Schritt 4), echten Nextcloud-Abgleich testen, dann Arbeiter auf dem Mini-PC (Phase 2, Schritt 2).
