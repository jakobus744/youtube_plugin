import { pageWindow } from '../core/bridge.js'
import { innertubePost } from '../core/innertube.js'
import { onYtResponse } from '../core/ytResponses.js'
import { onSweep } from '../core/observer.js'
import { toast } from '../features/ui.js'

// knopf an jeder kachel: kein interesse oder kanal nicht empfehlen, mit youtubes eigener rueckmeldung
// die schluessel stehen in youtubes kachel menue, erkannt am symbol (HIDE, REMOVE), nicht am text

const KIND = { HIDE: 'hide', REMOVE: 'channel' }
const LABEL = { hide: 'Kein Interesse', channel: 'Kanal nicht empfehlen' }

function findKey(o, key, depth = 0) {
  if (!o || typeof o !== 'object' || depth > 40) return null
  if (key in o) return o[key]
  for (const k in o) {
    const r = findKey(o[k], key, depth + 1)
    if (r) return r
  }
  return null
}

const imageName = (o) => JSON.stringify(o).match(/"imageName":"([A-Z_]+)"/)?.[1] || null

const idOfShort = (s) => s.onTap?.innertubeCommand?.reelWatchEndpoint?.videoId || String(s.entityId || '').match(/([\w-]{11})$/)?.[1] || null

// video id -> { hide: { token, undo }, channel: { token, undo } }
export function extractFeedback(json, out = new Map(), id = null, depth = 0) {
  if (!json || typeof json !== 'object' || depth > 90) return out
  if (Array.isArray(json)) {
    for (const x of json) extractFeedback(x, out, id, depth + 1)
    return out
  }
  if (json.lockupViewModel?.contentId) id = json.lockupViewModel.contentId
  else if (json.shortsLockupViewModel) id = idOfShort(json.shortsLockupViewModel) || id
  if (json.listItemViewModel && id) {
    const kind = KIND[imageName(json.listItemViewModel)]
    const fb = kind && findKey(json.listItemViewModel, 'feedbackEndpoint')
    if (fb?.feedbackToken) {
      const e = out.get(id) || {}
      e[kind] ||= { token: fb.feedbackToken, undo: findKey(fb, 'undoFeedbackEndpoint')?.undoToken || null }
      out.set(id, e)
    }
    return out
  }
  for (const k in json) extractFeedback(json[k], out, id, depth + 1)
  return out
}

const CARD = 'ytm-rich-item-renderer, ytm-video-with-context-renderer, ytm-compact-video-renderer'

function idOfCard(el) {
  const c = el.querySelector('[class*="content-id-"]')?.className.match(/content-id-([\w-]{11})/)?.[1]
  if (c) return c
  const href = el.querySelector('a[href*="/watch?"], a[href^="/shorts/"]')?.getAttribute('href') || ''
  return href.match(/[?&]v=([\w-]{11})/)?.[1] || href.match(/\/shorts\/([\w-]{11})/)?.[1] || null
}

const send = (token) => innertubePost('feedback', { feedbackTokens: [token], isFeedbackTokenUnencrypted: false, shouldMerge: false })

const CSS = `
/* eigene ebene je kachel, sonst liegt das kreuz ueber der leiste unten */
:is(${CARD}) { position: relative; isolation: isolate; }
.ytx-ni { position: absolute; left: 8px; top: 8px; z-index: 3; width: 30px; height: 30px; border: 0; border-radius: 50%; padding: 0;
  background: rgba(0,0,0,.55); color: #fff; font: 16px/30px Roboto, Arial, sans-serif; text-align: center; }
.ytx-nimenu { position: fixed; left: 14px; z-index: 2147483000; display: flex; flex-direction: column; background: var(--ytx-menu, #2a2a2a); border-radius: 12px; box-shadow: 0 4px 18px #0008; }
.ytx-nimenu button { text-align: left; border: 0; background: none; color: var(--ytx-accent, #fff); font-size: 16px; padding: 14px 18px; }
[data-ytx-ni] > :not(.ytx-nibar) { display: none !important; }
.ytx-nibar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 6px 12px; padding: 10px 14px; border-radius: 10px;
  font: 14px/1.3 Roboto, Arial, sans-serif; color: var(--yt-sys-color-baseline--text-secondary, #aaa); background: var(--yt-sys-color-baseline--additive-background, rgba(255,255,255,.08)); }
.ytx-nibar button { border: 0; background: none; color: var(--ytx-accent, #3ea6ff); font: 500 14px Roboto, Arial, sans-serif; padding: 4px 0; }`

export const notInterested = {
  id: 'notInterested',
  label: 'Knopf „weg damit“ an Kacheln',
  description: 'Ein ✕ oben links an jedem Video: Kein Interesse oder Kanal nicht empfehlen. Nutzt YouTubes eigene Rückmeldung, damit ändern sich auch die Empfehlungen. Rückgängig direkt an der Stelle',
  type: 'toggle',
  default: true,
  start() {
    const map = new Map()
    // ytInitialData kommt oft erst nach dem start und wechselt beim seitenwechsel
    let init = null
    const readInit = () => {
      const d = pageWindow.ytInitialData
      if (d && d !== init) {
        init = d
        extractFeedback(d, map)
      }
    }
    const offResp = onYtResponse((j) => extractFeedback(j, map))

    const style = document.createElement('style')
    style.setAttribute('data-ytx-own', '')
    style.textContent = CSS
    document.head.append(style)

    const hide = async (el, id, kind) => {
      const t = map.get(id)?.[kind]
      if (!t) return
      el.setAttribute('data-ytx-ni', kind)
      const bar = document.createElement('div')
      bar.className = 'ytx-nibar'
      bar.setAttribute('data-ytx-own', '')
      bar.textContent = `Ausgeblendet: ${LABEL[kind]}`
      el.append(bar)
      let ok = false
      try {
        ok = await send(t.token)
      } catch {}
      if (!ok) {
        bar.remove()
        el.removeAttribute('data-ytx-ni')
        toast('YouTube hat die Rückmeldung nicht angenommen', 'warn')
        return
      }
      if (!t.undo) return
      const undo = document.createElement('button')
      undo.textContent = 'Rückgängig'
      undo.addEventListener('click', async (e) => {
        e.preventDefault()
        e.stopPropagation()
        let back = false
        try {
          back = await send(t.undo)
        } catch {}
        if (!back) return toast('Rückgängig nicht möglich', 'warn')
        bar.remove()
        el.removeAttribute('data-ytx-ni')
      })
      bar.append(undo)
    }

    const openMenu = (btn, el, id) => {
      document.querySelector('.ytx-nimenu')?.remove()
      const m = document.createElement('div')
      m.className = 'ytx-nimenu'
      m.setAttribute('data-ytx-own', '')
      const gone = () => {
        m.remove()
        document.removeEventListener('click', close, true)
        document.removeEventListener('scroll', gone, true)
      }
      const close = (e) => !m.contains(e.target) && gone()
      for (const kind of ['hide', 'channel']) {
        if (!map.get(id)?.[kind]) continue
        const b = document.createElement('button')
        b.textContent = LABEL[kind]
        b.addEventListener('click', (e) => {
          e.stopPropagation()
          gone()
          hide(el, id, kind)
        })
        m.append(b)
      }
      const r = btn.getBoundingClientRect()
      m.style.top = `${Math.min(r.bottom + 4, innerHeight - 130)}px`
      document.body.append(m)
      setTimeout(() => {
        document.addEventListener('click', close, true)
        document.addEventListener('scroll', gone, { capture: true, passive: true })
      }, 0)
    }

    const off = onSweep('notInterested', () => {
      readInit()
      for (const el of document.querySelectorAll(CARD)) {
        if (el.querySelector(':scope > .ytx-ni') || el.parentElement?.closest(CARD)) continue
        const id = idOfCard(el)
        if (!id || !map.get(id)) continue
        const b = document.createElement('button')
        b.className = 'ytx-ni'
        b.setAttribute('data-ytx-own', '')
        b.setAttribute('aria-label', 'Weg damit')
        b.textContent = '✕'
        b.addEventListener('click', (e) => {
          e.preventDefault()
          e.stopPropagation()
          openMenu(b, el, id)
        })
        el.append(b)
      }
    })

    return () => {
      off()
      offResp()
      style.remove()
      document.querySelectorAll('.ytx-ni, .ytx-nimenu, .ytx-nibar').forEach((e) => e.remove())
      document.querySelectorAll('[data-ytx-ni]').forEach((e) => e.removeAttribute('data-ytx-ni'))
    }
  },
  health() {
    return { status: 'ok', detail: `${document.querySelectorAll('.ytx-ni').length} Knöpfe auf dieser Seite` }
  }
}
