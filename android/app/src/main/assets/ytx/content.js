// startet ytx in der seite und stellt die gm funktionen bereit wie violentmonkey
// seite und erweiterung reden ueber events mit zufaelligem namen, nur text wird uebergeben

// laeuft in der seite, vor dem ytx code
function pageShim(CH, VALUES, VERSION) {
  const values = VALUES
  const listeners = new Map()
  const xhrs = new Map()
  let nextId = 1
  const copy = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)))
  const send = (m) => document.dispatchEvent(new CustomEvent(`${CH}>`, { detail: JSON.stringify(m) }))

  document.addEventListener(`${CH}<`, (e) => {
    let m
    try {
      m = JSON.parse(e.detail)
    } catch {
      return
    }
    if (m.t === 'changed') {
      const old = values[m.k]
      if (m.v === undefined) delete values[m.k]
      else values[m.k] = m.v
      for (const l of listeners.values()) {
        if (l.k !== m.k) continue
        try {
          l.fn(m.k, copy(old), copy(m.v), true)
        } catch (err) {
          console.error('[ytx app]', err)
        }
      }
    } else if (m.t === 'xhr') {
      const d = xhrs.get(m.id)
      if (!d) return
      xhrs.delete(m.id)
      if (m.timeout) return d.ontimeout?.({})
      if (m.error) return d.onerror?.({ error: m.error, status: 0 })
      const r = { status: m.status, statusText: m.statusText, responseText: m.responseText, finalUrl: m.finalUrl, responseHeaders: m.responseHeaders, readyState: 4 }
      r.response = m.responseText
      if (d.responseType === 'json') {
        try {
          r.response = JSON.parse(m.responseText)
        } catch {
          r.response = null
        }
      }
      d.onload?.(r)
      d.onloadend?.(r)
    }
  })

  const def = (name, value) => Object.defineProperty(window, name, { value, configurable: true, writable: true })
  def('unsafeWindow', window)
  def('GM_info', { script: { name: 'ytx', version: VERSION }, scriptHandler: 'ytx-app', version: VERSION })
  def('GM_getValue', (k, d) => (Object.prototype.hasOwnProperty.call(values, k) ? copy(values[k]) : d))
  def('GM_setValue', (k, v) => {
    values[k] = copy(v)
    send({ t: 'set', k, v: values[k] })
  })
  def('GM_deleteValue', (k) => {
    delete values[k]
    send({ t: 'del', k })
  })
  def('GM_listValues', () => Object.keys(values))
  def('GM_addValueChangeListener', (k, fn) => {
    const id = nextId++
    listeners.set(id, { k, fn })
    return id
  })
  def('GM_removeValueChangeListener', (id) => listeners.delete(id))
  // ueber die app, android braucht dafuer keinen frischen fingertipp wie der browser
  def('GM_setClipboard', (text) => {
    send({ t: 'clip', text: String(text) })
  })
  // meldungen fuer das android protokoll (adb logcat -s ytx-page)
  // kurze befehle an die app, etwa den mini player steuern
  def('__ytxNative', (o) => send({ t: 'app', a: String(o && o.a).slice(0, 20) }))
  def('__ytxAppLog', (...a) => send({ t: 'log', text: a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ') }))
  def('__ytxBrowserCopy', (text) => {
    const s = String(text)
    const fallback = () => {
      const ta = document.createElement('textarea')
      ta.value = s
      ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0'
      document.documentElement.append(ta)
      ta.select()
      try {
        document.execCommand('copy')
      } catch {}
      ta.remove()
    }
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(s).catch(fallback)
    else fallback()
  })
  def('GM_xmlhttpRequest', (d) => {
    const id = nextId++
    xhrs.set(id, d)
    const data = d.data == null ? null : typeof d.data === 'string' ? d.data : JSON.stringify(d.data)
    send({ t: 'xhr', id, url: d.url, method: d.method || 'GET', headers: d.headers || {}, data, timeout: d.timeout || 0 })
    return { abort: () => xhrs.delete(id) }
  })
}

;(async () => {
  const CH = `__ytx_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
  const toPage = (m) => document.dispatchEvent(new CustomEvent(`${CH}<`, { detail: JSON.stringify(m) }))
  // eigene schreibvorgaenge nicht als aenderung aus einem anderen tab melden
  const own = new Map()

  document.addEventListener(`${CH}>`, async (e) => {
    let m
    try {
      m = JSON.parse(e.detail)
    } catch {
      return
    }
    if (m.t === 'set') {
      own.set(m.k, JSON.stringify(m.v))
      browser.storage.local.set({ [`gm:${m.k}`]: m.v })
    } else if (m.t === 'del') {
      own.set(m.k, undefined)
      browser.storage.local.remove(`gm:${m.k}`)
    } else if (m.t === 'app') {
      browser.runtime.sendMessage({ t: 'app', a: m.a }).catch(() => {})
    } else if (m.t === 'clip' || m.t === 'log') {
      browser.runtime.sendMessage({ t: m.t, text: String(m.text).slice(0, m.t === 'log' ? 2000 : 4000000) }).catch(() => {})
    } else if (m.t === 'xhr') {
      const r = await browser.runtime.sendMessage(m).catch((err) => ({ error: String(err) }))
      toPage({ t: 'xhr', id: m.id, ...r })
    }
  })

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return
    for (const [key, ch] of Object.entries(changes)) {
      if (!key.startsWith('gm:')) continue
      const k = key.slice(3)
      const nv = ch.newValue === undefined ? undefined : JSON.stringify(ch.newValue)
      if (own.has(k) && own.get(k) === nv) {
        own.delete(k)
        continue
      }
      toPage({ t: 'changed', k, v: ch.newValue })
    }
  })

  const boot = await browser.runtime.sendMessage({ t: 'boot' })
  if (!boot?.code) return
  const s = document.createElement('script')
  s.textContent = `(${pageShim})(${JSON.stringify(CH)}, ${JSON.stringify(boot.values || {})}, ${JSON.stringify(boot.version)});\n${boot.code}\n//# sourceURL=ytx.user.js`
  ;(document.head || document.documentElement).append(s)
  s.remove()

  // hintergrundfarbe der seite an die app melden, damit status- und navigationsleiste passen
  let last = ''
  const report = () => {
    const el = document.body || document.documentElement
    if (!el) return
    let bg = getComputedStyle(el).backgroundColor
    if (!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') bg = getComputedStyle(document.documentElement).backgroundColor
    if (!bg || bg === last || bg === 'rgba(0, 0, 0, 0)') return
    last = bg
    browser.runtime.sendMessage({ t: 'theme', bg, host: location.host }).catch(() => {})
  }
  setInterval(report, 1500)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && ((last = ''), report()))
})()
