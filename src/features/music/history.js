import { createTracker } from './logic/tracker.js'
import { currentTrack } from '../../registry/music/player.js'
import { music, scheduleRetention } from './runtime.js'
import { listen } from '../../core/lifecycle.js'

// lokaler hoerverlauf, eine stichprobe pro sekunde aus store und player api

export const autoSkipped = new Map()

export const historyFeature = {
  id: 'm.history',
  site: 'music',
  label: 'Hörverlauf & Geschmacksprofil',
  group: 'Hören',
  description: 'Merkt sich lokal, was du wie lange hörst, überspringst oder likest. Grundlage für Empfehlungen und Statistik. Pausieren, löschen und exportieren im Tab „Verlauf & Daten“',
  stability: 'hoch',
  settings: {},
  setup(ctx) {
    const tracker = createTracker()
    const stats = { samples: 0, saved: 0, dropped: 0, lastSampleAt: 0, lastSaved: null, lastError: null, lastVideo: null }
    let pausedSince = 0

    const save = async (records) => {
      for (const rec of records) {
        const auto = autoSkipped.get(rec.videoId)
        if (auto && Date.now() - auto < 10 * 60 * 1000) {
          // von ytx uebersprungen zaehlt nicht als eigene entscheidung
          autoSkipped.delete(rec.videoId)
          stats.dropped++
          continue
        }
        try {
          if (await music.history.add(rec)) {
            stats.saved++
            stats.lastSaved = { title: rec.title, percent: rec.percent, skipped: rec.skipped, completed: rec.completed, at: rec.endedAt }
          } else {
            stats.dropped++
          }
        } catch (e) {
          stats.lastError = e.message
          ctx.log.warn('music history speichern', e)
        }
      }
    }

    const tick = () => {
      const t = currentTrack()
      const now = Date.now()
      if (!t) return
      stats.samples++
      stats.lastSampleAt = now
      stats.lastVideo = t.videoId
      if (!t.playing) {
        pausedSince ||= now
        // lange pause beendet den eintrag
        if (now - pausedSince > 30 * 60 * 1000 && tracker.current) save(tracker.finish('pause', now))
      } else {
        pausedSince = 0
      }
      const session = music.session()
      const meta = { title: t.title, artists: t.artists, album: t.album, year: t.year, durationSec: t.durationSec }
      const out = tracker.sample({ ts: now, videoId: t.videoId, pos: t.pos, dur: t.dur, playing: t.playing, ad: t.ad, liked: t.liked, rate: t.rate, meta, context: { page: ctx.nav.page, playlistId: ctx.nav.playlistId || null, session: session?.presetId || null, videoType: t.videoType } })
      if (out.length) save(out)
    }

    const timer = setInterval(tick, 1000)
    const offHide = listen(window, 'pagehide', () => save(tracker.finish('close', Date.now())))
    scheduleRetention()
    const daily = setInterval(scheduleRetention, 6 * 3600 * 1000)
    tick()

    return {
      stats,
      tracker,
      dispose() {
        clearInterval(timer)
        clearInterval(daily)
        offHide()
        save(tracker.finish('close', Date.now()))
      },
      health() {
        const p = music.prefs()
        if (p.history.paused) return { status: 'warn', detail: 'Hörverlauf pausiert' }
        if (stats.lastError) return { status: 'fail', detail: `Speichern fehlgeschlagen: ${stats.lastError}` }
        if (!stats.lastVideo) return { status: 'skip', detail: 'Noch kein Titel erkannt' }
        const cur = tracker.current
        return { status: 'ok', detail: `${cur ? `läuft: ${cur.meta?.title || cur.videoId} · ${Math.round(cur.listened)} s gehört` : 'bereit'} · ${stats.saved} gespeichert in dieser Sitzung` }
      }
    }
  }
}
