import { iconButton } from './ui.js'
import { showMenu, toast } from '../ui.js'

// sleep timer: pausiert nach einer eingestellten zeit oder am ende des laufenden titels

const OPTIONS = [[15, '15 Minuten'], [30, '30 Minuten'], [45, '45 Minuten'], [60, '60 Minuten'], [0, 'Ende des Titels']]

const video = () => document.querySelector('video')

function pause() {
  const p = document.getElementById('movie_player')
  if (typeof p?.pauseVideo === 'function') p.pauseVideo()
  else video()?.pause()
}

export const sleepTimerFeature = {
  id: 'm.sleepTimer',
  site: 'music',
  label: 'Sleep-Timer',
  group: 'Hören',
  description: 'Mond-Knopf in der Playerleiste: Die Wiedergabe pausiert nach 15 bis 60 Minuten oder am Ende des Titels',
  stability: 'hoch',
  anchors: ['m.bar.middleButtons'],
  settings: {
    button: { type: 'toggle', label: 'Knopf in der Playerleiste', default: true }
  },
  setup(ctx) {
    let s = ctx.settings
    // until: zeitpunkt in ms, endOfTrack: am titelende pausieren
    const st = { until: 0, endOfTrack: false, timer: 0 }
    const active = () => !!st.until || st.endOfTrack

    const label = () => {
      if (st.endOfTrack) return 'Ende'
      if (!st.until) return ''
      return `${Math.max(1, Math.ceil((st.until - Date.now()) / 60000))}m`
    }

    const stop = () => {
      clearInterval(st.timer)
      st.timer = 0
      st.until = 0
      st.endOfTrack = false
      bar.refresh()
    }

    const tick = () => {
      if (st.until && Date.now() >= st.until) {
        pause()
        toast('Sleep-Timer: Wiedergabe pausiert')
        return stop()
      }
      const v = video()
      if (st.endOfTrack && v && isFinite(v.duration) && v.duration - v.currentTime < 1.2) {
        pause()
        toast('Sleep-Timer: Titel zu Ende, pausiert')
        return stop()
      }
      bar.refresh()
    }

    const start = (minutes) => {
      stop()
      if (minutes) st.until = Date.now() + minutes * 60000
      else st.endOfTrack = true
      st.timer = setInterval(tick, 1000)
      toast(minutes ? `Sleep-Timer: ${minutes} Minuten` : 'Sleep-Timer: bis zum Ende des Titels')
      bar.refresh()
    }

    const menu = (btn) => {
      const items = OPTIONS.map(([m, l]) => ({ label: l, checked: m ? undefined : st.endOfTrack, run: () => start(m) }))
      if (active()) items.push({ sep: true }, { label: 'Timer ausschalten', run: stop })
      showMenu(btn, items)
    }

    const bar = ctx.mount({
      id: 'm.sleep.bar',
      anchor: 'm.bar.middleButtons',
      position: 'prepend',
      when: () => s.button,
      create: () => iconButton({ icon: '☾', title: 'Sleep-Timer', pressed: false, onClick: (e, b) => menu(b) }),
      update: (node) => {
        node.setAttribute('aria-pressed', String(active()))
        const l = label()
        node.querySelector('.ytx-m-lbl')?.remove()
        if (l) node.append(Object.assign(document.createElement('span'), { className: 'ytx-m-lbl', textContent: l }))
      }
    })

    return {
      update(next) {
        s = next
        bar.refresh()
      },
      onVideo() {
        bar.refresh()
      },
      dispose() {
        stop()
        bar.destroy()
      },
      health() {
        return s.button && !bar.ok ? { status: 'warn', detail: 'Playerleiste nicht gefunden' } : { status: 'ok', detail: active() ? `läuft: ${label()}` : 'bereit' }
      }
    }
  }
}
