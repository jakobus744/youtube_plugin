import { ytcfg } from './bridge.js'

// aufrufe an youtubes eigene schnittstelle mit der anmeldung der seite, so wie youtube selbst sie stellt

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

async function authHeader() {
  const sid = document.cookie.match(/(?:^|;\s*)(?:SAPISID|__Secure-3PAPISID)=([^;]+)/)?.[1]
  if (!sid) return null
  const ts = Math.floor(Date.now() / 1000)
  const h = hex(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(`${ts} ${sid} ${location.origin}`)))
  return `SAPISIDHASH ${ts}_${h}`
}

export async function innertubePost(path, body) {
  const auth = await authHeader()
  const key = ytcfg('INNERTUBE_API_KEY')
  const context = ytcfg('INNERTUBE_CONTEXT')
  if (!auth || !key || !context) return false
  const r = await fetch(`/youtubei/v1/${path}?key=${key}&prettyPrint=false`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json', authorization: auth, 'x-origin': location.origin, 'x-goog-authuser': '0' },
    body: JSON.stringify({ context, ...body })
  })
  return r.ok ? r.json().catch(() => null) : false
}
