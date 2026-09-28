import { site } from '../../../sites/index.js'
import { pageWindow } from '../../../core/bridge.js'
import { formatDuration } from '../../../core/format.js'
import { listen } from '../../../core/lifecycle.js'
import { ytDb } from './db.js'
import { DAY, dayKey, createSession, tickSession, reminderDue } from './logic.js'
import { h, button } from '../../ui.js'

// eigene schauzeit, lokal in indexeddb, mit tageslimit und pausen erinnerung
// erinnert nur, blockiert nichts
// player zugriff kommt aus der registry der seite

const activePlayback = () => site.playback.activePlayback()
const pauseActive = () => site.playback.pauseActive()

let current = null

export const watchTime = {
  get instance() {
    return current
  }
}

export default {
  id: 'watch.time',
  label: 'Schauzeit & Tageslimit',
  group: 'Wohlbefinden',
  description: 'Misst lokal, wie lange Videos wirklich laufen (Werbung zählt nicht). „Heute: 42 min“ oben rechts, sanfte Erinnerung beim Tageslimit und nach langem Schauen am Stück. Statistik im Tab „Schauzeit“',
  stability: 'mittel-hoch',
  anchors: ['top.buttons'],
  settings: {
    record: { type: 'toggle', label: 'Schauzeit aufzeichnen', default: true },
    showToday: { type: 'toggle', label: '„Heute: …“ in der Kopfzeile', default: true },
    limitMinutes: { type: 'range', label: 'Tageslimit (Minuten, 0 = aus)', min: 0, max: 480, step: 15, default: 120 },
    remindEveryMinutes: { type: 'range', label: 'Nach dem Limit erneut erinnern alle (Minuten)', min: 5, max: 60, step: 5, default: 15 },
    breakMinutes: { type: 'range', label: 'Pausen-Erinnerung nach (Minuten am Stück, 0 = aus)', min: 0, max: 240, step: 15, default: 60 },
    pauseAtLimit: { type: 'toggle', label: 'Beim Tageslimit Video anhalten', default: false },
    countShorts: { type: 'toggle', label: 'Shorts mitzählen', default: true },
    retentionDays: { type: 'range', label: 'Aufbewahren (Tage)', min: 30, max: 730, step: 30, default: 365 }
  },
  setup(ctx) {
    let s = ctx.settings
    const db = ytDb()
    const st = { session: null, day: dayKey(Date.now()), todayBase: 0, lastTick: Date.now(), lastSave: 0, streak: 0, lastPlayAt: 0, remind: { limitAt: null, breakAt: null }, error: null, saved: 0 }

    const loadToday = async () => {
      try {
        const list = await db.byIndex('views', 'day', st.day)
        st.todayBase = list.filter((v) => v.id !== st.session?.id).reduce((n, v) => n + (v.wallSec || 0), 0)
      } catch (e) {
        st.error = e.message
      }
    }
    loadToday()

    const save = (sess) => {
      if (!sess || sess.wallSec < 3) return
      db.put('views', { ...sess, wallSec: Math.round(sess.wallSec) })
        .then(() => st.saved++)
        .catch((e) => (st.error = e.message))
    }

    const todaySec = () => st.todayBase + (st.session?.wallSec || 0)

    // ---------- anzeige heute ----------

    const badge = ctx.mount({
      id: 'top.watchtime',
      anchor: 'top.buttons',
      position: 'prepend',
      when: () => s.showToday && s.record,
      create: () => {
        const b = button({ label: 'Heute –', small: true, title: 'Schauzeit heute (ytx)', onClick: () => {
          const panel = pageWindow.__ytx?.panel
          panel?.open()
          panel?.select('watchStats')
        } })
        b.style.margin = '0 4px'
        return b
      },
      update: (node) => {
        const sec = todaySec()
        const t = sec < 60 ? '0 min' : formatDuration(sec)
        // auf schmalen bildschirmen kurz halten
        const text = innerWidth < 520 ? `⏱ ${t}` : `Heute ${t}`
        const label = node.querySelector('.ytx-label')
        if (label && label.textContent !== text) label.textContent = text
        const over = s.limitMinutes > 0 && sec >= s.limitMinutes * 60
        node.style.color = over ? 'var(--yt-sys-color-baseline--call-to-action, #3ea6ff)' : ''
      }
    })

    // ---------- erinnerung ----------

    let card = null
    const closeCard = () => {
      card?.remove()
      card = null
    }
    const remind = (kind) => {
      closeCard()
      const sec = todaySec()
      const paused = kind === 'limit' && s.pauseAtLimit
      if (paused) pauseActive()
      const title = kind === 'limit' ? 'Tageslimit erreicht' : 'Zeit für eine kurze Pause?'
      const text = kind === 'limit' ? `Du hast heute schon ${formatDuration(sec)} geschaut (Limit ${formatDuration(s.limitMinutes * 60)}).${paused ? ' Das Video ist angehalten.' : ''}` : `Du schaust seit ${formatDuration(st.streak)} am Stück.`
      const actions = h('div', { class: 'ytx-row' })
      if (!paused) actions.append(button({ label: 'Video anhalten', small: true, onClick: () => { pauseActive(); closeCard() } }))
      actions.append(button({ label: kind === 'limit' ? 'Weiter schauen' : 'Weiter', small: true, onClick: closeCard }))
      card = h('div', { class: 'ytx-wt-card', role: 'status', 'data-ytx-own': '' }, h('b', { text: title }), h('div', { text }), actions)
      document.body.append(card)
    }

    ctx.css(`.ytx-wt-card { position: fixed; z-index: 2400; left: 50%; bottom: 28px; transform: translateX(-50%); width: min(420px, 92vw); box-sizing: border-box; display: flex; flex-direction: column; gap: 8px; padding: 14px 16px; border-radius: 12px;
  font: 400 14px/1.4 Roboto, Arial, sans-serif; color: var(--yt-sys-color-baseline--text-primary, #f1f1f1); background: var(--yt-sys-color-baseline--menu-background, #282828); box-shadow: 0 6px 28px rgba(0,0,0,.45); border: 1px solid var(--yt-sys-color-baseline--outline, rgba(255,255,255,.12)); }
.ytx-wt-card b { font-size: 15px; font-weight: 500; }
.ytx-wt-card .ytx-row { display: flex; gap: 8px; justify-content: flex-end; }`)

    // ---------- messen ----------

    const tick = () => {
      const now = Date.now()
      const dt = Math.min(2, Math.max(0, (now - st.lastTick) / 1000))
      st.lastTick = now
      const day = dayKey(now)
      if (day !== st.day) {
        if (st.session) save(st.session)
        st.session = null
        st.day = day
        st.todayBase = 0
        st.remind = { limitAt: null, breakAt: null }
      }
      if (!s.record) return
      let p = activePlayback()
      if (p && p.kind === 'short' && !s.countShorts) p = null
      if (st.session && (!p || p.videoId !== st.session.videoId)) {
        save(st.session)
        st.todayBase += st.session.wallSec
        st.session = null
      }
      if (p) {
        st.session ||= createSession(p, now)
        tickSession(st.session, p, dt, now)
        if (now - st.lastSave > 15000) {
          st.lastSave = now
          save(st.session)
        }
      }
      if (p?.playing && !p.ad) {
        st.streak += dt
        st.lastPlayAt = now
      } else if (now - st.lastPlayAt > 5 * 60 * 1000 && st.streak) {
        st.streak = 0
        st.remind.breakAt = null
      }
      const due = reminderDue({ todaySec: todaySec(), streakSec: st.streak, limitMin: s.limitMinutes, breakMin: s.breakMinutes, remindEveryMin: s.remindEveryMinutes, state: st.remind })
      if (due) {
        if (due.kind === 'limit') st.remind.limitAt = due.mark
        else st.remind.breakAt = due.mark
        remind(due.kind)
      }
    }

    const timer = setInterval(tick, 1000)
    const badgeTimer = setInterval(() => badge.refresh(), 10000)
    const offHide = listen(window, 'pagehide', () => save(st.session))
    // alte eintraege aufraeumen
    const prune = () => db.deleteWhere('views', 'startedAt', IDBKeyRange.upperBound(Date.now() - s.retentionDays * DAY)).catch(() => {})
    const pruneTimer = setTimeout(prune, 20000)

    const inst = {
      todaySec,
      get session() {
        return st.session
      },
      state: st,
      remind,
      update(next) {
        s = next
        badge.refresh()
      },
      dispose() {
        clearInterval(timer)
        clearInterval(badgeTimer)
        clearTimeout(pruneTimer)
        offHide()
        save(st.session)
        closeCard()
        badge.destroy()
        if (current === inst) current = null
      },
      health() {
        if (!s.record) return { status: 'skip', detail: 'Aufzeichnung aus' }
        if (st.error) return { status: 'fail', detail: `Speichern: ${st.error}` }
        const p = st.session
        return { status: 'ok', detail: `heute ${formatDuration(todaySec())}${p ? ` · läuft: ${p.title || p.videoId} (${Math.round(p.wallSec)} s)` : ''} · am Stück ${Math.round(st.streak / 60)} min${s.limitMinutes ? ` · Limit ${s.limitMinutes} min` : ''}` }
      }
    }
    current = inst
    return inst
  }
}
