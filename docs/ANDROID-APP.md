# ytx Android-App: Aufbau, Entscheidungen, Betrieb

Stand: 2026-10-10, Version 0.4.1. Die Kurzanleitung zum Installieren steht in der [README](../README.md), hier steht, wie es gebaut ist und warum.

## 1. Aufbau

- **Engine**: GeckoView (Firefox). Zwei Einträge in der App-Übersicht: `MainActivity` (YouTube) und `MusicActivity` (erbt von `MainActivity`, andere Start-Adresse, eigene Einstellungen). Beide nutzen dieselbe `GeckoRuntime` und damit denselben Speicher.
- **ytx selbst** läuft als eingebaute Erweiterung (`android/app/src/main/assets/ytx/`). `background.js` liefert Code und gespeicherte Werte, holt Updates von GitHub und leitet Anfragen weiter. `content.js` stellt die GM-Funktionen bereit (Speicher, `GM_xmlhttpRequest`, Zwischenablage) und eine Brücke zur App (`__ytxNative`, `__ytxAppLog`). Auf YouTube wird die Content-Security-Policy entfernt, sonst käme ytx nicht in die Seite.
- **Seiten-Brücke**: Die Seite sendet kurze Texte (`minimize`, `expand`, `close`, `openyt:<ID>`) über die Erweiterung an `YtxRuntime`, das ruft `MainActivity.onApp`. Der Text ist auf 20 Zeichen begrenzt, deshalb steckt in `openyt:` nur die Video-ID.

## 2. Funktionen im Android-Teil

| Funktion | Wo | Hinweise |
|---|---|---|
| Mini-Player | `MainActivity` (`minimize`, `expand`, `closeMini`) | Das Video bleibt in seiner Sitzung, eine zweite Sitzung lädt die vorherige Seite. Ein neues Video schließt das alte Fenster. Eine vorgewärmte Reserve-Sitzung (`takeSession`) verhindert Ruckeln. Jede Sitzung merkt sich ihre Adresse (`urls`), sonst ging das Verkleinern nach dem Vergrößern nicht mehr. |
| Mini-Oberfläche | `src/sites/miniMode.js` | Erkennt das kleine Fenster an der Fenstergröße (höchstens 480x300) auf einer Videoseite, blendet alles außer dem Video aus und zeigt Pause, Weiter, Schließen. |
| Hintergrund-Wiedergabe | `PlaybackService` | Dienst im Vordergrund (Typ `mediaPlayback`), solange eine Sitzung spielt. Benachrichtigung im Medien-Stil mit Titel, Künstler, Vorschaubild und Zurück, Pause, Weiter. Eine Android-`MediaSession` bedient Sperrbildschirm und Kopfhörer-Tasten. Der Zustand kommt aus dem GeckoView-`MediaSession.Delegate`. |
| Bild-in-Bild | `MainActivity.onUserLeaveHint` | Nur auf YouTube (nicht in Music) und nur, wenn Medien laufen und eine Videoseite offen ist. Mit Mini-Player wird dessen Sitzung auf volle Größe gezogen. |
| Zurück-Taste | `handleBack` | Vollbild verlassen, Verlauf zurück, zur Startseite, dann App in den Hintergrund. |
| Farbwähler, Dateiauswahl | `ColorPicker`, `onFilePrompt` | GeckoView hat dafür keine eigene Oberfläche. |
| App-Updates | `AppUpdater`, `InstallReceiver` | Prüft alle 12 Stunden die GitHub-Releases und fragt „Installieren?“. Der Empfänger ist nicht exportiert (Sicherheitsbefund: sonst konnte eine fremde App die Installation lenken). |
| Fehlerseite | `onLoadError` | Eigene HTML-Seite mit Hinweis. Code 37 (Namen nicht auflösbar) verweist auf VPN/DNS. Alle Texte werden maskiert (Sicherheitsbefund: XSS). |

## 3. Funktionen im Userscript für die App

- **Mobil-Seite** (`src/sites/mobile.js`): ytx-Leiste unter dem Video, standardmäßig eingeklappt (Chip „ytx“). Dort Transkript, Playlist-Werkzeuge und der Knopf „Herunterladen (YouTube-App)“. Seiten-Daten kommen über `registry/mobile/paths.js`, ausgewählt per `SITE_ID` in `sitePaths.js`.
- **Wischgesten** (`src/behaviors/mobile.js`, `swipeDownBack`): nach unten verkleinert, nach oben Vollbild. Gilt im ganzen Player außer an der Zeitleiste. Die Maße sind in CSS-Pixeln (55 CSS-Pixel entsprechen etwa 1,4 cm).
- **Music** (`src/behaviors/music.js`, `src/features/music/sleepTimer.js`): Wischen auf Cover oder Leiste wechselt den Titel. Der Sleep-Timer (Mond-Knopf) steht neben dem Stern. Karten der Reihe „Für dich“ öffnen den Song über die Adresse, wenn der interne Weg nichts tut. Das Neu-Mischen gibt nach 25 s auf.
- **Vorschau und Zeitleiste** (`src/behaviors/mobile.js`, `longPressPreview`, `tapSeek`): Die Vorschau legt ein Overlay mit dem offiziellen Einbett-Player (`youtube.com/embed`, stumm, `enablejsapi`) über das Thumbnail und steuert ihn per `postMessage`, 1,7-fach vergrößert, damit Titelzeile und Logo außerhalb liegen. Das lange Drücken löst in Gecko nach etwa 0,5 Sekunden das Kontextmenü aus und stoppt danach die Touch-Bewegungen. Deshalb setzt `YtxRuntime.java` die Einstellung `ui.click_hold_context_menus.delay` hoch. `tapSeek` springt bei einem kurzen Tipp (unter 0,6 s, unter 24 px Bewegung) mit `seekTo` an die Stelle.
- **Vollbild per Knopf** (`MainActivity.watchOrientation`): Die Seite sperrt dabei die Ausrichtung auf quer. Ein `OrientationEventListener` hebt die Sperre auf, sobald das Handy einmal quer und dann wieder hochkant gehalten wurde.
- **Music unten** (`src/behaviors/music.js`, `m.bottomNav`): Eigene Leiste, hängt an `documentElement` (beim Start gibt es noch kein `body`). Sie klickt die Einträge der Seitenleiste (`tap` und `click`), Suchen öffnet die Suchleiste. Die Playerleiste und ihr Titelbild werden um 56 Pixel nach oben geschoben, ab geöffnetem Player ist die Leiste weg.
- **Music-Aussehen auf dem Handy**
 (`src/features/music/ui.js`): Der Farbverlauf der Seite wiederholte sich auf Höhe des Titelbildes und erzeugte eine harte Kante. Er läuft jetzt in einem Stück, das Titelbild hinter der Kopfzeile ist aus. Die Playerleiste nimmt den Farbton der Seite an (`--ytx-tint`, alle 1,5 s aus dem Verlauf gelesen).
- **Look koppeln**: Theme und Farben gelten für YouTube, Music und Mobil gemeinsam (Standard seit der Migration `link-look-default-on`, abschaltbar im Look-Tab).

## 4. Nextcloud-Abgleich der Profile

- Modul `src/core/cloudSync.js`, Bedienung im Tab „Profile“. WebDAV: `MKCOL` auf `<Server>/remote.php/dav/files/<Benutzer>/ytx`, dann `PUT` und `GET` auf `profiles.json`. Anmeldung mit Nextcloud-App-Passwort per Basic-Auth.
- Standard-Adresse `http://pi.tail5f332e.ts.net:8181` (Tailscale). Auf dem Handy muss Tailscale an sein.
- Das Passwort liegt nur in den lokalen Einstellungen und wird aus Export und Datei herausgehalten (`exportJson`).
- Der Abgleich ist bewusst manuell: „Herunterladen“ überschreibt gleichnamige Profile, es gibt kein Zusammenführen. Nicht dabei: Verlauf, Abo-Gruppen, Downloads-Liste.
- Erlaubte Server stehen an drei Stellen und müssen zusammenpassen: `@connect` in `build.mjs`, `XHR_HOSTS` in `background.js`, Host-Rechte in `manifest.json`.
- Nachweis, dass der Upload ankommt: Die Datei liegt auf dem Pi unter `/mnt/nextcloud/Nextcloud/Jakob/files/ytx/profiles.json`. Der Ordner `ytx` liegt im Hauptverzeichnis der Nextcloud, nicht unter `Entwicklung`.

## 5. Download-Liste und was bewusst fehlt

- Der Knopf „Herunterladen (YouTube-App)“ pausiert das Video, merkt Titel und ID im Bucket `downloads` und öffnet das Video in der offiziellen YouTube-App. Der Panel-Tab „Downloads“ listet sie, „Öffnen“ springt wieder in die App.
- **Nicht gebaut**: Videos selbst herunterladen oder die Streams der Webseite herauslösen (verstößt gegen die Nutzungsbedingungen und umgeht YouTubes Schutz). Ebenso nicht gebaut: den Download in der Original-App über eine Bedienungshilfe auslösen (fragil, sehr weitgehende Berechtigung, Fertigmeldung nicht erkennbar, wahrscheinlich gegen die Nutzungsbedingungen). Die Original-App hat keine Schnittstelle für „lade Video X“.
- **Offen für Music**: Mini-Player wegwischen (die Webseite kennt kein „Player schließen“), Liedtext-Ansicht an einem Titel mit Text prüfen.

## 6. Test auf dem Handy

- adb liegt unter `%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe`. USB-Debugging am Handy an. Vor dem Tippen immer einen Screenshot machen (`exec-out screencap -p`), nie blind tippen. Koordinaten im Screenshot sind 1,2-mal kleiner als die echten Pixel.
- Seitenprotokoll: `adb logcat -s ytx-page` zeigt Aufrufe von `window.__ytxAppLog(...)`. Für die Fehlersuche kurz einbauen und danach wieder entfernen.
- Vor dem Test die Lautstärke prüfen. Die Medientaste `KEYCODE_MEDIA_PAUSE` pausiert, wenn etwas unerwartet läuft.
- Mit VPN/Pi-hole-DNS als einzigem Nameserver lädt nichts (Fehler 37). VPN ausschalten oder Tailscale verwenden.

## 7. Versionen und Veröffentlichen

- **Userscript**: `version` in `package.json` erhöhen, `npm run build`, `dist/` committen und pushen. Die App holt es alle 6 Stunden.
- **App**: Wenn der Android-Teil geändert wurde, `npm run apk`, dann ein GitHub-Release `v<version>` mit `ytx-<version>.apk`. Die Version muss höher sein als die installierte, sonst erkennt das Handy kein Update. Immer auf demselben Rechner bauen (Signaturschlüssel).
- **Node** kommt über nvm und ist im Terminal oft nicht im Pfad, siehe README.
