// stellt die gm funktionen bereit wie violentmonkey, laeuft in der seite vor dem ytx code
// die app wird ueber window.webkit.messageHandlers[NAME] angesprochen, Antworten kommen ueber window[RECV]
// nur text wird uebergeben, NAME und RECV sind pro Start zufaellig
function ytxShim(NAME, RECV, VALUES, VERSION) {
  const values = VALUES
  const listeners = new Map()
  const xhrs = new Map()
  let nextId = 1
  const copy = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)))
  const handler = window.webkit.messageHandlers[NAME]
  const send = (m) => handler.postMessage(JSON.stringify(m))

  Object.defineProperty(window, RECV, {
    configurable: true,
    value: (m) => {
      if (m.t === 'xhr') {
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
    },
  })

  const def = (name, value) => Object.defineProperty(window, name, { value, configurable: true, writable: true })
  def('unsafeWindow', window)
  def('GM_info', { script: { name: 'ytx', version: VERSION }, scriptHandler: 'ytx-ios', version: VERSION })
  def('GM_getValue', (k, d) => (Object.prototype.hasOwnProperty.call(values, k) ? copy(values[k]) : d))
  def('GM_setValue', (k, v) => {
    values[k] = copy(v)
    send({ t: 'set', k, v: JSON.stringify(values[k]) })
  })
  def('GM_deleteValue', (k) => {
    delete values[k]
    send({ t: 'del', k })
  })
  def('GM_listValues', () => Object.keys(values))
  // jede Seite hat ihr eigenes Fenster, Aenderungen aus einem anderen Tab gibt es in der App nicht
  def('GM_addValueChangeListener', (k, fn) => {
    const id = nextId++
    listeners.set(id, { k, fn })
    return id
  })
  def('GM_removeValueChangeListener', (id) => listeners.delete(id))
  def('GM_setClipboard', (text) => send({ t: 'clip', text: String(text) }))
  def('__ytxNative', (o) => send({ t: 'app', a: String(o && o.a).slice(0, 20) }))
  def('__ytxAppLog', (...a) => send({ t: 'log', text: a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ') }))
  def('__ytxBrowserCopy', (text) => send({ t: 'clip', text: String(text) }))
  def('GM_xmlhttpRequest', (d) => {
    const id = nextId++
    xhrs.set(id, d)
    const data = d.data == null ? null : typeof d.data === 'string' ? d.data : JSON.stringify(d.data)
    send({ t: 'xhr', id, url: d.url, method: d.method || 'GET', headers: d.headers || {}, data, timeout: d.timeout || 0 })
    return { abort: () => xhrs.delete(id) }
  })

  // hintergrundfarbe der seite an die app melden, damit der Rand um die Seite passt
  let last = ''
  const report = () => {
    const el = document.body || document.documentElement
    if (!el) return
    let bg = getComputedStyle(el).backgroundColor
    if (!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') bg = getComputedStyle(document.documentElement).backgroundColor
    if (!bg || bg === last || bg === 'rgba(0, 0, 0, 0)') return
    last = bg
    send({ t: 'theme', bg })
  }
  setInterval(report, 1500)
}
