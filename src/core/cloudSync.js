import { store } from './store.js'

// profile ueber nextcloud abgleichen, webdav datei ytx/profiles.json im eigenen konto
// das app passwort bleibt auf dem geraet und steht nie im export

export const CLOUD_DEFAULT_URL = 'http://pi.tail5f332e.ts.net:8181'

export function cloudConfig() {
  const c = store.settings.cloud || {}
  return { url: c.url || CLOUD_DEFAULT_URL, user: c.user || '', pass: c.pass || '' }
}

export function cloudReady() {
  const c = cloudConfig()
  return !!(c.url && c.user && c.pass)
}

function davBase(c) {
  return `${c.url.replace(/\/+$/, '')}/remote.php/dav/files/${encodeURIComponent(c.user)}/ytx`
}

function request(method, url, c, body) {
  return new Promise((resolve, reject) => {
    if (typeof GM_xmlhttpRequest !== 'function') return reject(new Error('GM_xmlhttpRequest nicht verfügbar'))
    const headers = { Authorization: `Basic ${btoa(unescape(encodeURIComponent(`${c.user}:${c.pass}`)))}` }
    if (body != null) headers['Content-Type'] = 'application/json'
    GM_xmlhttpRequest({
      url,
      method,
      headers,
      data: body ?? null,
      timeout: 20000,
      onload: (r) => resolve({ status: r.status, text: r.responseText }),
      onerror: () => reject(new Error('Server nicht erreichbar (VPN/Tailscale an?)')),
      ontimeout: () => reject(new Error('Zeitüberschreitung'))
    })
  })
}

const fail = (r) => new Error(r.status === 401 ? 'Anmeldung abgelehnt, App-Passwort prüfen' : `HTTP ${r.status}`)

export async function cloudPush() {
  const c = cloudConfig()
  const base = davBase(c)
  const mk = await request('MKCOL', base, c)
  // 405 heisst der ordner ist schon da
  if (![201, 405].includes(mk.status)) throw fail(mk)
  const put = await request('PUT', `${base}/profiles.json`, c, store.exportJson(true))
  if (put.status < 200 || put.status >= 300) throw fail(put)
  return 'Profile hochgeladen'
}

export async function cloudPull() {
  const c = cloudConfig()
  const r = await request('GET', `${davBase(c)}/profiles.json`, c)
  if (r.status === 404) throw new Error('Noch nichts hochgeladen')
  if (r.status < 200 || r.status >= 300) throw fail(r)
  return store.importJson(r.text)
}
