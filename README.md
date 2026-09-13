# ytx – YouTube anpassen

Userscript für Desktop-YouTube. Elemente anzeigen/dimmen/einklappen/ausblenden, eigenes Theme, Layout-Presets, Verhalten (Shorts-Umleitung, Autoplay aus …), Filter und Zusatzfunktionen wie Transkript kopieren und Playlist-Dauer. Alles über ein Panel steuerbar, mehrere Profile, eingebaute Diagnose.

Rein clientseitig: kein Server, keine Fremddienste, keine eigenen API-Aufrufe an YouTube.

---

## Installation

### Chrome / Brave / Edge + Tampermonkey (empfohlen)

1. [Tampermonkey](https://www.tampermonkey.net/) installieren.
2. `chrome://extensions` (Brave: `brave://extensions`) → oben rechts **Entwicklermodus** an → bei Tampermonkey **Details** → **„Nutzerskripts zulassen“** an, falls vorhanden.
3. **[ytx installieren](https://raw.githubusercontent.com/jakobus744/youtube_plugin/main/dist/ytx.user.js)** – Tampermonkey öffnet die Installationsseite → **Installieren**.
4. YouTube neu laden. Oben rechts erscheint ein **ytx**-Button, alternativ **Alt+Y**.

Updates holt Tampermonkey automatisch über denselben Link (Dashboard → „Nach Updates suchen“ geht auch sofort).

Startprofil ist **„Aufgeräumt“**. Profil **„YouTube (Original)“** schaltet alles ab (Notausgang).

### Entwicklungsvariante (Änderungen ohne Neuinstallation)

1. `npm install && npm run build`, dann `dist/ytx.dev.user.js` installieren (wird lokal erzeugt, nicht im Repo). Es lädt `dist/ytx.user.js` per `@require file:///…`. Die normale Version vorher in Tampermonkey deaktivieren.
2. `chrome://extensions` → Tampermonkey → Details → **„Zugriff auf Datei-URLs zulassen“**.
3. `npm run dev` (esbuild watch), speichern, YouTube neu laden.

> Wird das Projekt verschoben, `npm run build` erneut ausführen – der Pfad im Dev-Script wird dabei neu erzeugt.

### Firefox + Violentmonkey (nicht getestet)

Script wie oben installieren. Das Script braucht Seitenkontext (`@inject-into page`). Falls YouTubes CSP das blockiert, meldet die Diagnose „Polymer-Daten lesbar: Fehler“ – dann funktionieren Anzeige/Look/Layout weiter, Features mit Datenzugriff aber nicht.

---

## Bedienung

| Tastenkürzel | Aktion |
|---|---|
| Alt+Y | Panel öffnen/schließen |
| Alt+P | Nächstes Profil |
| Alt+T | Transkript kopieren (Standardformat) |
| Alt+Q | Aktuelle Stelle zitieren (Markdown mit Zeitlink) |
| Alt+L | Link an aktueller Stelle kopieren |

Alle Kürzel lassen sich im Panel unter **Profile › Tastenkürzel** ändern.

Panel-Tabs: **Anzeige · Look · Layout · Verhalten · Filter · Features · Profile · Diagnose**.
Jede Änderung wirkt sofort (Live-Vorschau) und wird im aktiven Profil gespeichert.

---

## Architektur

```
Config (pro Profil)
  display   Target-ID → show | dim | collapse | hide
  vars      Control-ID → Wert (Theme, Farben, Dichte, Typografie …)
  layout    Presets pro Seite, Button-Reihenfolge, Kopfzeile
  behavior  Verhalten-ID → Wert
  filters   Kanäle, Stichwörter, Regex, Dauer, Alter, Shorts, Live, Gesehen
  features  Feature-ID → { enabled, …Einstellungen aus dem Manifest }

registry/   einziger Ort für YouTube-Selektoren und Datenpfade
appliers/   setzen die sechs Config-Blöcke um
features/   Module mit Manifest (settings, pages, hotkeys) + setup()
core/       nav, observer, mount, store, diagnose, hotkeys …
panel/      Oberfläche, vollständig aus Registry + Manifesten generiert
```

Prinzipien:

- **Config enthält nie YouTube-Selektoren**, nur IDs. Bricht etwas nach einem YouTube-Update, wird nur `src/registry/` angepasst.
- **Anzeige über CSS-Attribute am `<html>`**, nicht per JavaScript. Kein Flackern, kaum Laufzeitkosten.
- **Farben über YouTubes eigene Tokens** (`--yt-sys-color-baseline--*`), keine Selektor-Kriege.
- **Ein MutationObserver** für alles, entprellt, nur `setTimeout` (kein rAF – Hintergrund-Tabs).
- **Eigene Elemente** über `mount()`: wartet auf Anker, setzt neu ein wenn YouTube neu rendert, räumt beim Seitenwechsel ab.
- **Trusted Types**: kein `innerHTML`, alles per `createElement`.
- Features lassen sich einzeln abschalten; neue Einstellung = eine Zeile im Manifest, das Panel erzeugt das Control selbst.

### Nach einem YouTube-Update

1. Panel → **Diagnose**. Rot/gelb zeigt, welcher Target, Anker oder welches Feature nicht mehr greift.
2. „Bericht kopieren“ liefert eine Textzusammenfassung.
3. Selektor in `src/registry/targets.js` / `anchors.js` / `paths.js` / `tags.js` ergänzen (Arrays = Fallbacks), `npm run build`.

---

## Dateistruktur

```
ytx/
├── build.mjs                  esbuild → dist/, erzeugt Userscript-Header
├── package.json               build · dev · test · serve
├── dist/
│   ├── ytx.user.js            installierbares Userscript
│   ├── ytx.min.js             minifiziert, ohne Header
│   └── ytx.dev.user.js        Dev-Stub mit @require (lokal erzeugt, gitignored)
├── src/
│   ├── main.js                Start, verdrahtet alles, Debug-API window.__ytx
│   ├── core/
│   │   ├── bridge.js          Seitenkontext, Polymer-Daten, Player-API
│   │   ├── nav.js             Seitentyp, Video-ID, SPA-Events
│   │   ├── observer.js        ein MutationObserver, entprellte Sweeps
│   │   ├── mount.js           Einfügen an Ankern mit Neu-Einsetzen
│   │   ├── store.js           Profile, Speichern (GM_setValue/localStorage)
│   │   ├── config.js          Schema, Normalisierung gegen Registry
│   │   ├── css.js · dom.js · format.js · clipboard.js
│   │   ├── diagnose.js · hotkeys.js · log.js · lifecycle.js · scheduler.js
│   ├── registry/              YouTube-spezifisch, einziger Wartungsort
│   │   ├── targets.js         63 Targets mit erlaubten Modi
│   │   ├── anchors.js         Einfügepunkte
│   │   ├── paths.js           Datenpfade (Kacheln, Playlists, Videoseite)
│   │   ├── tags.js            sprachunabhängiges Tagging über Icon-Namen
│   │   ├── look.js            Theme-Tokens, Themes, Look-Controls
│   │   └── presets.js         Layout-Presets, Button-Reihenfolge
│   ├── appliers/              display · vars · layout · behavior · filters · features · tagger
│   │   └── filterLogic.js     reine Filterlogik ohne DOM (getestet)
│   ├── behaviors/index.js     Verhalten mit start()/stop
│   ├── features/
│   │   ├── transcript/        source (Token-URL) · panelSource (Fallback) · formats · index
│   │   ├── playlist/          common · duration · sort · dimWatched
│   │   ├── watchExtras.js     Endzeit · Datum · Kopieren-Menü
│   │   ├── cardExtras.js      Fortschritts-Badge · Proxy-Buttons
│   │   ├── ui.js              Buttons, Menü, Toast, Kopier-Dialog
│   │   └── index.js           Liste der Feature-Manifeste
│   ├── profiles/index.js      Vorlagen: YouTube · Aufgeräumt · Fokus
│   └── panel/                 index · tabs · controls · styles
├── tests/                     node --test: Formate, Filter, Config, Registry
└── tools/serve.mjs            Dev-Server + Handoff für Tests im eingebauten Browser
```

## Entwickeln

```bash
npm install
npm run build     # dist/ neu bauen
npm run dev       # watch
npm test          # 16 Unit-Tests
```

Neue Version veröffentlichen: `version` in `package.json` erhöhen, `npm run build`, `dist/ytx.user.js` mit committen und pushen. Tampermonkey erkennt das Update an der höheren Versionsnummer.

`window.__ytx` in der Konsole: `diagnose()`, `store`, `nav`, `feature(id)`, `panel`, `log()`, `destroy()`.

---

## Feature-Status

Getestet im Chromium-Browser **ohne Anmeldung** gegen YouTube (Stand 13.09.2026).

| Bereich | Funktion | Status |
|---|---|---|
| Anzeige | 63 Targets, Modi Normal/Dimmen/Einklappen/Aus, Live-Trefferzahl | ✅ getestet (Suche, Video, Kanal, Playlist, Startseite) |
| Anzeige | Buttons der Aktionsleiste sprachunabhängig (Icon-Daten) | ✅ |
| Anzeige | Seitenleisten-Abschnitte (Entdecken, Mehr von YouTube, Abos) | ⚠️ Logik da, ohne Login nicht sichtbar |
| Profile | Wechsel, Kopie, Umbenennen, Zurücksetzen, Löschen, Export/Import | ✅ |
| Look | Themes (OLED, Nord, Gruvbox, Dracula, Solarized), Einzelfarben | ✅ |
| Look | Spalten, Abstand, Radius, Schrift, Titelgröße/-zeilen, Zoom Aktionsleiste, Animationen | ✅ |
| Layout | Kompakt, Liste, Nur Text, Classic, Kino, Fokus, Breite Liste | ✅ Kino/Liste/Kompakt geprüft |
| Layout | Button-Reihenfolge Aktionsleiste, Kopfzeile mitscrollen/ausblenden | ✅ |
| Verhalten | Shorts → normales Video | ✅ (SPA-Klick) |
| Verhalten | Startseite umleiten | ✅ |
| Verhalten | Autoplay aus (gewinnt gegen YouTubes Zurücksetzen, respektiert Nutzerklick) | ✅ |
| Verhalten | Qualität, Geschwindigkeit merken, Pause im Hintergrund, Kanal-Trailer | ⚠️ implementiert, ungetestet (Wiedergabe im Test stumm/pausiert) |
| Verhalten | Experiment-Flags | ✅ werden gesetzt; ob YouTube sie beachtet, ist offen |
| Filter | Kanal (@handle, UC-ID, Name), Positivliste, Stichwort, Regex, Shorts, Live, Dauer, Alter | ✅ |
| Filter | Gesehen filtern | ⚠️ braucht Login |
| Transkript | Plain, Zeitstempel, Markdown mit Zeitlinks, SRT, VTT | ✅ + Unit-Tests |
| Transkript | Manuelle und automatische Spuren, Spurwahl, Kapitel als Absätze | ✅ |
| Transkript | Button nur bei vorhandenen Untertiteln | ✅ |
| Transkript | Aktuelle Stelle zitieren | ✅ Logik, Clipboard siehe unten |
| Transkript | Fallback über YouTubes Transkript-Panel | ⚠️ ungetestet (Panel war im Testbrowser von YouTube blockiert) |
| Playlist | Gesamt/übrig, „≥“ bei Teil-Ladung, „Alle laden“ | ✅ 242-Einträge-Playlist, beide Komponenten-Generationen |
| Playlist | Rest „ab hier“ im Playlist-Panel neben dem Video | ✅ |
| Playlist | Sortieren (nur Anzeige) | ✅ |
| Playlist | „Später ansehen“, gesehen/übrig, gesehene dimmen | ⚠️ braucht Login, ungetestet |
| Video | Endzeit im Player, exaktes Datum, Kapitel/Beschreibung/Link kopieren | ✅ |
| Video | Proxy-Buttons (Kopfzeile, Player, unter Titel) | ✅ |
| Thumbnails | Fortschritt als Zahl | ⚠️ braucht Login, ungetestet |
| Diagnose | Targets, Anker, Tagging, Features, Grundlagen, Log, Bericht | ✅ |
| SPA | Video→Video, Suche→Video→Playlist→Kanal→Startseite ohne Reload | ✅ |
| Fensterbreiten | 800 / 1000 / 1400 / 1920 px | ✅ |

---

## Bekannte Einschränkungen

**Wegen YouTube technisch nicht zuverlässig möglich**

- **Transkript direkt abrufen**: Untertitel-URLs liefern ohne Proof-of-Origin-Token leere Antworten, eigene InnerTube-Aufrufe scheitern mit `400 Precondition check failed`. ytx liest deshalb die Token-URL, die der Player selbst anfragt, und nutzt sie für andere Sprachen. Dafür muss der Player das Video geladen haben: **während Pre-Roll-Werbung oder bei nie gestartetem Video** klappt es erst danach (Button zeigt „Warte auf Werbung …“).
- **Untertitel anstoßen** ändert kurz die CC-Einstellung des Players; ytx stellt Zustand und YouTubes gespeicherte CC-Vorliebe danach wieder her.
- **Freie Zonen auf der Videoseite** nicht umgesetzt: Umhängen per `display: contents` kollidiert mit YouTubes JavaScript-Playergröße und dem automatischen Spaltenwechsel. Ersatz: feste Presets „Kino“ und „Fokus“.
- **Sortierung speichern** bei YouTube bewusst nicht vorhanden (Schreibzugriffe, kein Undo) – nur Anzeige.
- **Alte UI-Versionen** gibt es nicht mehr zum Umschalten. „Classic“-Preset baut den Look nach; Experiment-Flags wirken selten und erst nach Neuladen.
- **Veröffentlichungsdatum auf Kacheln** steht nur relativ und lokalisiert – Altersfilter versteht Deutsch und Englisch.
- **Mixe vs. News-Regale** auf der Startseite lassen sich sprachunabhängig nicht trennen → gemeinsames Target „Themen-Regale“.
- **Buttons, die YouTube bei wenig Platz ins ⋯-Menü schiebt**, können nicht umsortiert oder gespiegelt werden.
- **Dislike-Zahlen** nicht umgesetzt: nur über Fremddienst möglich (Datenschutz, Schätzwerte).
- **Größe der Player-Steuerleiste** nicht umgesetzt: YouTube vermisst sie per JavaScript, Skalieren macht die Seek-Leiste ungenau.

**Test-Grenzen dieser Version**

- Nicht angemeldet getestet: Abo-Feed, „Später ansehen“, Fortschrittsbalken, Seitenleisten-Abschnitte, Clip/Super-Thanks-Buttons ungeprüft.
- Zwischenablage konnte im Testfenster nicht beschrieben werden (kein Fokus, kein `GM_setClipboard`). In Tampermonkey nutzt ytx `GM_setClipboard`; schlägt Kopieren trotzdem fehl, öffnet sich ein Dialog mit markiertem Text.
- Firefox/Violentmonkey und Tampermonkey selbst nicht getestet – Script lief per Injektion im Seitenkontext, wie es `@sandbox JavaScript` vorsieht.
- Visuelle Prüfung nur über Geometrie/Computed Styles, keine Screenshots.

**Sonstiges**

- Nur `www.youtube.com` Desktop. `m.youtube.com`, YouTube Music und Embeds sind nicht abgedeckt.
- Profile werden pro Browser gespeichert, kein Sync zwischen Geräten (Export/Import nutzen).
