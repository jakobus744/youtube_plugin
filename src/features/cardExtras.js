import { qsa } from '../core/dom.js'
import { firstInt } from '../core/format.js'
import { h, button } from './ui.js'

// fortschritt steht nur bei angemeldeten nutzern in den kacheln
const BARS = ['ytd-thumbnail-overlay-resume-playback-renderer #progress[style*="width"]', 'yt-thumbnail-view-model [class*="ProgressBarSegment"][style*="width"]', 'yt-thumbnail-overlay-progress-bar-view-model [style*="width"]']

export const progressBadge = {
  id: 'thumb.progressBadge',
  label: 'Fortschritt als Zahl auf Thumbnails',
  group: 'Thumbnails',
  description: '„62 %“ statt nur dünnem roten Balken. Braucht Anmeldung, sonst liefert YouTube keinen Fortschritt',
  stability: 'mittel',
  settings: {
    min: { type: 'range', label: 'Erst ab', min: 1, max: 95, step: 1, unit: '%', default: 1 },
    doneLabel: { type: 'toggle', label: 'Ab 95 % „✓ gesehen“ zeigen', default: true }
  },
  setup(ctx) {
    let s = ctx.settings
    let count = 0
    const run = () => {
      count = 0
      for (const bar of qsa(BARS.join(', '))) {
        const pct = firstInt(bar.style.width)
        const thumb = bar.closest('ytd-thumbnail, yt-thumbnail-view-model')
        if (!thumb) continue
        let badge = thumb.querySelector(':scope > .ytx-badge')
        if (pct == null || pct < s.min) {
          badge?.remove()
          continue
        }
        const text = s.doneLabel && pct >= 95 ? '✓ gesehen' : `${pct} %`
        if (!badge) {
          badge = h('span', { class: 'ytx-badge', 'data-ytx-own': '' })
          if (getComputedStyle(thumb).position === 'static') thumb.style.position = 'relative'
          thumb.append(badge)
        }
        if (badge.textContent !== text) badge.textContent = text
        count++
      }
    }
    return {
      onSweep: run,
      update(next) {
        s = next
        run()
      },
      dispose() {
        for (const b of qsa('.ytx-badge')) b.remove()
      },
      health: () => ({ status: count ? 'ok' : 'skip', detail: `${count} Badges · ohne Anmeldung gibt es keinen Fortschritt` })
    }
  }
}

const PROXY = [
  ['share', 'Teilen', '↗'],
  ['save', 'Speichern', '＋'],
  ['download', 'Herunterladen', '⤓'],
  ['clip', 'Clip', '✂'],
  ['thanks', 'Super Thanks', '♥'],
  ['like', 'Like', '👍']
]

export const proxyButtons = {
  id: 'ui.proxyButtons',
  label: 'Buttons spiegeln',
  group: 'Videoseite',
  description: 'Eigene Buttons an anderer Stelle, die den Original-Button fernsteuern. Das Original darf ausgeblendet sein',
  pages: ['watch'],
  stability: 'mittel',
  anchors: ['top.buttons', 'player.rightControls', 'watch.titleRow'],
  settings: {
    buttons: { type: 'multi', label: 'Buttons', options: PROXY.map(([id, l]) => [id, l]), default: ['share', 'save'] },
    placement: { type: 'select', label: 'Position', options: [['watch.titleRow', 'Unter dem Titel'], ['top.buttons', 'Kopfzeile'], ['player.rightControls', 'Player rechts']], default: 'watch.titleRow' },
    labels: { type: 'toggle', label: 'Beschriftung zeigen', default: true }
  },
  setup(ctx) {
    let s = ctx.settings
    let missing = []
    let m = null
    const clickOriginal = (id) => {
      const orig = document.querySelector(`ytd-watch-metadata [data-ytx-btn="${id}"] button, ytd-watch-metadata [data-ytx-btn="${id}"] a, ytd-watch-metadata [data-ytx-btn="${id}"]`)
      if (!orig) return false
      orig.click()
      return true
    }
    const build = () => {
      m?.destroy()
      m = ctx.mount({
        id: 'proxy.buttons',
        anchor: s.placement,
        position: s.placement === 'player.rightControls' ? 'prepend' : 'append',
        when: () => ctx.nav.page === 'watch',
        create: () => {
          const row = h('div', { style: { display: 'inline-flex', gap: '6px', alignItems: 'center', margin: s.placement === 'watch.titleRow' ? '8px 0' : '0 6px' } })
          for (const [id, label, icon] of PROXY) {
            if (!s.buttons.includes(id)) continue
            const b = button({ label: s.labels ? label : '', icon, small: true, title: label, onClick: () => clickOriginal(id) })
            b.dataset.proxy = id
            row.append(b)
          }
          return row
        },
        update: (node) => {
          missing = []
          for (const b of node.querySelectorAll('[data-proxy]')) {
            const ok = !!document.querySelector(`ytd-watch-metadata [data-ytx-btn="${b.dataset.proxy}"]`)
            b.disabled = !ok
            if (!ok) missing.push(b.dataset.proxy)
          }
        }
      })
    }
    build()
    return {
      update(next) {
        s = next
        build()
      },
      dispose: () => m?.destroy(),
      health: () => (m?.ok ? { status: missing.length ? 'warn' : 'ok', detail: missing.length ? `Original fehlt: ${missing.join(', ')} (evtl. im ⋯-Menü oder nicht angemeldet)` : 'alle Originale gefunden' } : { status: 'warn', detail: 'Anker nicht gefunden' })
    }
  }
}
