# ytx – Architektur, Spike-Ergebnisse, Tests

Stand 0.2.0 (15.09.2026)

## 1. Grundidee

Ein Userscript, zwei Seiten. `core/site.js` erkennt am Hostnamen `youtube` oder `music`. `sites/index.js` liefert das passende Site-Objekt. Alles, was sich zwischen den Seiten unterscheidet, hängt an diesem Objekt:

| Feld | YouTube | Music |
|---|---|---|
| `pageFromUrl`, `videoIdFromUrl`, `currentVideoId` | URL | URL + Player-API (Player läuft seitenübergreifend) |
| `targets`, `GROUPS`, `anchors`, `tagRules` | registry/youtube | registry/music |
| `look` (Tokens, Themes, Controls, extraCss) | `--yt-sys-color-baseline--*` | `--ytmusic-*` |
| `presets`, `behaviors`, `features` | … | … |
| `filters` | Kachel-Filter | `null` (Music-Regeln laufen über Blocklisten) |
| `panelTabs` | 8 Tabs | 10 Tabs inkl. Musik, Verlauf & Daten, Statistik |
| `boot()` | Timedtext-Mitschnitt | Music-CSS, Music-Diagnose |

Kern-Module (`core/`, `appliers/`, `panel/`) lesen nur `site.*`. Kein Selektor, kein Datenpfad und keine Sonderlogik einer Seite steht im Kern.

## 2. Wichtigste Entscheidungen

1. **Ein Script statt zwei Erweiterungen.** Gemeinsame Profile, ein Panel, eine Diagnose, ein Update-Kanal. Kosten: Bundle ~470 KB. Das ist unkritisch, weil Tampermonkey lokal lädt.
2. **Config-Schema 3 mit Abschnitt pro Seite.** Alte flache Configs (0.1.x) wandern per Migration `schema-3-sites` nach `youtube`, der Music-Teil kommt aus der Vorlage. Jede Seite normalisiert gegen ihre eigene Registry, Unbekanntes fliegt raus.
3. **Musikgeschmack liegt nicht im Profil.** Vorlieben (Discovery, Blocklisten, Gewichte, Smart Queue, Quellen) liegen im Store-Bucket `music`. Verlauf, Favoriten, Feedback und Neuerscheinungen liegen in IndexedDB `ytx-music`. Profile ändern nur Look und Funktionen.
4. **IndexedDB mit Migrationsliste von Anfang an** (`core/idb.js`, `features/music/data/db.js`). Migration n hebt Version n auf n+1. Bestehende Migrationen werden nie geändert. Aktuell v2 (plays, tracks, artists, favorites, releases, feedback, cache, meta, genres).
5. **Datenquellen nach Stabilität:**
   1. Redux-Store der App (`ytmusic-app.polymerController.store.getState()`): Queue, Player, Like-Status, Player-Tabs, Songtext, aktuelle Seite
   2. Polymer-Daten an Elementen (Regale, Chips, Queue-Einträge)
   3. Seitendaten, die Music selbst ausliefert: `initialData.push(...)` im HTML normaler Seitenaufrufe, gedrosselt im Hintergrund (`core/pageData.js`)
   4. DOM nur als Rückfall (Like-Attribut, Anker)

   Keine eigenen InnerTube/API-Aufrufe.
6. **Klassifizierung nie über sichtbare Texte.** `pageType`, `musicVideoType`, Browse-ID-Präfixe, Icon-Namen und Protobuf-Parameter (Podcast-Chip) statt „Podcasts“, „Songtext“ usw.
7. **Navigation über die App selbst.** Ein unsichtbares `yt-formatted-string` mit `navigationEndpoint` wird angeklickt, die App navigiert per SPA (Wiedergabe, Radio, Künstler, Album). Ein normales `<a href>` lädt die Seite neu.
8. **Warteschlange wird nie umgebaut.** Smart Queue überspringt nur (`nextVideo`). Mixe laufen in einer eigenen ytx-Reihenfolge, die am Songende den nächsten Titel startet.
9. **Reine Logik ohne DOM** in `features/music/logic/` (Tracker, Profil, Empfehlung, Regeln, Fassungen, Sessions, Queue, Statistik, Songtext) und `registry/music/parse.js`. Beides ist mit Unit-Tests und echten Fixtures abgesichert.
10. **Erklärbare Empfehlungen.** Jeder Kandidat trägt Quellen (`favoriteArtist`, `similar`, `genre`, `featured`, `history`, `release`, `seed`). `rank()` mischt Relevanz, Passung zum Profil und den Regler Bekannt ⟷ Entdecken. Aus den Quellen entstehen die Begründungen.
11. **Metadaten-Quellen als Schnittstelle.** `metadataProviders/` mit `local` (immer an) und `musicbrainz`, `lastfm`, `ollama` (aus, nur über `GM_xmlhttpRequest`). Ohne externe Dienste funktioniert alles.

## 3. Datenfluss Music

```
Player/Store ──1 s──► history.js ──► logic/tracker ──► IndexedDB plays
                                                        │
favorites/feedback/prefs ───────────────────────────────┤
                                                        ▼
                                              logic/taste buildProfile (1 min Cache)
                                                        │
catalog (Seiten im Hintergrund, Cache) ──► engine buildMix ──► logic/recommend rank ──► hub (Begründungen, Feedback)
                                                        │
releases.js ──(Intervall)──► engine checkReleases ──► IndexedDB releases ──► Badge, Startseiten-Regal
smartQueue ──► logic/queue skipDecision ──► Markierung / nextVideo
```

### Bewertung einer Wiedergabe

- komplett: +1, Wiederholung +0,6, Like +2
- teilweise ohne Skip: +0,4 × Anteil
- Skip: −1,6 × (1 − Anteil)^1,5 → Skip nach 5 % ≈ −1,48, Skip nach 90 % ≈ −0,05
- Favoriten: Künstler +4, Song +3, Album +2, Playlist +1 (je × Gewicht)
- Halbwertszeit 120 Tage
- Alles im Panel unter **Musik › Gewichtung** änderbar

### Discovery

`mix = (1−d)·(0,3 + 0,7·Bekanntheit) + d·(0,3 + 0,7·(1−Bekanntheit))`. Passung zu Favoriten (über `viaKey`) bleibt auch bei hohem `d` erhalten. Pro Künstler gilt ein Deckel (2–4 je nach `d`). Gleiche Songs in anderer Fassung zählen einmal (`trackKey`).

## 4. Spike-Ergebnisse (M0)

| Spike | Ergebnis | Folge |
|---|---|---|
| Datenquelle aktueller Song | Store `player.playerResponse.videoDetails` + `queue.items` + Player-API `getVideoData/getCurrentTime/getDuration/getPlayerState`, `player.adPlaying` | Tracker ohne DOM |
| Queue-Einträge | `playlistPanelVideoRenderer`, bei Song/Video-Paaren `playlistPanelVideoWrapperRenderer` mit `counterpart` | `parseQueueItem` erkennt beide Videofassungen als einen Titel |
| Seitendaten laden | `fetch` gleicher Herkunft liefert HTML mit `initialData.push({path, params, data})`. Escapes einmalig auflösen (`\x22`, `\/`) | `initialData.js`, Fixtures-Tool |
| Genre-Kategorie | nicht per URL ladbar, eigenes `resolveCommand` → 400 | Genre-Finder über Suche + Playlists |
| Navigation | `<a href>` = Reload. Polymer-Link mit `navigationEndpoint` = SPA | `navigateEndpoint()` |
| Queue einfügen | `queueAddEndpoint` per Command ohne Wirkung/instabil | kein Einfügen, Auto-Skip + ytx-Reihenfolge |
| Songtext | Player-Tab mit `browseId MPLYt…`, Inhalt nach Öffnen in `playerPage.playerPageTabsContent[browseId]`, nur `musicDescriptionShelfRenderer` (ohne Zeitstempel) | Tab bei Bedarf öffnen, LRC-Format nur mit Zeitstempeln |
| Player-Tabs | Warteschlange = `musicQueueRenderer`, Kommentare = `sectionListRenderer` ohne Endpoint, Ähnliche = `MPTRt…` | Tagging sprachunabhängig |
| Farben | Music nutzt `--ytmusic-*` (background, nav-bar, player-bar-background, text-primary …) | eigene Look-Registry |
| Podcast-Chip | Chip-Parameter ist Protobuf, aktive Kategorie 12 = Podcasts (`08 0c 10 03`) | `chipKind()` |
| Künstler-URLs | inzwischen `/@handle`, Alben öffnen unter `/playlist?list=OLAK…` | Seitentyp zusätzlich aus Store-`browseId` |
| IndexedDB | im Seitenkontext nutzbar, übersteht Reload | Verlauf in IDB |
| Web Audio | Medien kommen per MSE (blob:), `createMediaElementSource` möglich | Equalizer experimentell |
| Stummschalten im Test | `video.muted` reicht nicht, der Player setzt die Lautstärke zurück | Test-Harness patcht Setter, im Produkt kein Eingriff |
| Autoplay | ohne vorherige Nutzereingabe startet der nächste Titel teils nicht | ytx-Reihenfolge ruft nach 3 s `playVideo()` |

## 5. Offen / nicht zuverlässig umsetzbar

- **Titel in YouTubes Warteschlange einfügen oder umsortieren**: nur über interne Commands, instabil → Auto-Skip und ytx-Reihenfolge.
- **Zeitgestempelte Songtexte**: nicht in der Web-App.
- **Genre-Unterseiten laden**, **Genre pro Künstler**: nicht ohne interne API bzw. externe Quelle.
- **Exaktes Veröffentlichungsdatum**: Künstlerseite zeigt nur das Jahr.
- **„Fans hören auch“ gewichten**: Music liefert die Liste ohne Stärke. ytx nutzt die Reihenfolge.
- **YouTubes eigenen Verlauf importieren**: `/history` braucht Login. Parser `parseLibraryList` ist vorbereitet, ein Import-Knopf fehlt noch, bis die Struktur mit Login geprüft ist.
- **Samples-Feed**, **Premium-Upsells**: Selektoren vorhanden, ohne Login nicht sichtbar, daher unbestätigt.
- **Equalizer ohne Neuladen wieder abkoppeln**: Web-Audio-Grenze.

## 6. Test mit eingeloggtem Konto

Vorher: Tampermonkey auf 0.2.0 aktualisieren, Seiten neu laden. Nach jedem Punkt Panel → **Diagnose** → „Nur Probleme zeigen“. Bei Rot/Gelb „Bericht kopieren“ und schicken.

**YouTube Music**

1. Startseite: Samples und Upgrade in der Seitenleiste weg? Podcast-Regale weg? Regal „Neu von deinen Künstlern“ oben (nach ★ auf ein paar Künstlern und „Mix › Neu › Jetzt prüfen“).
2. Einen Song starten, 1 Minute hören, dann überspringen. **Verlauf & Daten**: Eintrag mit Skip-Zeitpunkt? Diagnose „Hörverlauf“ grün?
3. Song liken, komplett hören. Eintrag zeigt ✓ und ♥?
4. ★ in der Playerleiste: Song, Künstler, Album favorisieren. **Musik › Favoriten** zeigt sie?
5. **Mix › Für dich**: Titel mit Begründungen? ⋯ → „Weniger davon“ → neu berechnen (↻), ändert sich die Liste?
6. **Mix › Genre**: dein Genre eintragen, ☆ merken.
7. **Mix › Smart Radio** → „▶ Alles abspielen“: springt am Songende zum nächsten ytx-Titel? Tab **Reihenfolge** zeigt den Stand?
8. **Musik › Smart Queue**: Auto-Skip an, Begriff „remix“ drin. Kommt ein Remix, wird er übersprungen und im Verlauf nicht als Skip gezählt?
9. Songtext-Tab öffnen → „Songtext kopieren“. Titel ohne Songtext: Button fehlt, Diagnose sagt „kein Songtext“.
10. Lange Playlist (> 200 Titel) abspielen: Warteschlangen-Dauer plausibel, Seite flüssig?
11. Mediathek, Künstler-, Album-, Playlist-Seite, Suche: ★ auf der Seite, Diagnose ohne Rot?
12. Seite neu laden: Verlauf, Favoriten, Einstellungen noch da? **Export** → **Import** in einem anderen Browserprofil.
13. Profil wechseln (Alt+P): Look ändert sich, Verlauf und Favoriten bleiben.
14. Auf www.youtube.com: Videoseite, Transkript kopieren, Playlist-Dauer, „Später ansehen“ und Filter prüfen (Regression durch den Umbau).

**Optional**

- Audio: „Audio statt Video & Equalizer“ an, Musikvideo starten → schaltet auf die Audiofassung? EQ „Bass+“ hörbar? Bei Problemen aus und neu laden.
- Metadaten: Last.fm-Key eintragen, **Mix › Ähnlich** mit Last.fm an und aus vergleichen. Tampermonkey fragt einmal nach der Verbindung.
