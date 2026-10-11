# ytx für iOS

Eigene App aus zwei Varianten (ytx und ytx Music), gleiche Idee wie die Android App: ein WKWebView lädt YouTube, ytx läuft darin.
Der Code liegt in `ios/`. Es ist nur geschrieben, noch nie gebaut oder auf einem iPhone getestet.

## Aufbau

- `ios/Ytx/WebController.swift`: WKWebView, lädt `YtxStartURL` aus der Info.plist (m.youtube.com oder music.youtube.com), reicht GM Aufrufe weiter
- `ios/Ytx/Resources/shim.js`: GM_getValue, GM_setValue, GM_xmlhttpRequest, GM_setClipboard, Farbe der Seite (wie `content.js` der Android Erweiterung, aber ohne Erweiterung)
- `ios/Ytx/Store.swift`: gespeicherte Werte (UserDefaults) und Update von GitHub alle 6 Stunden, gilt ab dem nächsten Start
- `ios/Ytx/Resources/embed.js`: blendet im Vorschau Player die YouTube Knöpfe aus (Kopie der Android Datei)
- `ios/project.yml`: XcodeGen, erzeugt das Xcode Projekt mit beiden Apps
- `.github/workflows/ios.yml`: baut unsigniert auf einem GitHub Mac, Ergebnis sind zwei `.ipa` Dateien

## Bauen ohne Mac

1. Repo auf GitHub, Actions, "iOS", "Run workflow" (oder ein Tag `v*` pushen)
2. Artefakt `ytx-ios` herunterladen (`ytx.ipa`, `ytxmusic.ipa`)
3. Mit Sideloadly (Windows) oder AltStore signieren und aufs iPhone laden. Mit einer kostenlosen Apple ID läuft die App 7 Tage, dann neu signieren. Mit dem Developer Programm (99 Euro im Jahr) ein Jahr, dazu TestFlight für Freunde.

## Bauen mit Mac

```bash
npm run ios:sync
cd ios && xcodegen generate && open ytx.xcodeproj
```

Team unter Signing eintragen, auf das iPhone starten.

## Was anders ist als auf Android

- Keine eingebaute Erweiterung nötig: WKUserScript läuft vor der Seite und wird von der CSP nicht blockiert
- Anmeldung bei Google: der User Agent enthält Safari, sonst blockt Google eingebettete Ansichten (muss getestet werden)
- Ton im Hintergrund: Audio Session `playback` und `UIBackgroundModes audio`. YouTube pausiert im Hintergrund oft trotzdem, dann hilft nur der Audio Fokus Modus von ytx (ungetestet)
- Vollbild: auf dem iPhone gibt es nur den Vollbild des Video Elements. Das Kippen zum Beenden, der Mini Player und die Benachrichtigung mit Steuerung fehlen (die App Befehle `__ytxNative` werden ignoriert)
- Kein App Icon, Update der App selbst nur durch neu Installieren (der ytx Code aktualisiert sich selbst)
- Wenn etwas nicht läuft: Safari am Mac, Entwickler, iPhone, ytx (Inspector ist an)

## Offen

- Bauen und auf dem iPhone prüfen (nichts davon wurde ausgeführt)
- App Icon, Teilen Menü, Tippen auf die Statusleiste zum Hochscrollen
- Picture in Picture und Sperrbildschirm Steuerung (MediaSession kommt aus der Seite, sollte funktionieren)
