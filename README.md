# ytx – YouTube & YouTube Music anpassen

Ein Userscript für YouTube am Rechner, **YouTube auf dem Handy** (`m.youtube.com`) und YouTube Music. Elemente anzeigen, dimmen, einklappen oder ausblenden, eigenes Theme, Layout-Presets, Verhalten, Filter und Zusatzfunktionen. Auf YouTube Music kommen dazu ein lokaler Hörverlauf mit Geschmacksprofil, Favoriten, erklärbare Empfehlungen („Für dich“, „Neu von deinen Künstlern“, Genre-Finder, Smart Radio), Smart Queue, Songtext kopieren und eine private Statistik.

Beide Seiten laufen auf demselben ytx-Kern (Panel, Profile, Navigation, Diagnose, Mount, Features). Nur Registry und Features sind pro Seite getrennt.

Rein clientseitig: kein Server. Deine Musikdaten bleiben im Browser (IndexedDB). Externe Dienste (MusicBrainz, Last.fm, Ollama) sind optional und standardmäßig aus.

Mehr Hintergrund: [docs/ARCHITEKTUR.md](docs/ARCHITEKTUR.md) (Entscheidungen, Spike-Ergebnisse, Testanleitung mit Login).

---

## Installation

### Chrome / Brave / Edge + Tampermonkey (empfohlen)

1. [Tampermonkey](https://www.tampermonkey.net/) installieren.
2. `chrome://extensions` (Brave: `brave://extensions`) → oben rechts **Entwicklermodus** an → bei Tampermonkey **Details** → **„Nutzerskripts zulassen“** an, falls vorhanden.
3. **[ytx installieren](https://raw.githubusercontent.com/jakobus744/youtube_plugin/main/dist/ytx.user.js)** – Tampermonkey öffnet die Installationsseite → **Installieren** bzw. bei einem Update **Aktualisieren**.
4. YouTube oder YouTube Music neu laden. Oben rechts erscheint **ytx** (Panel, Alt+Y). Auf Music zusätzlich **Mix** (Alt+M).

Ab Version 0.2.0 fragt Tampermonkey einmal nach der neuen Seite `music.youtube.com` und nach Verbindungen zu `musicbrainz.org`, `ws.audioscrobbler.com` und `localhost`. Die Verbindungen werden nur genutzt, wenn du die jeweilige Metadaten-Quelle im Panel selbst einschaltest.

Updates holt Tampermonkey automatisch (Dashboard → „Nach Updates suchen“ geht sofort).

Startprofil ist **„Aufgeräumt“**. **„YouTube (Original)“** schaltet auf beiden Seiten alles ab (Notausgang). Bestehende Profile aus 0.1.x werden automatisch übernommen und bekommen den Music-Teil der Vorlage dazu.

### Entwicklungsvariante

1. `npm install && npm run build`, dann `dist/ytx.dev.user.js` installieren (lokal erzeugt, nicht im Repo). Es lädt `dist/ytx.user.js` per `@require file:///…`. Die normale Version vorher deaktivieren.
2. `chrome://extensions` → Tampermonkey → Details → **„Zugriff auf Datei-URLs zulassen“**.
3. `npm run dev`, speichern, Seite neu laden.

### Android: eigene ytx-App

Eine richtige App mit zwei Icons, **ytx** (YouTube) und **ytx Music**, ohne Firefox und ohne Browserleiste. Drin steckt die Firefox-Engine (GeckoView), ytx ist fest eingebaut.

**Installieren**
1. Am Rechner `npm run apk` ausführen. Die fertige Datei liegt in `android/apk/ytx-<version>.apk` (nicht im Git, rund 95 MB).
2. Die APK aufs Handy bringen, z. B. über den Nextcloud-Ordner, und antippen. Beim ersten Mal fragt Android, ob die Nextcloud- oder Dateien-App Apps installieren darf: erlauben.
3. **ytx** öffnen, bei YouTube anmelden (Tab „Mein YouTube“). **ytx Music** nutzt dieselbe Anmeldung.

**Was die App kann**
- Zwei getrennte Einträge in der App-Übersicht, YouTube und Music laufen nebeneinander.
- Lange auf das Icon drücken: **Abos**, **Später ansehen**, **ytx Music**.
- YouTube-Links aus anderen Apps (WhatsApp, Teilen-Menü) öffnen sich in ytx. Fremde Links gehen an den normalen Browser.
- Statusleiste in der Farbe der Seite, also auch im ytx-Theme. Vollbild bei Videos, Zurück-Taste, Teilen über das Android-Menü.
- Profile, Einstellungen und Verlauf gelten gemeinsam für YouTube und Music in der App (getrennt von Firefox).

**Updates**
- **ytx selbst** aktualisiert sich wie bei Violentmonkey: Die App schaut alle 6 Stunden nach einer neueren `dist/ytx.user.js` auf GitHub und lädt sie. Sie gilt ab dem nächsten Seitenwechsel.
- **Die App** (Engine, Icons) braucht nur bei Änderungen am `android`-Ordner eine neue APK. Einfach drüber installieren, die Daten bleiben. Immer auf demselben Rechner bauen, denn die App ist mit dessen Schlüssel signiert.

**Technik**: `android/app/src/main/assets/ytx/` ist eine eingebaute Erweiterung. Sie stellt die GM-Funktionen bereit (Speicher, Live-Abgleich, Anfragen, Zwischenablage) und entfernt auf YouTube die Content-Security-Policy, weil ytx sonst nicht in die Seite darf. Bauen braucht Android SDK und JDK 17, Build-Dateien landen in `%LOCALAPPDATA%/ytx-android-build`, nicht in Nextcloud.

### Android: Firefox + Violentmonkey

1. **Firefox** aus dem Play Store installieren.
2. In Firefox: Menü ⋮ → **Erweiterungen** → **Violentmonkey** hinzufügen (Tampermonkey geht auch, Violentmonkey ist kleiner und quelloffen).
3. Den **[ytx-Link](https://raw.githubusercontent.com/jakobus744/youtube_plugin/main/dist/ytx.user.js)** in Firefox öffnen → Violentmonkey zeigt die Installationsseite → **Installieren**.
4. **m.youtube.com** öffnen und anmelden. Oben erscheinen **ytx** (Panel) und **⏱** (Schauzeit heute).
5. Für ein App-Gefühl: Menü ⋮ → **Zum Startbildschirm hinzufügen**. Das Icon öffnet YouTube direkt.

Auf dem Handy ist das Panel ein Blatt von unten, die Bedienelemente sind größer. Auf YouTube Music führen die Chips auf der Startseite zu den Mixen.

Mobil gibt es: Ausblenden (Shorts-Tab, Shorts-Regale, Werbung, Empfehlungen, Kommentar-Vorschau …), Themes und Farben, Filter (Kanäle, Stichwörter, Shorts, Dauer, Alter), Abo-Gruppen, Schauzeit mit Tageslimit, Shorts-Umleitung. Profile und Daten liegen pro Gerät, zum Übertragen **Profile › Export/Import** nutzen.

---

## Bedienung

| Kürzel | Seite | Aktion |
|---|---|---|
| Alt+Y | beide | Panel öffnen/schließen |
| Alt+P | beide | Nächstes Profil |
| Alt+T / Alt+Q / Alt+L | YouTube | Transkript kopieren / Stelle zitieren / Link an Stelle |
| Alt+M | Music | Mix-Fenster |
| Alt+F | Music | Aktuellen Song favorisieren |
| Alt+L | Music | Songtext kopieren |

Kürzel lassen sich unter **Profile › Tastenkürzel** ändern.

Panel-Tabs YouTube: **Anzeige · Look · Layout · Verhalten · Filter · Features · Abo-Gruppen · Schauzeit · Profile · Diagnose**
Panel-Tabs mobil: **Anzeige · Look · Verhalten · Filter · Features · Abo-Gruppen · Schauzeit · Profile · Diagnose**
Panel-Tabs Music: **Anzeige · Look · Layout · Verhalten · Features · Musik · Verlauf & Daten · Statistik · Profile · Diagnose**

Profile gelten für beide Seiten (jede Seite hat ihren eigenen Abschnitt). Sind YouTube und Music gleichzeitig offen, gleichen sich die Tabs live ab. Im **Look**-Tab lässt sich der Style der anderen Seite übernehmen oder dauerhaft koppeln.

Das Panel lässt sich an der Kopfzeile verschieben (Doppelklick = zurück), unten rechts in der Größe ändern und bleibt immer im sichtbaren Bereich.

Musik-Vorlieben, Blocklisten, Verlauf und Favoriten sind profilunabhängig: dein Geschmack gehört zu dir, nicht zum Look-Profil.

---

## YouTube Music in 60 Sekunden

- **★ in der Playerleiste**: Song, Künstler oder Album favorisieren, „Mehr/Weniger davon“, Song ignorieren, Künstler blockieren. Auf Künstler-, Album- und Playlist-Seiten gibt es einen eigenen ★-Button.
- **Mix-Fenster** (über ⋯ › Alle Mixe, Panel › Musik oder Alt+M): Für dich · Neu · Genre · Lange nicht gehört · Noch nie gehört · Ähnlich · Mehr von · Smart Radio · Reihenfolge. Regler **Bekannt ⟷ Entdecken**, Session-Preset (Fokus, Gym, Abends, Entdecken, Nur bekannte Musik). Jeder Tab ist ein eigener Mix, eine Zeile „Berücksichtigt: …“ sagt, was gerade einfließt. „Für dich“ nimmt auf Wunsch zwei deiner Lieblingsgenres mit. Jede Zeile zeigt, warum sie da ist, und hat ⋯ für Feedback. **„▶ Alles abspielen“** spielt den Mix in ytx-eigener Reihenfolge.
- **Startseite**: eigene Chips oben (Für dich, Noch nie gehört, Lange nicht gehört, Neu mit Zähler und deine Lieblingsgenres, „+ Genre“ öffnet direkt darunter eine Auswahl mit passenden Vorschlägen zu deinen Genres, freier Eingabe und × zum Entfernen) statt YouTubes Stimmungs-Chips. Darunter das Regal zum gewählten Chip. Nochmal auf den Chip tippen oder ↻ mischt neu (jedes dritte Mal mit anderen Startkünstlern), ▶ spielt alles, ⋯ hat „Mehr Neues“, YouTube-Vorschläge wechseln und das Mix-Fenster. Ein eigener Mix-Knopf oben rechts lässt sich unter Features › Mix einschalten, YouTubes Chips ebenso.
- **Neu von deinen Künstlern**: Neuerscheinungen deiner ★-Künstler und von Künstlern, die du oft zu Ende hörst oder geliked hast. Ein Song, der nur einmal im Autoplay lief, reicht nicht.
- **Mediathek**: Regal **„Deine Favoriten (ytx)“** mit allen ★-Künstlern, -Songs, -Alben und -Playlists, filterbar, Lieblingssongs direkt abspielbar. Die Reiter Mediathek/Downloads scrollen mit weg, statt über dem Inhalt zu kleben.
- **Genres**: feste Auswahl mit Techno-, Hardstyle- und Hip-Hop-Varianten plus freie Eingabe.
- **Warteschlange**: Gesamt- und Restdauer, dezente Markierungen für blockierte (z. B. „remix“ aus der Blockliste), oft übersprungene und doppelte Titel, optional Auto-Skip (Tab **Musik**).
- **Songtext**: Button „Songtext kopieren“ über dem Text.
- **Verlauf & Daten**: Pausieren, Einträge löschen, Künstler/Songs vom Profil ausschließen, Aufbewahrungsdauer, Export/Import als JSON.
- **Statistik**: Hörzeit, Top-Songs/-Künstler/-Alben, Skip-Quote, Wochen/Monate, Tageszeit, Wochentag, als Text kopierbar.
- **Wochenrückblick**: ab Montag einmal pro Woche eine Karte mit Hörzeit, Top-Künstlern, Top-Songs und neu entdeckten Künstlern der letzten Woche, jederzeit im Tab Statistik.

## YouTube: Abo-Gruppen und Schauzeit

- **Abo-Gruppen**: Gruppen wie „Tech“ oder „Musik“ im Tab **Abo-Gruppen** anlegen und Kanäle zuordnen, oder auf jeder Kanalseite über den Button **Gruppen**. Über dem Abo-Feed filtert eine Chip-Leiste nach Gruppe, dazu „Ohne Gruppe“.
- **Schauzeit**: misst lokal, wie lange Videos wirklich laufen (Werbung und Pausen zählen nicht). „Heute: …“ oben rechts, Tageslimit mit sanfter Erinnerung (Standard 2 h, nach dem Limit alle 15 min), Pausen-Hinweis nach 60 min am Stück. Nichts wird blockiert, außer du schaltest „Beim Tageslimit Video anhalten“ ein. Statistik und alle Einstellungen (Limit, Erinnerungen, Shorts, Aufbewahrung) im Tab **Schauzeit**.

---

## Architektur (Kurzfassung)

```
ytx-Kern     core/ (store, config, nav, observer, mount, diagnose, idb, pageData …)
             appliers/ (display, vars, layout, behavior, filters, features, tagger)
             panel/ (aus Registry + Manifesten generiert)
sites/       youtube.js · music.js   → bündeln alles Seitenspezifische
registry/    youtube/ · music/       → einzige Orte für Selektoren, Datenpfade, Parser
behaviors/   youtube.js · music.js
features/    youtube/ · music/       → Module mit Manifest + setup(ctx)
profiles/    youtube.js · music.js · index.js (gemeinsame Vorlagen)
```

Config pro Profil (Schema 3): `{ schema, youtube: { display, vars, layout, behavior, filters, features }, music: { display, vars, layout, behavior, features } }`. Der Kern kennt keine Selektoren, nur IDs. Nach einem Update von YouTube wird nur die Registry der betroffenen Seite angepasst.

Details, Datenfluss, Datenschutz und Spike-Ergebnisse: [docs/ARCHITEKTUR.md](docs/ARCHITEKTUR.md).

### Nach einem Update von YouTube

1. Panel → **Diagnose** → „Nur Probleme zeigen“. Rot/gelb zeigt Target, Anker, Datenquelle oder Feature.
2. „Bericht kopieren“ liefert eine Textzusammenfassung.
3. `src/registry/<seite>/…` anpassen (Arrays = Fallbacks). Für Music-Parser: `node tools/music-fixtures.mjs` lädt frische Testdaten, `npm test` zeigt, was bricht.

---

## Dateistruktur

```
ytx/
├── build.mjs                    esbuild → dist/, Userscript-Header (@match beide Seiten)
├── package.json                 build · dev · test · serve
├── dist/ytx.user.js             installierbares Userscript (+ ytx.min.js, ytx.dev.user.js)
├── docs/ARCHITEKTUR.md          Entscheidungen, Spikes, Testanleitung
├── src/
│   ├── main.js                  Start, wählt die Site, Debug-API window.__ytx
│   ├── core/
│   │   ├── site.js              youtube | music aus dem Hostnamen
│   │   ├── store.js · config.js Profile (Schema 3), Migrationen, Buckets
│   │   ├── nav.js               Seitentyp und Titel über site, SPA-Events + History-API
│   │   ├── idb.js               IndexedDB mit versionierten Migrationen
│   │   ├── pageData.js          gedrosselter Seitenlader mit Cache
│   │   ├── bridge.js · mount.js · observer.js · diagnose.js · hotkeys.js
│   │   └── css.js · dom.js · format.js · clipboard.js · log.js · lifecycle.js · scheduler.js
│   ├── sites/                   index.js · youtube.js · music.js · mobile.js
│   ├── registry/
│   │   ├── shared.js            Modi, Attributnamen
│   │   ├── youtube/             targets (63) · anchors · tags · paths · look · presets · pages
│   │   ├── mobile/              targets (21) · anchors · tags · look (Farberkennung) · paths (Kacheln aus dem DOM)
│   │   └── music/               targets (33) · anchors · tags · look · presets · pages
│   │                            player.js (Store, Player-API, Queue, Songtext, Navigation)
│   │                            parse.js · initialData.js (Seitendaten sprachunabhängig)
│   ├── appliers/                display · vars · hashTokens · layout · behavior · filters · filterLogic · features · tagger
│   ├── behaviors/               youtube.js · music.js
│   ├── features/
│   │   ├── ui.js                gemeinsame Buttons, Menü, Toast
│   │   ├── youtube/             transcript/ · playlist/ · watchExtras · cardExtras · index
│   │   └── music/
│   │       ├── index.js         Manifeste
│   │       ├── runtime.js       gemeinsamer Zustand: Vorlieben, Verlauf, Favoriten, Feedback, Profil
│   │       ├── engine.js        Mixe und Neuerscheinungs-Check
│   │       ├── mixes.js · ytxQueue.js · ui.js · diagnose.js
│   │       ├── history.js · favorites.js · releases.js · hub.js · player.js
│   │       ├── data/            db (Schema + Migrationen) · prefs · catalog
│   │       ├── logic/           tracker · taste · recommend · rules · versions · sessions · queue · stats · lyrics
│   │       └── metadataProviders/  index · local · musicbrainz · lastfm · ollama · http
│   ├── profiles/                youtube.js · music.js · index.js
│   └── panel/                   index · tabs · musicTabs · controls · styles
├── tests/                       58 Tests + fixtures/music (echte Seitendaten)
└── tools/                       serve.mjs (Test-Handoff) · music-fixtures.mjs
```

## Entwickeln

```bash
npm install
npm run build
npm run dev
npm test
```

Neue Version: `version` in `package.json` erhöhen, `npm run build`, `dist/` mit committen.

`window.__ytx` in der Konsole: `diagnose()`, `store`, `nav`, `feature(id)`, `panel`, `log()`, `destroy()`. Auf Music zusätzlich `debug` mit `music`, `catalog`, `buildMix`, `checkReleases`, `ytxQueue`.

---

## Feature-Status

Getestet im eingebauten Chromium **ohne Anmeldung**, stumm geschaltet, Stand 15.09.2026.

### YouTube

| Bereich | Funktion | Status |
|---|---|---|
| Anzeige | 63 Targets, Normal/Dimmen/Einklappen/Aus, Trefferzahl | ✅ |
| Look | 6 Themes, Einzelfarben inkl. Suchleiste und Kacheltext, Dichte, Typografie | ✅ |
| Layout | Kompakt, Liste, Nur Text, Classic, Kino, Fokus, Breite Liste, Button-Reihenfolge, Kopfzeile | ✅ |
| Verhalten | Shorts → Video, Startseite umleiten, Autoplay aus, Experiment-Flags | ✅ |
| Verhalten | Qualität, Geschwindigkeit, Pause im Hintergrund, Kanal-Trailer | ⚠️ ungetestet |
| Filter | Kanal, Positivliste, Stichwort, Regex, Shorts, Live, Dauer, Alter | ✅ · Gesehen ⚠️ Login |
| Transkript | 5 Formate, Spurwahl, Kapitel, Zitieren, Eintrag im Drei-Punkte-Menü jeder Videokachel und der Playlist neben dem Video (öffnet das Video und kopiert) | ✅ · Panel-Fallback ⚠️ |
| Playlist | Dauer gesamt/übrig, Sortieren, Suche nach Titel/Kanal (Seite + Panel neben dem Video) | ✅ · Später ansehen, gesehene dimmen ⚠️ Login |
| Video | Endzeit, Datum, Kopieren-Menü, Proxy-Buttons | ✅ |
| Mobil (m.youtube.com) | Start, Farberkennung, Themes, 21 Ausblend-Ziele, Kanal-/Shorts-Filter, Panel als Blatt, Gruppen-Button auf der Kanalseite, Schauzeit-Erkennung | ✅ in Handy-Emulation (Chromium), ⚠️ Firefox Android selbst und Login ungetestet |
| Abo-Gruppen | Gruppen anlegen, Zuordnen auf der Kanalseite und im Panel | ✅ · Filterleiste im Abo-Feed ⚠️ braucht Login, nur Logik getestet |
| Schauzeit | Messen, Zwischenspeichern, Heute-Anzeige, Tageslimit-Karte, Statistik-Tab | ✅ mit simuliertem Abspielen (Testfenster spielt nicht wirklich ab) |
| 0.2.0-Umbau | Start, Anzeige-Regeln, alle 8 Panel-Tabs, Diagnose ohne Fehler | ✅ Regression Startseite; Videoseite nach dem Umbau nicht erneut live geprüft |

### YouTube Music

| Bereich | Funktion | Status |
|---|---|---|
| Kern | Site-Erkennung, Seitentypen (auch `/@handle`, Alben unter `/playlist?list=OLAK…`), SPA ohne Reload | ✅ |
| Anzeige | 33 Targets: Samples, Upgrade, Premium-Hinweise, Podcast-Chip/-Regale, Video-/Playlist-Regale, Player-Tabs, Playerleiste | ✅ Chip, Regale, Tabs · Samples/Upgrade ⚠️ nur mit Login sichtbar |
| Look | 7 Themes, Einzelfarben über `--ytmusic-*`, Playerleiste, Fortschritt, Kacheln, Songtextgröße | ✅ Regeln · visuell nicht per Screenshot geprüft |
| Layout | Kompakt, Listen statt Karussells, Songtext groß, Warteschlange breit, Kopfzeile ausblenden | ✅ Panel · visuell ⚠️ |
| Verhalten | „Noch da?“ bestätigen, Premium-Dialoge schließen, Startseite umleiten | ⚠️ Dialoge im Test nicht aufgetreten |
| Hörverlauf | Dauer, Prozent, komplett, Skip + Zeitpunkt, Wiederholung, Like, Kontext, Werbung ausgenommen | ✅ echte Wiedergabe + Unit-Tests |
| Profil | Gewichte, früher Skip stärker, Halbwertszeit, Ausschlüsse | ✅ Unit-Tests |
| Favoriten | ★ Playerleiste (Song/Künstler/Album), ★ Künstler/Album/Playlist-Seite, Gewicht, Regal in der Mediathek | ✅ (Mediathek ohne Login geprüft) |
| Neuerscheinungen | gedrosselter Hintergrund-Check, „neu“ vs. „dieses Jahr“, Startseiten-Regal, Badge | ✅ |
| Mix-Fenster | Für dich, Genre (Deutschrap getestet), Smart Radio, Begründungen, Feedback-Menü, Zeile „Berücksichtigt“ | ✅ |
| Startseiten-Chips | eigene Chips inkl. Lieblingsgenres, YouTube-Chips ausgeblendet | ✅ |
| Mix-Fenster | Lange nicht gehört, Noch nie gehört, Ähnlich, Mehr von | ✅ Logik · mit echten Langzeitdaten ungetestet |
| ytx-Reihenfolge | eigener Mix abspielen, Sprung am Songende, pausiert bei manueller Wahl | ✅ |
| Smart Queue | Markierungen, Auto-Skip (blockierter Künstler getestet), Schutz gegen Sprungketten | ✅ |
| Warteschlange | Gesamt-/Restdauer, Endzeit | ✅ 50 Titel |
| Songtext | kopieren (Text, mit Titel, LRC), Tab wird bei Bedarf geöffnet | ✅ · Zeitstempel ⚠️ Web liefert keine |
| Audio | Audiofassung bevorzugen, Equalizer | ⚠️ experimentell, ungetestet |
| Daten | IndexedDB v2 mit Migrationen, Reload-Persistenz, Export/Import, Cache | ✅ |
| Statistik | Rückblick, Tops, Verlauf, Tageszeit, Wochentag, Text-Export | ✅ |
| Wochenrückblick | Karte ab Montag, neu entdeckte Künstler, Button im Statistik-Tab | ✅ mit Testdaten |
| Metadaten | Lokal · MusicBrainz/Last.fm/Ollama als optionale Quellen | ✅ lokal · extern ⚠️ ungetestet |
| Diagnose | Seite, Song, Datenquellen, Anker, Queue, Songtext, IDB, Cache, Künstler-Check, Fehler | ✅ |

---

## Bekannte Einschränkungen

**YouTube Music**

- **Warteschlange lässt sich nicht umbauen.** Ohne interne API gibt es keinen stabilen Weg, Titel einzufügen. ytx überspringt deshalb (Auto-Skip) oder spielt Mixe in einer eigenen Reihenfolge und startet am Ende jedes Songs den nächsten.
- **Zeitgestempelte Songtexte** liefert die Web-App nicht (nur die Mobil-Apps). Das Format „Mit Zeitstempeln“ ist vorbereitet und greift automatisch, falls es auftaucht.
- **Genre-Unterseiten** lassen sich nicht per URL laden. Der Genre-Finder nutzt deshalb die normale Suche plus redaktionelle Playlists.
- **Keine Genre-Angabe pro Künstler** bei YouTube Music. „Genre: …“ bezieht sich auf die Quelle (Suche/Playlist). Genres pro Künstler nur über optionale externe Quellen.
- **Werbung** (ohne Premium) pausiert die Erfassung. Werbung zählt nicht als gehört.
- **Neuerscheinungen** kommen von der Künstlerseite (Regal „Alben/Singles“). Nur Jahr, kein exaktes Datum. Beim ersten Check eines Künstlers gilt alles als bekannt, danach Neues als „neu“.
- **Equalizer** leitet den Ton durch Web Audio. Einmal aktiviert bleibt das Element bis zum Neuladen daran gebunden (beim Ausschalten neutral).
- **Hintergrund-Seitenabrufe**: höchstens 12 neue pro Mix (einstellbar), 2 s Abstand, Ergebnisse 12 h–7 Tage im Cache.

**YouTube**

- Transkript braucht die Token-URL des Players (nach Pre-Roll-Werbung). Freie Zonen, Dislike-Zahlen und Größe der Player-Steuerleiste bewusst nicht umgesetzt. Sortierung nur als Anzeige.

**Allgemein**

- Kein Einbau in die offizielle YouTube-App, keine Embeds. Handy über Firefox + Violentmonkey (siehe Installation).
- Speicher pro Browser. Kein Sync (Export/Import nutzen).
- Mit Login, in Tampermonkey selbst und in Firefox nicht getestet. Testanleitung: [docs/ARCHITEKTUR.md](docs/ARCHITEKTUR.md#test-mit-eingeloggtem-konto).
