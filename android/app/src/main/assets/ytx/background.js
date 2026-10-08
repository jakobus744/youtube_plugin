// hintergrund der eingebauten erweiterung
// liefert ytx code und gespeicherte werte, holt updates von github, leitet anfragen weiter

const RAW = 'https://raw.githubusercontent.com/jakobus744/youtube_plugin/main/dist/ytx.user.js'
const UPDATE_EVERY = 6 * 3600 * 1000
// wie @connect im userscript
const XHR_HOSTS = ['musicbrainz.org', 'ws.audioscrobbler.com', 'pi.tail5f332e.ts.net', '100.116.11.12', '192.168.178.56', 'jakobpi.duckdns.org']

let code = ''
let version = '0'

const verOf = (c) => (String(c).match(/@version\s+([\d.]+)/) || [])[1] || '0'

function cmp(a, b) {
  const x = a.split('.').map(Number)
  const y = b.split('.').map(Number)
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0)
    if (d) return d > 0 ? 1 : -1
  }
  return 0
}

function native(msg) {
  try {
    browser.runtime.sendNativeMessage('ytx', msg).catch(() => {})
  } catch {}
}

// mitgelieferte version, ausser github hatte schon eine neuere
async function load() {
  const base = await (await fetch(browser.runtime.getURL('ytx.user.js'))).text()
  const st = await browser.storage.local.get(['code', 'codeVersion'])
  if (st.code && st.codeVersion && cmp(st.codeVersion, verOf(base)) > 0) {
    code = st.code
    version = st.codeVersion
  } else {
    code = base
    version = verOf(base)
    if (st.code) await browser.storage.local.remove(['code', 'codeVersion'])
  }
}
const ready = load()

async function checkUpdate() {
  try {
    const r = await fetch(`${RAW}?t=${Date.now()}`, { cache: 'no-store' })
    if (!r.ok) return
    const c = await r.text()
    const v = verOf(c)
    await ready
    if (!c.includes('==UserScript==') || cmp(v, version) <= 0) return
    await browser.storage.local.set({ code: c, codeVersion: v })
    code = c
    version = v
    native({ t: 'updated', version: v })
  } catch {}
}
setTimeout(checkUpdate, 8000)
setInterval(checkUpdate, UPDATE_EVERY)

async function values() {
  const all = await browser.storage.local.get(null)
  const out = {}
  for (const [k, v] of Object.entries(all)) if (k.startsWith('gm:')) out[k.slice(3)] = v
  return out
}

// gm_xmlhttpRequest ueber die erweiterung, damit cors egal ist
async function xhr(m) {
  let host = ''
  try {
    host = new URL(m.url).hostname
  } catch {}
  if (!XHR_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return { error: `host nicht erlaubt: ${host}` }
  const ctl = new AbortController()
  const timer = m.timeout ? setTimeout(() => ctl.abort(), m.timeout) : null
  try {
    const r = await fetch(m.url, { method: m.method || 'GET', headers: m.headers || {}, body: m.data ?? undefined, signal: ctl.signal })
    const text = await r.text()
    return { status: r.status, statusText: r.statusText, responseText: text, finalUrl: r.url, responseHeaders: [...r.headers].map(([k, v]) => `${k}: ${v}`).join('\r\n') }
  } catch (e) {
    return ctl.signal.aborted ? { timeout: true } : { error: String(e?.message || e) }
  } finally {
    if (timer) clearTimeout(timer)
  }
}

browser.runtime.onMessage.addListener((m) => {
  if (m?.t === 'boot') return ready.then(async () => ({ code, version, values: await values() }))
  if (m?.t === 'xhr') return xhr(m)
  if (m?.t === 'theme' || m?.t === 'clip' || m?.t === 'log' || m?.t === 'app') native(m)
  if (m?.t === 'update') return checkUpdate().then(() => ({ version }))
  return undefined
})

// youtube verbietet eingefuegte skripte per csp und trusted types
// die app laeuft nur auf youtube, deshalb faellt die csp dort weg, sonst koennte ytx nicht starten
browser.webRequest.onHeadersReceived.addListener(
  (details) => ({ responseHeaders: details.responseHeaders.filter((h) => !/^content-security-policy$/i.test(h.name)) }),
  { urls: ['https://www.youtube.com/*', 'https://m.youtube.com/*', 'https://music.youtube.com/*'], types: ['main_frame', 'sub_frame'] },
  ['blocking', 'responseHeaders']
)
